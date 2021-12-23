process.env['TEST_USE_OAUTH2'] = 'true'
const { stratis } = require('./stratis.cli.test.js')

if (require.main == module) {
  stratis.run().catch((err) => {
    console.error(err)
    process.exit(err.code || 1)
  })
}
