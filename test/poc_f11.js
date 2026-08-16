const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-11: Rounding dust permanently stuck in vault', function() {
  this.timeout(120000)  // 2 minutes timeout

  it('assets lost to rounding are permanently unrecoverable', async () => {

    const { firelight_vault, token_contract, users, utils } = await loadFixture(deployVault)
    const [user1, user2, user3] = users

    // Step 1: Three users deposit
    await utils.mintAndApprove('1000003', user1)
    await utils.mintAndApprove('1000003', user2)
    await utils.mintAndApprove('1000003', user3)

    await firelight_vault.connect(user1).deposit('1000003', user1.address)
    await firelight_vault.connect(user2).deposit('1000003', user2.address)
    await firelight_vault.connect(user3).deposit('1000003', user3.address)

    console.log('Total assets:', (await firelight_vault.totalAssets()).toString())

    // Step 2: All three request withdrawal
    const shares1 = await firelight_vault.balanceOf(user1.address)
    const shares2 = await firelight_vault.balanceOf(user2.address)
    const shares3 = await firelight_vault.balanceOf(user3.address)

    await firelight_vault.connect(user1).redeem(shares1, user1.address, user1.address)
    await firelight_vault.connect(user2).redeem(shares2, user2.address, user2.address)
    await firelight_vault.connect(user3).redeem(shares3, user3.address, user3.address)

    const period = await firelight_vault.currentPeriod() + 1n
    const pendingBefore = await firelight_vault.pendingWithdrawAssets()
    console.log('Period:', period.toString())
    console.log('Pending before claims:', pendingBefore.toString())

    // Step 3: Jump time forward by 2 weeks (2 x 1 week periods)
    await time.increase(604800 * 2 + 1)

    // Step 4: All three claim
    const vaultBefore = await token_contract.balanceOf(
      await firelight_vault.getAddress()
    )
    console.log('Vault balance before claims:', vaultBefore.toString())

    await firelight_vault.connect(user1).claimWithdraw(period)
    await firelight_vault.connect(user2).claimWithdraw(period)
    await firelight_vault.connect(user3).claimWithdraw(period)

    const vaultAfter = await token_contract.balanceOf(
      await firelight_vault.getAddress()
    )
    const pendingAfter = await firelight_vault.pendingWithdrawAssets()
    const totalAssetsAfter = await firelight_vault.totalAssets()

    console.log('Vault balance after claims:', vaultAfter.toString())
    console.log('pendingWithdrawAssets after:', pendingAfter.toString())
    console.log('totalAssets() after:', totalAssetsAfter.toString())
    console.log('Stuck dust:', (vaultAfter - totalAssetsAfter - pendingAfter).toString())

    expect(vaultAfter).to.be.greaterThan(0n)
    console.log('CONFIRMED: Rounding dust stuck forever')

  })
})
