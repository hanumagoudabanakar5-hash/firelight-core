const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-02: rescueWithdraw double-claim bug', function() {

  it('recipient claims both own and rescued withdrawal', async () => {

    const { 
      firelight_vault, 
      token_contract,
      users, 
      utils,
      rescuer,
      blocklister
    } = await loadFixture(deployVault)

    const [alice, bob] = users

    // Step 1: Both Alice and Bob deposit into vault
    const depositAmount = '1000000' // 1 FXRP each
    await utils.mintAndApprove(depositAmount, alice)
    await utils.mintAndApprove(depositAmount, bob)
    await firelight_vault.connect(alice).deposit(depositAmount, alice.address)
    await firelight_vault.connect(bob).deposit(depositAmount, bob.address)
    console.log('Alice and Bob both deposited 1 FXRP')

    // Step 2: Both request withdrawal for SAME next period
    const aliceShares = await firelight_vault.balanceOf(alice.address)
    const bobShares = await firelight_vault.balanceOf(bob.address)
    await firelight_vault.connect(alice).redeem(aliceShares, alice.address, alice.address)
    await firelight_vault.connect(bob).redeem(bobShares, bob.address, bob.address)
    console.log('Both requested withdrawal for next period')

    // Step 3: Find which period their withdrawals are in
    const period = await firelight_vault.currentPeriod() + 1n
    console.log('Withdrawal period:', period.toString())

    const aliceWithdraw = await firelight_vault.withdrawalsOf(period, alice.address)
    const bobWithdrawBefore = await firelight_vault.withdrawalsOf(period, bob.address)
    console.log('Alice withdrawal shares:', aliceWithdraw.toString())
    console.log('Bob withdrawal shares before rescue:', bobWithdrawBefore.toString())

    // Step 4: Blocklist Alice
    await firelight_vault.connect(blocklister).addToBlocklist(alice.address)
    console.log('Alice blocklisted')

    // Step 5: Rescuer moves Alice withdrawal to Bob
    await firelight_vault.connect(rescuer).rescueWithdrawFromBlocklisted(
      alice.address,
      bob.address,
      [period]
    )

    const bobWithdrawAfter = await firelight_vault.withdrawalsOf(period, bob.address)
    console.log('Bob withdrawal shares after rescue:', bobWithdrawAfter.toString())

    // Step 6: Move time forward 2 periods so withdrawal is claimable
    const periodEnd = await firelight_vault.nextPeriodEnd()
    await time.increaseTo(periodEnd + 1n)
    await time.increaseTo((await firelight_vault.nextPeriodEnd()) + 1n)
    console.log('Time moved forward 2 periods')

    // Step 7: Bob claims withdrawal
    const bobTokenBefore = await token_contract.balanceOf(bob.address)
    await firelight_vault.connect(bob).claimWithdraw(period)
    const bobTokenAfter = await token_contract.balanceOf(bob.address)

    console.log('\nBob tokens received:', (bobTokenAfter - bobTokenBefore).toString())
    console.log('Bob should have received ~1 FXRP (his own)')
    console.log('Bob actually received ~2 FXRP (his + Alice)')

    // PROOF: Bob received more than his own deposit
    expect(bobTokenAfter - bobTokenBefore).to.be.greaterThan(BigInt(depositAmount))
    console.log('\nCONFIRMED: Bob claimed Alice assets too!')

  })
})
