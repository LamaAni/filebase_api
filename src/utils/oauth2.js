const { AuthorizationCode } = require('simple-oauth2')

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
 * @typedef {Object} OAuthSessionParams
 * @property {string} access_token
 * @property {string} id_token
 * @property {number} expires_in
 * @property {string} token_type
 * @property {string} scope
 * @property {string} refresh_token
 * @property {Object} state
 * @property {string} uuid
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
 * @property {(req:Request)=>{}} state_generator The oauth state generator.
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
    body_format = 'json',
    authorization_method = 'header',
    scope = ['email'],
    session_key = 'stratis:oauth2:token',
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

    this.token_url = new URL(token_url)
    this.authorize_url = authorize_url == null ? null : new URL(authorize_url)
    this.body_format = body_format
    this.authorization_method = authorization_method

    this.authorize_path = authorize_path || this.authorize_url.pathname
    this.revoke_path = revoke_path || this.authorize_url.pathname
    this.token_path = token_path || this.authorize_url.pathname
    this.redirect_url = redirect_url

    this.scope = scope
    this.session_key = session_key
    this.state_generator = state_generator
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

  create_client() {
    const token_url = this.token_url
    const authorize_url = this.authorize_url || this.token_url

    return new AuthorizationCode({
      options: {
        bodyFormat: this.body_format,
        authorizationMethod: this.authorization_method,
      },
      client: {
        id: this.client_id,
        secret: this.client_secret,
      },
      auth: {
        tokenHost: `${token_url.protocol}//${token_url.host}`,
        authorizeHost: `${authorize_url.protocol}//${authorize_url.host}`,
        // paths
        tokenPath: this.token_path || token_url.pathname,
        revokePath: this.revoke_path || token_url.pathname,
        authorizePath: this.authorize_path || authorize_url.pathname,
      },
    })
  }

  /**
   * @param {Request} req
   * @returns {OAuthSessionParams} The current session params
   */
  read_oauth_session_params(req) {
    const session_value =
      req.session == null ? null : req.session[this.session_key]
    return session_value != null
      ? JSON.parse(
          Buffer.from(req.session[this.session_key], 'base64').toString('utf-8')
        )
      : null
  }

  /**
   * @param {Request} req
   * @param {Response} res
   * @param {OAuthSessionParams} session_params
   */
  write_oauth_session_params(req, res, session_params) {
    const encoded_state = Buffer.from(
      JSON.stringify(session_params),
      'utf-8'
    ).toString('base64')
    req.session[this.session_key] = encoded_state
    return encoded_state
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
      const client = this.create_client()
      const request_url = get_express_request_url(req)
      const is_authentication_response = [
        'response_type',
        'code',
        'scope',
        'state',
      ].every((k) => k in request_url.searchParams)

      const oauth_session_params = this.read_oauth_session_params(req)

      const redirect_uri =
        this.redirect_url ||
        `${request_url.protocol}://${request_url.host}/${request_url.pathname}`

      if (is_authentication_response) {
        assert(
          oauth_session_params != null &&
            oauth_session_params.state == request_url.searchParams['state'],
          'Invalid token validation request, session state could not retrieve state validation key'
        )

        const token = await client.getToken({
          code: request_url.searchParams['code'],
          redirect_uri: redirect_uri,
          scope: request_url.searchParams['scope'],
        })

        this.write_oauth_session_params(
          req,
          res,
          Object.assign({}, oauth_session_params, token)
        )

        return res.redirect(oauth_session_params.state.origin)
      } else {
        const origin_request = request_url.searchParams['origin']

        const encoded_state = this.write_oauth_session_params(req, res, {
          state: Object.assign(
            {},
            this.state_generator ? await this.state_generator() : {},
            {
              timestamp: new Date().getTime(),
              uuid: StratisOAuth2Provider.create_uuid(),
              origin: origin_request,
            }
          ),
        })

        res.redirect(
          client.authorizeURL({
            redirect_uri: redirect_uri,
            client_id: this.client_id,
            scope: this.scope,
            state: encoded_state,
          })
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
