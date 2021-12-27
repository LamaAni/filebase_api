const ProxyAgent = require('proxy-agent')
const superagent = require('superagent')
const { CacheDictionary } = require('../webserver/collections')
const { StratisNotAuthorizedReloadError } = require('../webserver/errors')
const {
  assert,
  assert_non_empty_string,
  is_non_empty_string,
  is_valid_url,
  get_express_request_url,
  milliseconds_utc_since_epoc,
  value_from_object_path,
  sleep,
  create_uuid,
} = require('../common')

/**
 * @typedef {import('express').Express} Express
 * @typedef {import('../index').Stratis} Stratis
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 */

/**
 * @typedef {Object} StratisOAuthProviderSessionParamsState
 * @property {string} uuid
 * @property {string} origin
 * @property {number} created_at
 **/

/**
 * @typedef {Object} StratisOAuthProviderSessionParams
 * @property {StratisOAuthProviderSessionParamsState} state
 * @property {string} access_token
 * @property {string} token_type
 * @property {string} scope
 * @property {string} refresh_token
 * @property {number} authenticated The timestamp of creation (ms since epoc, utc)
 * @property {{}} token_info
 * @property {{}} token_response
 */

/**
 * @typedef {Object} StratisOAuth2ProviderOptions
 * @property {string} client_id
 * @property {string} client_secret
 * @property {string} authentication_host The hostname for the authentication. e.g. https://accounts.google.com/o/oauth2/v2/auth
 * @property {string|URL} token_url The token service url, e.g. https://accounts.google.com/o/oauth2/v2/auth
 * @property {string|URL} authorize_url The authorize service url, defaults to token_url
 * @property {string|URL} token_introspect_url The token info url, returning the state of the token.
 * @property {string|URL} user_info_url The user info url, returning the user information. If null, no user info added.
 * @property {string|URL} revoke_url The revoke url, revoking the current token. If null operation not permitted.
 * @property {stirng} basepath The path to use for the apply command (serves the oauth2 login and redirect)
 * @property {string} authorize_path The path for authorization, overrides authorize_url path
 * @property {string} revoke_path The path for revoke, overrides token_url path
 * @property {string} token_path The path for a token, overrides token_url path
 * @property {string|URL} redirect_url The server response redirect url. If null takes the current request url as redirect url.
 * @property {[string]} scope the scope to use.
 * @property {string} session_key The session key to use when recording the oauth token
 * @property {(req:Request)=>{}} state_generator The oauth state generator.
 * @property {number} recheck_interval The number of milliseconds before revalidating the token.
 * @property {number} expires_in The number of milliseconds before forcing the session to expire. If null then ignored.
 * @property {number} request_timeout The number of milliseconds for requests timeout.
 * @property {console} logger The internal logger.
 * @property {string|[string]} username_from_token_info_path The path to the username to parse out of the user info.
 * @property {string} request_user_object_key The req[key] to save the user information. defaults to user.
 * @property {string} response_type The authentication type. Currently supports only code.
 */

/**
 *
 * @param {Request} req
 */
function parse_barer_token(req) {
  const authorization =
    'authorization' in req.headers
      ? (req.headers['authorization'] || '').trim()
      : null

  if (authorization == null) return null

  const auth_barer_regex = /^bearer /gim

  if (!auth_barer_regex.test(authorization)) return null

  return authorization.replace(auth_barer_regex, '').trim()
}

/**
 * Provides information about the current stratis oauth provider session
 * and parameters.
 */
class StratisOAuthProviderSession {
  /**
   *
   * @param {StratisOAuth2Provider} provider
   * @param {Request} req the http request
   * @param {Response} res the http response
   * @param {StratisOAuthProviderSessionParams} session_params
   */
  constructor(provider, req, session_params = null) {
    this._provider = provider
    /** @type {StratisOAuthProviderSessionParams} */
    this.params = session_params || {}
    this._req = req
    this.is_bearer_token = false
    this.is_session_state = false
  }

  get req() {
    return this._req
  }

  get provider() {
    return this._provider
  }

  /**
   * Short id for the token, if any.
   */
  get token_id() {
    return this.access_token == null
      ? '??????'
      : this.access_token.substring(0, 6)
  }

  get token_info() {
    return this.params.token_info || {}
  }

  /**
   * The session params state
   * @type {StratisOAuthProviderSessionParamsState}
   */
  get state() {
    return this.params.state || {}
  }

  /**
   * @type {string}
   */
  get access_token() {
    /** @type {StratisOAuthProviderSessionParams} */
    const params = this.params || {}
    return params.access_token
  }

  /**
   * @type {string}
   */
  get username() {
    if (this.params == null || this.params.token_info == null)
      return 'Anonymous'
    if (this.params.token_info._username == null) {
      this.token_info._username =
        this.provider.username_from_token_info_path
          .map((p) => value_from_object_path(this.params.token_info, p))
          .filter((v) => v != null)[0] || 'Anonymous'
    }
    return this.params.token_info._username
  }

  get has_token_info() {
    return this.params.token_info != null
  }

  get is_authenticated() {
    return this.params.access_token != null && this.params.authenticated != null
  }

  get is_elapsed() {
    // barer tokens cannot be elapsed, since the timeout they have
    // is dependent on the backend Oauth2 provider.
    if (this.is_bearer_token) return false

    return (
      milliseconds_utc_since_epoc() - (this.params.authenticated || 0) >=
      (this.provider.expires_in || Infinity)
    )
  }

  get is_active() {
    return this.token_info.active == true
  }

  get is_access_granted() {
    if (!this.is_authenticated) return false
    if (this.is_elapsed) return false
    return true
  }

  needs_access_token_validation() {
    if (!this.is_authenticated) return false
    if (this.is_elapsed) return false

    // if no token info needs validation.
    if (!this.has_token_info) return true

    const elapsed_since_last_recheck =
      milliseconds_utc_since_epoc() - (this.params.authenticated || 0)

    return (
      elapsed_since_last_recheck >= (this.provider.recheck_interval || Infinity)
    )
  }

  /**
   * Authenticate the current access token, and mark the authenticated timestamp.
   * @param {{}} token_response The authenticated access token
   */
  async authenticate(token_response) {
    this.params.token_response = token_response
    this.params.access_token = token_response.access_token
    this.params.scope = token_response.scope
    this.params.refresh_token = token_response.refresh_token
    this.params.token_type = token_response.token_type
    this.params.authenticated = milliseconds_utc_since_epoc()

    await this.save()
  }

  /**
   * Save the current state if needed.
   */
  async save() {
    this.params.updated = milliseconds_utc_since_epoc()
    if (this.is_session_state)
      this.req.session[this.provider.session_key] = this.params
    if (this.is_bearer_token && this.access_token != null)
      this.provider.token_cache_bank.set(this.access_token, this.params)
  }

  /**
   * Loads the OAuth provider session from the request.
   * @param {StratisOAuth2Provider} provider
   * @param {Request} req
   */
  static async load(provider, req) {
    const session_value = (req.session || {})[provider.session_key] || {}
    const barer_token = parse_barer_token(req)
    const oauth_session = new StratisOAuthProviderSession(provider, req)

    // assume that if there is a bearer token then use it.
    if (barer_token != null) {
      // Loading the barer token params from the cache bank if needed.
      oauth_session.params = provider.token_cache_bank.get(barer_token) || {
        access_token: barer_token,
      }
      oauth_session.is_bearer_token = true
    } else if (req.session != null)
      try {
        oauth_session.params =
          typeof session_value == 'string'
            ? JSON.parse(session_value)
            : session_value
        oauth_session.is_session_state = true
      } catch (err) {
        throw new Error('Could not parse stratis oauth2 session value')
      }

    return oauth_session
  }

  /**
   * Sends a request to the service for updating the token info.
   */
  async update() {
    // nothing to do. Not authenticated.
    if (!this.is_authenticated) return false
    if (this.needs_access_token_validation()) {
      this.params.token_info = this.provider.token_introspect_url
        ? await this.provider.get_token_info(this.access_token)
        : {
            active: true,
          }
      // save the changes.
      await this.save()
      return true
    } else return false
  }

  /**
   * Clear the current authentication.
   */
  async clear() {
    this.params = {}
    await this.save()
  }
}

class StratisOAuth2Provider {
  /** @param {StratisOAuth2ProviderOptions} param0 */
  constructor({
    client_id,
    client_secret,
    token_url,
    authorize_url,
    token_introspect_url = null,
    user_info_url = null,
    revoke_url = null,
    redirect_url = null,
    basepath = '/oauth2',
    scope = [],
    session_key = 'stratis:oauth2:token',
    response_type = 'code',
    recheck_interval = 1000 * 60,
    expires_in = null,
    request_timeout = 1000 * 10,
    logger = console,
    request_user_object_key = 'user',
    username_from_token_info_path = ['username', 'email', 'user', 'name'],
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
      session_key,
      'session_key must be a non empty string'
    )

    const validate_urls = (urls, can_be_null = true) => {
      for (const k of Object.keys(urls))
        assert(
          (urls[k] == null && can_be_null) || is_valid_url(urls[k]),
          `${k} must be a URL or a non empty string`
        )
    }

    validate_urls({ token_url, authorize_url }, false)
    validate_urls({
      redirect_url,
      user_info_url,
      revoke_url,
      token_introspect_url,
    })

    let as_url = (v) => (v == null ? null : new URL(v))

    this.client_id = client_id
    this.client_secret = client_secret

    this.token_url = as_url(token_url)
    this.authorize_url = as_url(authorize_url)
    this.token_introspect_url = as_url(token_introspect_url)
    this.user_info_url = as_url(user_info_url)
    this.revoke_url = as_url(revoke_url)
    this.redirect_url = as_url(redirect_url)

    this.basepath = basepath
    this.response_type = response_type

    this.scope = scope
    this.session_key = session_key
    this.recheck_interval = recheck_interval
    this.request_timeout = request_timeout
    this.expires_in = expires_in
    this.logger = logger
    this.request_user_object_key = request_user_object_key
    /** @type {[string]} */
    this.username_from_token_info_path = Array.isArray(
      username_from_token_info_path
    )
      ? username_from_token_info_path
      : [username_from_token_info_path]

    assert(
      this.token_introspect_url != null || this.expires_in != null,
      'If token introspect url was not provided a session expires_in must be provided'
    )

    this._token_cache_bank = new CacheDictionary({
      cleaning_interval: recheck_interval,
      reset_cache_timestamp_on_get: true,
      interval:
        expires_in != null && expires_in > recheck_interval
          ? expires_in
          : recheck_interval * 2,
    })
  }

  /**
   * The cache token bank that allows the interface to preserve the cache
   * refresh time for the token.
   */
  get token_cache_bank() {
    return this._token_cache_bank
  }

  /**
   * @param {StratisOAuthProviderSessionParamsState} state
   * @returns {string}
   */
  encode_state(state) {
    return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url')
  }

  /**
   * @param {string} state
   * @returns {StratisOAuthProviderSessionParamsState}
   */
  decode_state(state) {
    const state_json = Buffer.from(state, 'base64url').toString('utf-8')
    return JSON.parse(state_json)
  }

  /**
   * Configures the superagent request.
   * @param {superagent.Request} request The superagent request
   * @param {boolean} use_proxies
   * @param {*} content_type
   * @returns {superagent.Request}
   */
  configure_request(
    request,
    use_proxies = true,
    content_type = 'application/x-www-form-urlencoded'
  ) {
    if (use_proxies) {
      request = request.agent(new ProxyAgent())
    }
    request = request.timeout(this.request_timeout)
    if (content_type != null)
      request = request.set('Content-Type', 'application/x-www-form-urlencoded')
    return request
  }

  /**
   * Compose a url from a base url and query arguments
   * @param {string|URL} base_url The base url to compose from
   * @param {{}} query The query arguments to compose from
   */
  compose_url(base_url, query = {}) {
    const url = new URL(base_url)
    Object.entries(query)
      .filter((entry) => entry[1] != null)
      .forEach((entry) => url.searchParams.set(entry[0], entry[1]))

    return url
  }

  /**
   * Composes a url for authorization.
   * @param {string} redirect_uri The redirect url.
   * @param {{}} state The oauth request state.
   * @returns
   */
  compose_authorize_url(redirect_uri, state = null) {
    return this.compose_url(this.authorize_url, {
      redirect_uri: redirect_uri,
      client_id: this.client_id,
      response_type: this.response_type,
      scope:
        this.scope == null || this.scope.length == 0
          ? null
          : this.scope.join(' '),
      state: this.encode_state(state),
    })
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {string} code The get token authorization steps code.
   * @param {string} redirect_uri The redirect url.
   * @returns
   */
  async get_token(code, redirect_uri) {
    const token_url = this.compose_url(this.token_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      grant_type: this.grant_type || 'authorization_code',
      code,
      redirect_uri,
    })

    return (
      await this.configure_request(superagent.post(token_url.href)).send()
    ).body
  }

  /**
   * Returns the token info using the introspect url. Sends a request to the server.
   * @param {string} token The token to get info about.
   * @param {string} token_type The token type.
   */
  async get_token_info(token, token_type = 'access_token') {
    const token_introspect_url = this.compose_url(this.token_introspect_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint: token_type,
    })

    let token_info = {}

    try {
      token_info = (
        await this.configure_request(
          superagent.post(token_introspect_url.href)
        ).send()
      ).body
    } catch (err) {
      throw new Error('Error retrieving token info.', err)
    }

    return token_info
  }

  /**
   * Sends a revoke request for a specific token.
   * @param {string} token The token
   * @param {string} token_type The token type.
   * @returns
   */
  async revoke(token, token_type = 'access_token') {
    const token_revoke_url = this.compose_url(this.revoke_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint: token_type,
    })

    const rsp = (
      await this.configure_request(
        superagent.post(token_revoke_url.href)
      ).send()
    ).body

    return rsp
  }

  /**
   * Redirect the response to login page.
   * @param {Request} req The request
   * @param {Response} res The response.
   * @returns
   */
  redirect_to_login(req, res) {
    const redirecturl = `${this.basepath}?origin=${encodeURIComponent(
      req.originalUrl
    )}`

    return res.redirect(redirecturl)
  }

  /**
   * INTERNAL. Update the request user object.
   * @param {Request} req
   * @param {StratisOAuthProviderSession} session
   */
  _update_request_user_object(req, session) {
    const current_user_object = req[this.request_user_object_key] || {}
    req[this.request_user_object_key] = Object.assign(
      typeof current_user_object != 'object' ? {} : current_user_object,
      {
        username: current_user_object.username || session.username,
        access_token: session.access_token,
        token_info: session.token_info,
      }
    )
  }

  redirect_to_revoke(req, res) {
    const redirecturl = `${
      this.basepath
    }?revoke=true&&redirect_to=${encodeURIComponent(req.originalUrl)}`

    return res.redirect(redirecturl)
  }

  /**
   * Implements the authentication check middleware. If called request
   * must be authenticated against OAuth2 to proceed. Use login_middleware
   * to create a login page redirect.
   * @returns {(req:Request,res:Response, next:NextFunction)=>{}} Auth middleware
   */
  auth_middleware() {
    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercrept = async (req, res, next) => {
      if (req.path == this.basepath) return next()

      try {
        const oauth_session = await StratisOAuthProviderSession.load(this, req)
        req.stratis_oauth_session = oauth_session

        // check for token updates.
        if (await oauth_session.update()) {
          this.logger.debug(
            `Authentication info updated for ${oauth_session.username}. (TID: ${
              oauth_session.token_id
            }, Access ${
              oauth_session.is_access_granted ? 'GRANTED' : 'DENIED'
            })`
          )
        }

        if (!oauth_session.is_authenticated) {
          return this.redirect_to_login(req, res)
        }
        if (!oauth_session.is_active || oauth_session.is_elapsed == true)
          return this.redirect_to_revoke(req, res)

        // updating the user object.
        this._update_request_user_object(req, oauth_session)
      } catch (err) {
        return next(err)
      }
      return next()
    }

    return intercrept
  }

  /**
   * A login page middleware, must have a specific path. The login middleware
   * redirects to a specific login backed (e.g. google, amazon ... )
   * using authentication schema.
   * @returns {(req:Request,res:Response, next:NextFunction)=>{}} Auth middleware
   */
  login_middleware() {
    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercept = async (req, res, next) => {
      const request_url = get_express_request_url(req)
      const oauth_redirect_uri =
        this.redirect_url ||
        `${request_url.protocol}//${request_url.host}${request_url.pathname}`

      const query = Object.assign(
        {},
        req.query || {},
        JSON.parse(req.body || '{}')
      )

      /**
       * @returns {'authenticate'|'authentication_response'|'revoke'|'unknown'}
       */
      function get_query_type() {
        if (req.query.revoke == 'true') return 'revoke'
        if (req.query.code == null && req.query.origin != null)
          return 'authenticate'
        if (req.query.state != null) return 'authentication_response'
        return 'unknown'
      }

      try {
        if (query.error != null) {
          throw new Error(`${JSON.stringify(query)}`)
        }

        const oauth_session = await StratisOAuthProviderSession.load(this, req)

        switch (get_query_type()) {
          case 'authenticate': {
            const origin = query.origin || '/'
            oauth_session.params.state = {
              created_at: milliseconds_utc_since_epoc(),
              uuid: create_uuid(),
              origin,
            }

            // saving the new state.
            await oauth_session.save()

            const authorize_url = this.compose_authorize_url(
              oauth_redirect_uri,
              oauth_session.state
            )

            this.logger.debug(
              `Auth redirect when requesting origin: ${origin}. Redirect -> ${authorize_url}`
            )

            return res.redirect(authorize_url)
          }
          case 'authentication_response':
            {
              // Case we already authenticated and we need to get the token.
              /** @type {StratisOAuthProviderSessionParamsState} */
              const query_state = this.decode_state(req.query.state) || {}

              assert(
                oauth_session.params.state != null,
                'Invalid token validation request, session oauth2 state could not be read from session'
              )

              assert(
                oauth_session.params.state.uuid == query_state.uuid,
                `Invalid token validation request. UUID mismatch (${oauth_session.params.state.uuid}!=${query_state.uuid})`
              )

              await oauth_session.authenticate(
                await this.get_token(req.query.code, oauth_redirect_uri)
              )

              return res.redirect(
                query_state.origin || oauth_session.state.origin
              )
            }
            break
          case 'revoke': {
            await oauth_session.clear()

            return res.redirect(
              req.query.redirect_to ||
                `${request_url.protocol}//${request_url.host}`
            )
          }
          default:
            throw new Error(
              'Unknown authentication request type: ' + request_url.href
            )
        }
      } catch (err) {
        return next(err)
      }
    }

    return intercept
  }

  /**
   * Apply the security authenticator to the express app.
   * @param {import('express').Express} app
   * @param {string} path The oauth serve path (must start with /), defaults to this.basepath
   */
  apply(app, path = null) {
    path = path || this.basepath
    app.all(path, this.login_middleware())
    app.use(this.auth_middleware(path))
  }

  /**
   * Bins the oauth controller to a (non stratis) express app.
   * @param {Express} app
   */
  bind(app) {
    app.use(this.auth_middleware())
    app.use(this.basepath, this.login_middleware())
  }

  /**
   * Bind the current auth2 security provider to
   * the stratis api.
   * @param {Stratis} stratis
   */
  bind_stratis_api(stratis) {
    stratis.user_and_permission_options.get_user_info = async (
      stratis_request
    ) => {
      return stratis_request.request[this.request_user_object_key]
    }

    stratis.on('stratis_request', async (stratis_request) => {
      if (stratis_request.access_mode != 'secure') return

      /** @type {StratisOAuthProviderSession} */
      const oauth_session =
        stratis_request.request.stratis_oauth_session ||
        (await StratisOAuthProviderSession.load(this, stratis_request.request))

      await oauth_session.update()

      if (!oauth_session.is_access_granted)
        throw new StratisNotAuthorizedReloadError(
          'User session unauthorized or expired'
        )
    })
  }
}

module.exports = {
  StratisOAuth2Provider,
  /** @type {StratisOAuth2ProviderOptions} */
  StratisOAuth2ProviderOptions: {},
}
