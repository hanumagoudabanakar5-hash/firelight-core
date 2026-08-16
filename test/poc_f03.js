const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-03: periodAtTimestamp underflow', function() {

  it('reverts when timestamp is before epoch', async () => {

    const { firelight_vault } = await loadFixture(deployVault)

    // Get the current period configuration
    const config = await firelight_vault.periodConfigurationAtTimestamp(
      Math.floor(Date.now() / 1000)
    )
    console.log('Epoch:', config.epoch.toString())
    console.log('Duration:', config.duration.toString())

    // Call periodAtTimestamp with timestamp BEFORE the epoch
    // This causes uint48 underflow: timestamp - epoch = huge number or revert
    const beforeEpoch = config.epoch - 1n

    console.log('Calling periodAtTimestamp with timestamp before epoch:', beforeEpoch.toString())

    // This should revert due to underflow
    await expect(
      firelight_vault.periodAtTimestamp(beforeEpoch)
    ).to.be.reverted

    console.log('CONFIRMED: Function reverts when timestamp < epoch')
    console.log('Any function calling periodAtTimestamp with past timestamp is broken')

  })
})
