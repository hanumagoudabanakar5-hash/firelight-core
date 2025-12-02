module.exports = async ({ address }) => {
  await hre.run('verify:verify', {
    address,
    constructorArguments: [],
  })
}
