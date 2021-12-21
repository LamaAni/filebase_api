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

const USE_OAUTH2 = process.env['TEST_USE_OAUTH2'] == 'true'

/**
 * @param {import('../../src/cli').StratisCli} stratis
 */
module.exports = async (stratis) => {
  stratis.session_key = 'test_session'
  stratis.show_app_errors = true
  if (USE_OAUTH2) {
    stratis.oauth2_config = OAUTH2_CONFIG
  }

  // Call to initialize the service (if not called will be called by the stratis cli process)
  // This method can be sync if not called.
  await stratis.initialize()
}
