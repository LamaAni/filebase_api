const superagent = require('superagent')

const {
  assert,
  assert_non_empty_string,
  is_non_empty_string,
  is_valid_url,
  get_express_request_url,
} = require('../common')

/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 */

/**
 * @typedef {Object} OAuthAuthenticationState
 * @property {string} uuid
 * @property {string} origin
 * @property {number} timestamp
 **/

/**
 * @typedef {Object} OAuthSessionParams
 * @property {OAuthAuthenticationState} state
 * @property {string} access_token
 * @property {string} id_token
 * @property {number} expires_in
 * @property {string} token_type
 * @property {string} scope
 * @property {string} refresh_token
 * @property {string} timestamp
 */

/**
 * @typedef {Object} StratisOAuth2ProviderOptions
 * @property {string} client_id
 * @property {string} client_secret
 * @property {string} authentication_host The hostname for the authentication. e.g. https://accounts.google.com/o/oauth2/v2/auth
 * @property {string|URL} token_url The token service url, e.g. https://accounts.google.com/o/oauth2/v2/auth
 * @property {string|URL} authorize_url The authorize service url, defaults to token_url
 * @property {string} authorize_path The path for authorization, overrides authorize_url path
 * @property {string} revoke_path The path for revoke, overrides token_url path
 * @property {string} token_path The path for a token, overrides token_url path
 * @property {string|URL} redirect_url The server response redirect url. If null takes the current request url as redirect url.
 * @property {'json' |'form'} body_format The request body format.
 * @property {"header" | "body"} authorization_method
 * @property {[string]} scope the scope to use.
 * @property {string} session_key The session key to use when recording the oauth token
 * @property {boolean} return_errors_to_client If true, write the error value to the client response.
 * @property {(req:Request)=>{}} state_generator The oauth state generator.
 * @property {number} recheck_interval The number of miliseconds before revalidating the token.
 * @property {string} response_type The authentication type. Currently supports only code.
 */

class StratisOAuth2Provider {
  /** @param {StratisOAuth2ProviderOptions} param0 */
  constructor({
    client_id,
    client_secret,
    token_url,
    authorize_url = null,
    authorize_path = null,
    revoke_path = null,
    token_path = null,
    redirect_url = null,
    body_format = 'form',
    authorization_method = 'header',
    scope = [],
    session_key = 'stratis:oauth2:token',
    return_errors_to_client = true,
    response_type = 'code',
    recheck_interval = 1000 * 60 * 5,
    state_generator = null,
  } = {}) {
    assert_non_empty_string(client_id, 'client_id must be a non empty string')
    assert_non_empty_string(
      client_secret,
      'client_secret must be a non empty string'
    )

    assert(
      scope instanceof Array && scope.every((v) => is_non_empty_string(v)),
      'scope must be a non empty string'
    )
    assert_non_empty_string(
      body_format,
      'body_format must be a non empty string'
    )
    assert_non_empty_string(
      authorization_method,
      'authorization_method must be a non empty string'
    )

    assert_non_empty_string(
      session_key,
      'session_key must be a non empty string'
    )

    assert(
      is_valid_url(token_url),
      'authorize_url must be a URL or a non empty string'
    )
    assert(
      authorize_url == null || is_valid_url(authorize_url),
      'authorize_url must be null, a URL or a non empty string'
    )
    assert(
      redirect_url == null || is_valid_url(redirect_url),
      'authorize_url must be null, a URL or a non empty string'
    )

    this.client_id = client_id
    this.client_secret = client_secret
    this.return_errors_to_client = return_errors_to_client == true

    this.token_url = new URL(token_url)
    this.authorize_url = authorize_url == null ? null : new URL(authorize_url)
    this.body_format = body_format
    this.authorization_method = authorization_method

    this.authorize_path = authorize_path || this.authorize_url.pathname
    this.revoke_path = revoke_path || this.authorize_url.pathname
    this.token_path = token_path || this.authorize_url.pathname
    this.redirect_url = redirect_url
    this.response_type = response_type

    this.scope = scope
    this.session_key = session_key
    this.state_generator = state_generator
    this.recheck_interval = 1000
  }

  static create_uuid() {
    const S4 = function () {
      return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1)
    }
    return (
      S4() +
      S4() +
      '-' +
      S4() +
      '-' +
      S4() +
      '-' +
      S4() +
      '-' +
      S4() +
      S4() +
      S4()
    )
  }

  /**
   * @param {OAuthAuthenticationState} state
   * @returns {string}
   */
  encode_state(state) {
    return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url')
  }

  /**
   * @param {string} state
   * @returns {OAuthAuthenticationState}
   */
  decode_state(state) {
    const state_json = Buffer.from(state, 'base64url').toString('utf-8')
    return JSON.parse(state_json)
  }

  /**
   * @param {Request} req
   * @returns {OAuthSessionParams} The current session params
   */
  read_oauth_session_params(req) {
    let session_value =
      req.session == null ? null : req.session[this.session_key]
    if (session_value == null) return null
    if (typeof session_value == 'string')
      try {
        session_value = JSON.parse(session_value)
      } catch (err) {
        session_value = {}
      }
    return session_value
  }

  /**
   * @param {Request} req
   * @param {Response} res
   * @param {OAuthSessionParams} session_params
   */
  write_oauth_session_params(req, res, session_params) {
    req.session[this.session_key] = session_params
    return session_params
  }

  /**
   * @param {string} auth_redirect_path The authentication path to redirect to.
   * @returns {(req:Request,res:Response, next:NextFunction)=>{}} Auth middleware
   */
  filter_middleware(auth_redirect_path) {
    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercrept = async (req, res, next) => {
      if (req.path == auth_redirect_path) return next()
      const params = this.read_oauth_session_params(req)
      let is_valid = false
      if (params != null) {
        if (params.access_token != null) {
          is_valid = true
        }
      }

      if (!is_valid) {
        const redirecturl = `${auth_redirect_path}?origin=${encodeURIComponent(
          req.originalUrl
        )}`

        return res.redirect(redirecturl)
      } else next()
    }
    return intercrept
  }

  /**
   * @returns {(req:Request,res:Response, next:NextFunction)=>{}} Auth middleware
   */
  auth_middleware() {
    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercept = async (req, res, next) => {
      const request_url = get_express_request_url(req)

      const query = Object.assign(
        {},
        req.query || {},
        JSON.parse(req.body || '{}')
      )

      try {
        if (query.error != null) throw new Error(`${JSON.stringify(query)}`)

        const is_authentication_redirect =
          req.query.code == null && query.origin != null
        const is_authentication_response = query.code != null

        let redirect_uri =
          this.redirect_url ||
          `${request_url.protocol}//${request_url.host}${request_url.pathname}`

        const oauth_session_params = this.read_oauth_session_params(req)

        if (is_authentication_response) {
          const auth_state = this.decode_state(req.query.state)

          assert(
            oauth_session_params != null &&
              (oauth_session_params.state || {}).uuid == auth_state.uuid,
            'Invalid token validation request, session state could not retrieve state validation key'
          )

          const token_url = new URL(this.token_url)

          Object.entries({
            client_id: this.client_id,
            client_secret: this.client_secret,
            grant_type: this.grant_type || 'authorization_code',
            code: req.query.code,
            redirect_uri: redirect_uri,
          })
            .filter((e) => e[1] != null)
            .forEach((entry) => token_url.searchParams.set(entry[0], entry[1]))

          const token = (
            await superagent
              .post(token_url.href)
              .set('Content-Type', 'application/x-www-form-urlencoded')
              .timeout(1000)
              .send()
          ).body

          this.write_oauth_session_params(
            req,
            res,
            Object.assign({}, oauth_session_params, token)
          )

          return res.redirect(oauth_session_params.state.origin)
        } else if (is_authentication_redirect) {
          const origin = query.origin || '/'

          const session_params = this.write_oauth_session_params(req, res, {
            state: Object.assign(
              {},
              this.state_generator ? await this.state_generator() : {},
              {
                timestamp: new Date().getTime(),
                uuid: StratisOAuth2Provider.create_uuid(),
                origin,
              }
            ),
          })

          const authorize_url = new URL(this.authorize_url || this.token_url)
          for (const entry of Object.entries({
            redirect_uri: redirect_uri,
            client_id: this.client_id,
            response_type: this.response_type,
            scope:
              this.scope == null || this.scope.length == 0
                ? null
                : this.scope.join(''),
            state: this.encode_state(session_params.state),
          })) {
            if (entry[1] == null) continue
            authorize_url.searchParams.set(entry[0], entry[1])
          }

          return res.redirect(authorize_url.href)
        } else {
          throw new Error('unknown auth request: ' + request_url.href)
        }
      } catch (err) {
        res.status(500)
        console.error(err)
        return res.end(
          this.return_errors_to_client
            ? `${err.stack || err}${
                err.response == null ? '' : '\n' + err.response.text
              }`
            : null
        )
      }
    }

    return intercept
  }

  /**
   * Apply the security authenticator to the express app.
   * @param {import('express').Express} app
   * @param {string} path The oauth serve path (must start with /)
   */
  apply(app, path = '/oauth2') {
    app.all(path, this.auth_middleware())
    app.use(this.filter_middleware(path))
  }
}

module.exports = {
  StratisOAuth2Provider,
}
