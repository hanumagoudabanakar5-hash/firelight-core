# F-01: deposit() Mints Zero Shares But Transfers Assets

## Severity
Low (asset loss for individual users)

## Location
contracts/FirelightVault.sol — deposit() function, line 553

## Description
The deposit() function uses Math.Rounding.Floor when calculating
shares. When the vault share price is very high (due to yield
accumulation or donation), depositing a small amount of assets
rounds down to zero shares. The function does not check if
shares == 0 before calling _depositFunds(). Assets are transferred
from the user but zero shares are minted. The user permanently
loses their deposited assets with no recourse.

## Attack Scenario
1. Vault accumulates yield over time (share price increases)
2. Victim deposits small amount of assets
3. Share calculation rounds down to zero
4. Assets transferred from victim
5. Zero shares minted to victim
6. Victim cannot withdraw (has no shares)

## Root Cause
Missing check in deposit():
    if (shares == 0) revert InvalidAmount();

## Recommended Fix
Add zero-share guard after _previewTotals():

    (uint256 shares, ...) = _previewTotals(assets, true, Math.Rounding.Floor);
    if (shares == 0) revert InvalidAmount();  // ADD THIS LINE
    _depositFunds(...);

## Proof of Concept
See test/poc_f01.js

Results:
- Share price: 100,001 assets per share
- Victim deposited: 1 wei
- Shares received: 0
- Assets lost: 1 wei (unrecoverable)

---

# F-02: rescueWithdrawFromBlocklisted Double-Claim Bug

## Severity
Medium

## Location
contracts/FirelightVault.sol — rescueWithdrawFromBlocklisted(), line 745

## Description
When a blocklisted user's pending withdrawal is rescued to another
address, the recipient's withdrawSharesOf increases by the rescued
amount. However isWithdrawClaimed[period][to] is never set to true
after the rescue. If the recipient already has their own withdrawal
in the same period, they can claim both their own AND the rescued
shares when calling claimWithdraw(). The rescued assets are
permanently lost to the original owner.

## Attack Scenario
1. Alice and Bob both have withdrawals in period N
2. Alice gets blocklisted
3. Rescuer calls rescueWithdrawFromBlocklisted(alice, bob, [N])
4. Bob's withdrawSharesOf[N] = his own + Alice's shares
5. Bob calls claimWithdraw(N)
6. Bob receives double the assets he is entitled to
7. Alice's assets are permanently lost

## Proof of Concept Results
- Alice withdrawal shares: 1,000,000
- Bob withdrawal shares before rescue: 1,000,000
- Bob withdrawal shares after rescue: 2,000,000
- Bob tokens received: 2,000,000 (double entitlement)
- Alice assets lost: 1,000,000 permanently

## Root Cause
Missing isWithdrawClaimed reset in rescueWithdrawFromBlocklisted():
    isWithdrawClaimed[periods[i]][from] = true;
    // MISSING: isWithdrawClaimed[periods[i]][to] should be reset
    // or withdrawSharesOf[to] should be checked for existing claims

## Recommended Fix
Before adding rescued shares to recipient, check they haven't
already claimed. After rescue, track the combined entitlement
separately to prevent double-claiming.

---

# F-09: addPeriodConfiguration() No Upper Bound on Epoch

## Severity
Medium

## Location
contracts/FirelightVault.sol — _addPeriodConfiguration(), line 886

## Description
The _addPeriodConfiguration() function validates that newEpoch is
greater than nextPeriodEnd() but has NO upper bound check.
A malicious or compromised PERIOD_CONFIGURATION_UPDATE_ROLE can
set a far-future epoch (up to year 10,000) that permanently locks
the vault's period configuration. Once set, no further period
configurations can be added because currentPeriodConfiguration()
returns the old config but the array's last entry is the malicious
one, causing CurrentPeriodConfigurationNotLast revert forever.

## Impact
- Period duration can never be changed again
- Vault governance is permanently broken
- Only fix is a full contract upgrade
- No admin action can recover without upgrading

## Proof of Concept Results
- Malicious epoch set to year 10,000
- All subsequent addPeriodConfiguration() calls revert
- Vault period settings permanently locked

## Root Cause
Missing upper bound check:
    if (newEpoch > block.timestamp + MAX_EPOCH_DISTANCE)
        revert InvalidPeriodConfigurationEpoch();

## Recommended Fix
Add maximum epoch distance check, for example:
    uint48 constant MAX_EPOCH_DISTANCE = 365 days * 2;
    if (newEpoch > Time.timestamp() + MAX_EPOCH_DISTANCE)
        revert InvalidPeriodConfigurationEpoch();

---

# F-12: updateDepositLimit() Can Break Vault Deposits Silently

## Severity
Low

## Location
contracts/FirelightVault.sol — updateDepositLimit(), line 457

## Description
updateDepositLimit() only checks newLimit > 0 but has no lower
bound check against current totalAssets(). Setting the limit
below current totalAssets() causes all deposits to revert with
DepositLimitExceeded. No pause event is emitted so users are
unaware. Only fix is raising the limit again.

## Impact
- All deposits permanently broken until limit raised
- No event emitted to warn users
- Looks like a bug not a feature

## Proof of Concept Results
- User deposits 10 FXRP
- Admin lowers limit to 5 FXRP
- maxDeposit() returns 0
- All deposit attempts revert
- Vault silently broken

## Recommended Fix
Add check in updateDepositLimit():
    if (newLimit < totalAssets()) revert InvalidDepositLimit();

---

# F-13: maxWithdraw() Overstates Withdrawable Amount

## Severity
Low-Medium (ERC4626 standard violation)

## Location
contracts/FirelightVault.sol — maxWithdraw(), line 356

## Description
maxWithdraw() uses OpenZeppelin's _convertToAssets() which
internally calls super.totalAssets() — the FULL vault balance
including pendingWithdrawAssets. But the actual withdraw()
function uses totalAssets() which EXCLUDES pendingWithdrawAssets.

This causes maxWithdraw() to overstate the withdrawable amount.
According to ERC4626 standard, maxWithdraw() MUST return the
maximum amount that withdraw() would not revert for. This
violation breaks integrations and aggregators that rely on
maxWithdraw() for accurate calculations.

## Impact
- ERC4626 standard violation
- DeFi integrations that call maxWithdraw() get wrong values
- Aggregators and routers may fail or lose funds
- Users see incorrect maximum withdrawal amounts

## Root Cause
Wrong conversion function used:
    return _convertToAssets(balanceOf(owner), Math.Rounding.Floor);
Should be:
    return _convertToAssetsTotals(
        balanceOf(owner),
        totalSupply(),
        totalAssets(),
        Math.Rounding.Floor
    );

## Recommended Fix
Replace _convertToAssets with _convertToAssetsTotals in maxWithdraw()
