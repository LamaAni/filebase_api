process.env['TEST_USE_OAUTH2'] = 'true'
const { stratis } = require('./stratis.cli.test.js')

stratis.session_key = 'encrypt_with_this'
stratis.cookie_session_options = {
  name: 'test_oauth',
}

if (require.main == module) {
  stratis.run().catch((err) => {
    console.error(err)
    process.exit(err.code || 1)
  })
}
