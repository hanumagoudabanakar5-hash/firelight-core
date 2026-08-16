const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-12: updateDepositLimit below totalAssets breaks deposits', function() {
  this.timeout(120000)

  it('lowering deposit limit below totalAssets silently breaks vault', async () => {

    const { firelight_vault, users, utils, limit_updater } = await loadFixture(deployVault)
    const [user1, user2] = users

    // Step 1: User1 deposits 10 FXRP
    await utils.mintAndApprove('10000000', user1)
    await firelight_vault.connect(user1).deposit('10000000', user1.address)
    console.log('User1 deposited 10 FXRP')
    console.log('totalAssets:', (await firelight_vault.totalAssets()).toString())
    console.log('depositLimit:', (await firelight_vault.depositLimit()).toString())

    // Step 2: Admin lowers deposit limit BELOW current totalAssets
    await firelight_vault.connect(limit_updater).updateDepositLimit('5000000')
    console.log('\nDeposit limit lowered to 5 FXRP (below current 10 FXRP)')
    console.log('new depositLimit:', (await firelight_vault.depositLimit()).toString())

    // Step 3: maxDeposit now returns 0
    const maxDep = await firelight_vault.maxDeposit(user2.address)
    console.log('\nmaxDeposit for user2:', maxDep.toString())
    expect(maxDep).to.equal(0n)

    // Step 4: Any deposit attempt reverts
    await utils.mintAndApprove('1000000', user2)
    await expect(
      firelight_vault.connect(user2).deposit('1000000', user2.address)
    ).to.be.revertedWithCustomError(firelight_vault, 'DepositLimitExceeded')

    console.log('All deposits reverted — vault deposits broken')
    console.log('No pause event emitted — users unaware')
    console.log('Only fix: raise limit again (requires DEPOSIT_LIMIT_UPDATE_ROLE)')
    console.log('\nCONFIRMED: Lowering limit below totalAssets silently breaks vault')

  })
})
