const { StratisCli } = require('../../src/cli')
const path = require('path')

const serve_path = path.resolve(__dirname)

const OAUTH2_CONFIG = {
  token_url: process.env['TEST_OAUTH2_TOKEN_URL'],
  authorize_url: process.env['TEST_OAUTH2_AUTH_URL'],
  token_introspect_url: process.env['TEST_OAUTH2_TOKEN_INTROSPECT_URL'],
  user_info_url: process.env['TEST_OAUTH2_USER_INFO_URL'],
  revoke_url: process.env['TEST_OAUTH2_REVOKE_URL'],
  client_id: process.env['TEST_OAUTH2_CLIENT_ID'],
  client_secret: process.env['TEST_OAUTH2_CLIENT_SECRET'],
  recheck_interval: 10 * 1000,
  session_key: 'test_oauth_session',
  // access_validators: [{ regexp: 'zav', token_info_path: 'username' }],
  scope: ['okta.users.read.self'],
}

const stratis = new StratisCli()
stratis.session_key = 'test_session'
stratis.show_app_errors = true
stratis.oauth2_config = OAUTH2_CONFIG
stratis.serve_path = serve_path
stratis.init_script_path = path.join(serve_path, 'startis_init.js')

stratis.run().catch((err) => {
  console.error(err)
  process.exit(err.code || 1)
})
