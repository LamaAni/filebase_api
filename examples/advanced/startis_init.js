function get_oauth2_test_config() {
  return {
    service_url: process.env['TEST_OAUTH2_SERVICE_URL'],
    client_id: process.env['TEST_OAUTH2_CLIENT_ID'],
    client_secret: process.env['TEST_OAUTH2_CLIENT_SECRET'],
    recheck_interval: 10 * 1000,
    session_key: 'test_oauth_session',
    scope: ['okta.users.read.self'],
  }
}

/**
 * @param {import('../../src/cli').StratisCli} stratis
 */
module.exports = async (stratis) => {
  stratis.session_key = stratis.session_key || 'test_session'
  stratis.show_app_errors = true
  if (process.env['TEST_USE_OAUTH2'] == 'true') {
    stratis.oauth2_config = get_oauth2_test_config()
    stratis.api.session_options.is_permitted =
      /**
       * Extra oauth validation options. Can be NULL.
       * @param {StratisRequest} stratis_request
       * @returns
       */
      async (stratis_request, ...args) => {
        return true
      }
  }

  // Call to initialize the service (if not called will be called by the stratis cli process)
  // This method can be sync if not called.
  await stratis.initialize()
}
