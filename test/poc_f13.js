const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-13: maxWithdraw() overstates withdrawable amount', function() {
  this.timeout(120000)

  it('maxWithdraw returns more than actually withdrawable', async () => {

    const { firelight_vault, users, utils } = await loadFixture(deployVault)
    const [user1, user2] = users

    // Step 1: Both users deposit
    await utils.mintAndApprove('10000000', user1)
    await utils.mintAndApprove('10000000', user2)
    await firelight_vault.connect(user1).deposit('10000000', user1.address)
    await firelight_vault.connect(user2).deposit('10000000', user2.address)

    console.log('Both deposited 10 FXRP each')
    console.log('totalAssets:', (await firelight_vault.totalAssets()).toString())

    // Step 2: User2 requests withdrawal
    // This adds to pendingWithdrawAssets
    const shares2 = await firelight_vault.balanceOf(user2.address)
    await firelight_vault.connect(user2).redeem(shares2, user2.address, user2.address)

    const pending = await firelight_vault.pendingWithdrawAssets()
    const totalAssets = await firelight_vault.totalAssets()
    console.log('\nAfter user2 requests withdrawal:')
    console.log('pendingWithdrawAssets:', pending.toString())
    console.log('totalAssets():', totalAssets.toString())

    // Step 3: Check maxWithdraw for user1
    const maxW = await firelight_vault.maxWithdraw(user1.address)
    console.log('\nmaxWithdraw for user1:', maxW.toString())

    // Step 4: User1 tries to withdraw exactly maxWithdraw amount
    // This should succeed according to ERC4626 standard
    // But it may revert because maxWithdraw overstates
    const shares1 = await firelight_vault.balanceOf(user1.address)
    
    try {
      await firelight_vault.connect(user1).withdraw(maxW, user1.address, user1.address)
      console.log('Withdrawal succeeded')
    } catch(e) {
      console.log('Withdrawal REVERTED even though maxWithdraw said it was ok!')
      console.log('Error:', e.message.slice(0, 100))
    }

    // Step 5: Show the discrepancy
    console.log('\nmaxWithdraw reported:', maxW.toString())
    console.log('pendingWithdrawAssets:', pending.toString())
    console.log('actual totalAssets:', totalAssets.toString())
    console.log('ERC4626 violation: maxWithdraw should never exceed what withdraw() allows')

  })
})
