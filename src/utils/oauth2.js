const { StratisRequestsClient } = require('./requests')
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
 * @typedef {import('./requests').StratisRequestOptions} StratisRequestOptions
 * @typedef {import('express').Express} Express
 * @typedef {import('../webserver/stratis').Stratis} Stratis
 * @typedef {import('../webserver/interfaces').StratisExpressRequest} StratisExpressRequest
 * @typedef {import('../webserver/interfaces').StratisExpressResponse} StratisExpressResponse
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 */

/**
 * @typedef {Object} StratisOAuth2ProviderSessionParamsState
 * @property {string} uuid
 * @property {string} origin
 * @property {number} created_at
 **/

/**
 * @typedef {Object} StratisOAuth2ProviderSessionParams
 * @property {StratisOAuth2ProviderSessionParamsState} state
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
 * @property {StratisOAuth2Provider.allow_login} allow_login Check if the current request source allows redirect to login.
 * @property {boolean} use_proxies If true, and proxies are detected use them.
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

class StratisOAuth2ProviderSession {
  /**
   * The current session state for the stratis authentication provider.
   * @param {StratisOAuth2Provider} provider
   * @param {Request} req the http request
   * @param {Response} res the http response
   * @param {StratisOAuth2ProviderSessionParams} session_params
   */
  constructor(provider, req, session_params = null) {
    this._provider = provider
    /** @type {StratisOAuth2ProviderSessionParams} */
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
   * @type {StratisOAuth2ProviderSessionParamsState}
   */
  get state() {
    return this.params.state || {}
  }

  /**
   * @type {string}
   */
  get access_token() {
    /** @type {StratisOAuth2ProviderSessionParams} */
    const params = this.params || {}
    return params.access_token
  }

  /**
   * @type {string} The refresh token
   */
  get refresh_token() {
    return (this.params || {}).refresh_token
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
    if (!this.is_active) return false
    if (this.is_elapsed) return false
    return true
  }

  needs_access_token_validation() {
    if (this.is_elapsed) return false

    // if no token info needs validation.
    if (!this.has_token_info || this.params.authenticated == null) return true

    const elapsed_since_last_recheck =
      milliseconds_utc_since_epoc() - (this.params.authenticated || 0)

    return (
      elapsed_since_last_recheck >= (this.provider.recheck_interval || Infinity)
    )
  }

  /**
   * Authenticate the current access token, and mark the authenticated timestamp.
   * @param {Object} token_response The authenticated access token
   */
  async authenticate({
    access_token,
    scope = null,
    refresh_token = null,
    id_token = null,
    token_type = null,
  }) {
    Object.entries({
      access_token,
      scope,
      refresh_token,
      token_type,
      id_token,
    })
      .filter((e) => e[1] != null)
      .forEach((e) => {
        this.params[e[0]] = e[1]
      })

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
   * @param {StratisOAuth2Provider} provider The provider
   * @param {Request} req The request object.
   * @param {string} barer_token The bearer token to load from
   */
  static async load(provider, req, barer_token = null) {
    const session_value = (req.session || {})[provider.session_key] || {}
    barer_token = barer_token || parse_barer_token(req)
    const oauth_session = new StratisOAuth2ProviderSession(provider, req)

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
    // nothing to do. No access token.
    if (this.access_token == null) return false
    if (this.needs_access_token_validation()) {
      this.params.token_info = this.provider.token_introspect_url
        ? await this.provider.get_token_info(this.access_token)
        : {
            active: true,
          }

      if (!this.is_active && this.refresh_token != null) {
        // attempting to re authenticate
        let refresh_token_info = null
        try {
          refresh_token_info = await this.provider.get_token_from_refresh_token(
            this.refresh_token
          )
        } catch (err) {}

        if (refresh_token_info) {
          await this.authenticate(refresh_token_info)
          return await this.update()
        }
      }

      await this.authenticate(
        Object.assign({}, this.params.token_response, {
          access_token: this.access_token,
        })
      )

      // save the changes.
      await this.save()
      return true
    } else return false
  }

  /**
   * Returns the bearer token session given the access token.
   * (Allows for third party bearer token to be directly accessed for validation)
   * @param {string} token The bearer token
   * @returns {StratisOAuth2ProviderSession} The bearer token session.
   */
  async get_bearer_token_session(token) {
    return await this.provider.get_bearer_token_session(token, this.req)
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
    allow_login = StratisOAuth2Provider.allow_login,
    use_proxies = true,
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

    this.allow_login = allow_login
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

    this.requests = new StratisRequestsClient({
      use_proxies,
      proxy_agent_options: {
        timeout: request_timeout,
      },
    })
  }

  /**
   * Check if the current request allows login.
   * @param {Request} req
   * @returns {boolean} If true then allow login.
   */
  static async allow_login(req) {
    const accetps = (req.headers['accept'] || '')
      .split(/[, ]/)
      .filter((v) => v.trim().length > 0)

    if (!accetps.includes('text/html')) return false

    return true
  }

  /**
   * Redirect the response to login page.
   * @param {Request} req The request
   * @param {string} redirect_to Once logged in, redirect to.
   * @returns
   */
  compose_oauth2_login_url(req, redirect_to = null) {
    return `${this.basepath}?origin=${encodeURIComponent(
      redirect_to || req.originalUrl
    )}`
  }

  /**
   * Redirect the response to oauth2 revoke.
   * @param {Request} req The request
   * @param {string} redirect_to Once revoked in, redirect to.
   * @returns
   */
  compose_oauth2_revoke_url(req) {
    return `${this.basepath}?revoke=true&&redirect_to=${encodeURIComponent(
      redirect_to || req.originalUrl
    )}`
  }

  /**
   * The cache token bank that allows the interface to preserve the cache
   * refresh time for the token.
   */
  get token_cache_bank() {
    return this._token_cache_bank
  }

  /**
   * @param {StratisOAuth2ProviderSessionParamsState} state
   * @returns {string}
   */
  encode_state(state) {
    return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url')
  }

  /**
   * @param {string} state
   * @returns {StratisOAuth2ProviderSessionParamsState}
   */
  decode_state(state) {
    const state_json = Buffer.from(state, 'base64url').toString('utf-8')
    return JSON.parse(state_json)
  }

  /**
   * Updates and returns the request options for the oauth client.
   * @param {StratisRequestOptions} options
   * @param {boolean} use_proxies If true, attempt to use proxy agent.
   */
  compose_request_options(options = {}, use_proxies = true) {
    /** @type {StratisRequestOptions} */
    const client_options = {}
    client_options.headers = {}
    client_options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    client_options.timeout = this.request_timeout

    return Object.assign({}, client_options, options)
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
   * Returns the bearer token session given the access token.
   * (Allows for third party bearer token to be directly accessed for validation)
   * @param {string} token The bearer token
   * @param {Request} req The express request.
   * @returns {StratisOAuth2ProviderSession} The bearer token session.
   */
  async get_bearer_token_session(token, req) {
    assert(typeof token == 'string', 'Token must be a string value')
    const session = await StratisOAuth2ProviderSession.load(this, req, token)
    await session.update()
    return session
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {{}} token_flow_args A dictionary of token flow args to send.
   * @param {string} grant_type The grant type
   * @returns
   */
  async get_token(grant_type, token_flow_args) {
    const url = this.compose_url(
      this.token_url,
      Object.assign(
        {
          client_id: this.client_id,
          client_secret: this.client_secret,
          grant_type,
        },
        token_flow_args
      )
    )

    return await (
      await this.requests.post(
        url,
        this.compose_request_options({
          custom_error_message: `Error while getting token from ${url.origin}${url.pathname}`,
        })
      )
    ).to_json()
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {string} code The get token authorization steps code.
   * @param {string} redirect_uri The redirect url.
   * @returns
   */
  async get_token_from_code(code, redirect_uri) {
    return await this.get_token('authorization_code', {
      code,
      redirect_uri,
    })
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {string} refresh_token The get token authorization steps code.
   * @returns
   */
  async get_token_from_refresh_token(refresh_token) {
    return await this.get_token('refresh_token', {
      refresh_token,
    })
  }

  /**
   * Returns the token info using the introspect url. Sends a request to the server.
   * @param {string} token The token to get info about.
   * @param {string} token_type The token type.
   */
  async get_token_info(token, token_type = 'access_token') {
    const url = this.compose_url(this.token_introspect_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint: token_type,
    })

    return await (
      await this.requests.post(
        url,
        this.compose_request_options({
          custom_error_message: `Error while getting token info from ${url.origin}${url.pathname}`,
        })
      )
    ).to_json()
  }

  /**
   * Sends a revoke request for a specific token.
   * @param {string} token The token
   * @param {string} token_type The token type.
   * @returns
   */
  async revoke(token, token_type = 'access_token') {
    const url = this.compose_url(this.revoke_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint: token_type,
    })

    return await (
      await this.requests.post(
        url,
        this.compose_request_options({
          custom_error_message: `Error while revoking token at ${url.origin}${url.pathname}`,
        })
      )
    ).to_json()
  }

  /**
   * INTERNAL. Update the request user object.
   * @param {Request} req
   * @param {StratisOAuth2ProviderSession} session
   */
  _update_request_user_object(req, session) {
    if (!session.is_authenticated) {
      req[this.request_user_object_key] = null
      return
    }
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

  /**
   * Implements the authentication check middleware. If called request
   * must be authenticated against OAuth2 to proceed. Use login_middleware
   * to create a login page redirect.
   * @returns {(req:Request,res:Response, next:NextFunction)=>{}} Auth middleware
   */
  auth_middleware() {
    /**
     * @param {StratisExpressRequest} req The express request. If a stratis express request then
     * uses the stratis request to check access mode to be secure.
     * @param {StratisExpressResponse} res The express response.
     * @param {NextFunction} next
     */
    const intercrept = async (req, res, next) => {
      // check if this request is an auth login request
      if (req.path == this.basepath) return next()

      try {
        const oauth_session = await StratisOAuth2ProviderSession.load(this, req)
        req.stratis_oauth2_session = oauth_session

        // only run authentication in the case where we have a need.
        // for the case of a stratis request, if its secure.
        if (
          req.stratis_request == null ||
          req.stratis_request.access_mode == 'secure'
        ) {
          // check for token updates.
          if (await oauth_session.update()) {
            this.logger.debug(
              `Authentication info updated for ${
                oauth_session.username
              }. (TID: ${oauth_session.token_id}, Access ${
                oauth_session.is_access_granted ? 'GRANTED' : 'DENIED'
              })`
            )
          }

          if (!oauth_session.is_access_granted) {
            if (this.allow_login != null && !(await this.allow_login(req)))
              throw new StratisNotAuthorizedReloadError('Access denied')

            // check if needs clearing.
            if (
              oauth_session.is_authenticated &&
              (!oauth_session.is_active || oauth_session.is_elapsed == true)
            )
              await oauth_session.clear()

            return res.redirect(this.compose_oauth2_login_url(req))
          }
        }

        // updating the user object.
        this._update_request_user_object(req, oauth_session)

        next()
      } catch (err) {
        return next(err)
      }
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
        const oauth_session = await StratisOAuth2ProviderSession.load(this, req)

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
          case 'authentication_response': {
            // Case we already authenticated and we need to get the token.
            /** @type {StratisOAuth2ProviderSessionParamsState} */
            const query_state = this.decode_state(req.query.state) || {}
            const origin_url = query_state.origin || oauth_session.state.origin

            if (query.error != null) {
              // try to redirect to origin.
              if (origin_url) {
                this.logger.debug(
                  `Authentication failed, redirecting to origin: ${origin_url}`
                )
                return res.redirect(origin_url)
              }

              // Otherwise error
              throw new StratisNotAuthorizedReloadError(
                `Unauthorized: ${query.error}`
              )
            }

            assert(
              oauth_session.params.state != null,
              'Invalid token validation request, session oauth2 state could not be read from session'
            )

            assert(
              oauth_session.params.state.uuid == query_state.uuid,
              `Invalid token validation request. UUID mismatch (${oauth_session.params.state.uuid}!=${query_state.uuid})`
            )

            const token_info = await this.get_token_from_code(
              req.query.code,
              oauth_redirect_uri
            )

            await oauth_session.authenticate(token_info)

            this.logger.debug(
              `Authentication successfull for token ${oauth_session.token_id}, redirecting to: ${origin_url}`
            )

            return res.redirect(origin_url)
          }
          case 'revoke': {
            try {
              if (oauth_session.access_token)
                await this.revoke(oauth_session.access_token)
            } catch (err) {
              this.logger.warn(
                `Unable to revoke token ${oauth_session.token_id}. Clearing session but token is still active.`
              )
            }

            await oauth_session.clear()

            return res.redirect(
              req.query.redirect_to ||
                `${request_url.protocol}//${request_url.host}`
            )
          }
          default:
            if (query.error != null) throw new Error(`${JSON.stringify(query)}`)
            else
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
    stratis.session_options.get_user_info = async (req) => {
      return req[this.request_user_object_key]
    }

    stratis.on('stratis_request', async (stratis_request) => {
      if (stratis_request.access_mode != 'secure') return

      /** @type {StratisOAuth2ProviderSession} */
      const oauth_session =
        stratis_request.request.stratis_oauth2_session ||
        (await StratisOAuth2ProviderSession.load(this, stratis_request.request))

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
  StratisOAuth2ProviderSession,
  /** @type {StratisOAuth2ProviderOptions} */
  StratisOAuth2ProviderOptions: {},
}
