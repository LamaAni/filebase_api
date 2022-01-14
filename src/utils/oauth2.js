const path = require('path')
const { StratisRequestsClient } = require('./requests')
const { CacheDictionary } = require('../webserver/collections')
const {
  StratisNotAuthorizedReloadError,
  StratisNotAuthorizedError,
  StratisNoEmitError,
} = require('../webserver/errors')
const {
  assert,
  assert_non_empty_string,
  is_non_empty_string,
  is_valid_url,
  get_express_request_url,
  milliseconds_utc_since_epoc,
  value_from_object_path,
  encrypt_string,
  decrypt_string,
  create_uuid,
} = require('../common')

const OIDC_ENCRYPT_KEYS = ['client_secret', 'refresh_token']

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
 * @typedef {'session'|'token'|'token_decrypt_url'} StratisOAuth2ProviderLoginResult
 * @typedef {'login'|'logout'|'decrypt'|'authorize_response'|'oidc'} StratisOAuth2ProviderServiceType
 */

/**
 * @typedef {Object} StratisOAuth2ProviderAuthorizeState
 * @property {number} created_at
 * @property {string} redirect_uri
 * @property {StratisOAuth2ProviderLoginResult} login_result
 **/

/**
 * @typedef {Object} StratisOAuth2ProviderSessionParams
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
 * @property {string|URL} service_url The base service url (the service root)
 * @property {string|URL} token_url Get token url. Based on service if partial path.
 * @property {string|URL} authorize_url authorize url. Based on service if partial path.
 * @property {string|URL} introspect_url introspect url. Based on service if partial path.
 * @property {string|URL} revoke_url revoke url. Based on service if partial path.
 * @property {string|URL|(req:Request, query: {})=>string|URL} redirect_url Overrides the oauth redirect call back url.
 * @property {stirng} basepath The path to use for the apply command (serves the oauth2 login and redirect)
 * @property {[string]} scope the scope to use.
 * @property {string} session_key The session key to use when recording the oauth token
 * @property {string} encryption_key The encryption key for session encryption. Defaults to client_secret.
 * @property {string} encryption_expiration The time, in ms, for the encryption expiration. Defaults to 5 minutes.
 * @property {[string]} oidc_encrypted_keys The keys in the token to encrypt, when using as oauth2 proxy.
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
   * The current session for the stratis authentication provider.
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
      this.params.token_info = this.provider.introspect_url
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
    service_url,
    token_url = 'token',
    authorize_url = 'authorize',
    introspect_url = 'introspect',
    revoke_url = 'revoke',
    redirect_url = null,
    basepath = '/oauth2',
    scope = [],
    session_key = 'stratis:oauth2:token',
    encryption_key = null,
    encryption_expiration = 1000 * 60 * 5,
    oidc_encrypted_keys = ['token_id', 'refresh_token'],
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
    assert(
      service_url instanceof URL || is_non_empty_string(service_url),
      'You must provide a root service url where .well-known/... can be found.'
    )
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

    assert(
      typeof encryption_expiration == 'number' && encryption_expiration > 0,
      'The encryption_expiration must be a number > 0'
    )

    assert(typeof basepath == 'string', 'basepath must be a string')

    /**
     * @param {string} url
     * @param {boolean} use_service_url_base
     * @returns {URL}
     */
    const as_url = (url, use_service_url_base = true) => {
      if (url == null) return null
      if (url instanceof URL) return url
      assert(typeof url == 'string', 'Invalid url ' + url)
      if (!use_service_url_base) return new URL(url)

      let base_url = this.service_url.origin
      if (!url.startsWith('/')) base_url += this.service_url.pathname
      if (!base_url.endsWith('/')) base_url += '/'

      return new URL(url, base_url)
    }

    this.client_id = client_id
    this.client_secret = client_secret

    this.service_url = as_url(service_url, false)
    this.token_url = as_url(token_url)
    this.authorize_url = as_url(authorize_url)
    this.introspect_url = as_url(introspect_url)
    this.revoke_url = as_url(revoke_url)
    this.redirect_url = as_url(redirect_url)

    this.basepath = this._clean_service_path(basepath)
    this.response_type = response_type

    this.allow_login = allow_login
    this.scope = scope
    this.session_key = session_key
    this.encryption_key = encryption_key || client_secret
    this.encryption_expiration = encryption_expiration
    this.oidc_encrypted_keys = oidc_encrypted_keys || OIDC_ENCRYPT_KEYS
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
      this.introspect_url != null || this.expires_in != null,
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
   * The cache token bank that allows the interface to preserve the cache
   * refresh time for the token.
   */
  get token_cache_bank() {
    return this._token_cache_bank
  }

  /**
   * @param {*} value
   * @param {number} expires_in If -1 then infinity.
   * @returns {string}
   */
  encrypt(value, expires_in = null) {
    return encrypt_string(
      JSON.stringify({
        timestamp: milliseconds_utc_since_epoc(),
        expires_in,
        value,
      }),
      this.encryption_key
    )
  }

  /**
   * @param {string} encrypted_value
   * @returns {*}
   */
  decrypt(encrypted_value) {
    /**
     * @type {{
     *  timestamp: number,
     *  value: any,
     * }}
     */
    let decrypted = null
    try {
      decrypted = JSON.parse(
        decrypt_string(encrypted_value, this.encryption_key)
      )
    } catch (err) {
      throw new Error(
        'Could not decrypt value using the provided encryption key. Decode error: ' +
          (err.message || `${err}`)
      )
    }

    assert(
      decrypted.timestamp != null && typeof decrypted.timestamp == 'number',
      'Invalid decrypted value'
    )

    decrypted.expires_in = decrypted.expires_in || this.encryption_expiration
    decrypted.expires_in =
      decrypted.expires_in <= 0 ? Infinity : decrypted.expires_in

    if (
      milliseconds_utc_since_epoc() >
      decrypted.timestamp + decrypted.expires_in
    )
      throw new StratisNotAuthorizedError('Encrypted value expired')

    return decrypted.value
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
   * @param {string|URL} url The base url to compose from
   * @param {{}} query The query arguments to compose from
   * @param {string|URL} base_url The base url to compose from
   */
  compose_url(url, query = null, base_url = null) {
    if (base_url != null) url = new URL(url, base_url)
    else url = new URL(url)

    query = query || {}
    assert(typeof query == 'object', 'Query must be a dictionary')

    Object.entries(query)
      .filter((entry) => entry[1] != null)
      .forEach((entry) => url.searchParams.set(entry[0], entry[1]))

    return url
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
        null,
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
    const url = this.compose_url(this.introspect_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint: token_type,
    })

    return await (
      await this.requests.post(
        url,
        null,
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
        null,
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
   * @param {string} state
   * @returns {StratisOAuth2ProviderAuthorizeState}
   */
  decrypt_state(state) {
    return this.decrypt(state)
  }

  /**
   * @param {Request} req the express request
   * @param {StratisOAuth2ProviderServiceType} type
   * @param {{}} query The query arguments
   */
  compose_service_url(req, type = null, query = null) {
    return this.compose_url(
      [this.basepath, type].filter((v) => v != null).join('/'),
      query,
      `${req.protocol}://${req.get('host')}`
    )
  }

  /**
   * @param {Request} req the express request
   * @param {StratisOAuth2ProviderServiceType} type
   * @param {{}} query The query arguments
   */
  compose_redirect_uri(req, query = null) {
    if (this.redirect_url != null) {
      return typeof this.redirect_url == 'function'
        ? this.redirect_url(req, query)
        : this.redirect_url
    } else return this.compose_service_url(req, null, query)
  }

  /**
   * @param {StratisOAuth2ProviderAuthorizeState} state The state to update.
   * @param {{}} extend_with
   * @returns {StratisOAuth2ProviderAuthorizeState}
   */
  create_state(state, extend_with = null) {
    return Object.assign(
      { created_at: milliseconds_utc_since_epoc() },
      state,
      extend_with || {}
    )
  }

  /**
   * Decrypt oidc service keys.
   * @param {{}} dict
   */
  decrypt_oidc_service_keys(dict) {
    assert(typeof dict == 'object', 'oidc key dict must be an object.')

    this.oidc_encrypted_keys.forEach((k) => {
      if (dict[k] == null) return
      dict[k] = this.decrypt(dict[k], -1)
    })

    return dict
  }

  /**
   * Decrypt oidc service keys.
   * @param {{}} dict
   */
  encrypt_oidc_service_keys(dict) {
    assert(typeof dict == 'object', 'oidc key dict must be an object.')

    this.oidc_encrypted_keys.forEach((k) => {
      if (dict[k] == null) return
      dict[k] = this.encrypt(dict[k])
    })

    return dict
  }

  /**
   * Implements the authentication check middleware. If called request
   * must be authenticated against OAuth2 to proceed. Uses services_middleware
   * to create a login page redirect if needed.
   * @returns {(req:Request,res:Response, next:NextFunction, authenticate:boolean)=>{}} Auth middleware
   */
  auth_middleware() {
    /**
     * @param {StratisExpressRequest} req The express request. If a stratis express request then
     * uses the stratis request to check access mode to be secure.
     * @param {StratisExpressResponse} res The express response.
     * @param {NextFunction} next
     * @param {boolean} authenticate
     */
    const intercrept = async (req, res, next, authenticate = true) => {
      try {
        const oauth_session = await StratisOAuth2ProviderSession.load(this, req)
        req.stratis_oauth2_session = oauth_session

        authenticate = authenticate == null ? true : authenticate

        // only run authentication in the case where we have a need.
        // for the case of a stratis request, if its secure.
        if (authenticate) {
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
            // check if needs clearing.
            if (
              oauth_session.is_authenticated &&
              (!oauth_session.is_active || oauth_session.is_elapsed == true)
            )
              await oauth_session.clear()

            return await this.svc_login(req, res, next, {
              redirect_uri: get_express_request_url(req),
              login_result: 'session',
            })
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
   * Called before oauth request to authenticate.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async prepare_oauth2_service_request(req, res, next) {
    if (req.query.error != null) {
      // Otherwise error
      throw new StratisNotAuthorizedReloadError(
        `Unauthorized: ${req.query.error}`
      )
    }
  }

  /**
   * Called to decrypt a oauth2 value (Secure get)
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @param {Object} query
   * @param {string} value
   */
  async svc_decrypt(req, res, next, { value = null }) {
    if (value == null) {
      res.sendStatus(404)
      return res.end('no value to decrypt')
    }
    value = this.decrypt(value)
    return res.end(
      typeof value == 'object' ? JSON.stringify(value) : `${value}`
    )
  }

  /**
   * Called to redirect to the remote server login.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @param {Object} query The query arguments
   * @param {string} query.redirect_uri Where to redirect the oauth2 service response
   * @param {string} query.state Extra state args
   * @param {'token'|'session'} query.login_result The login type
   */
  async svc_login(
    req,
    res,
    next,
    { redirect_uri = null, state = null, login_result = 'session' }
  ) {
    assert(
      this.allow_login == null || (await this.allow_login(req)),
      new StratisNoEmitError(
        'Login is not allowed for this type of request. Are you loging in from a browser?'
      )
    )

    if (state != null) {
      state = typeof state == 'string' ? JSON.parse(state) : state
      assert(typeof state == 'object', 'State must be a json string or null')
    }

    const authorize_query = {
      redirect_uri:
        this.redirect_url ||
        // The default service is the authorize service
        // Use this default since we want the auth redirect_uri
        // to be simple. e.g. [protocol]://[host]/[this.basepath]
        this.compose_redirect_uri(req).href,
      client_id: this.client_id,
      response_type: this.response_type,
      scope:
        this.scope == null || this.scope.length == 0
          ? null
          : this.scope.join(' '),
      state: this.encrypt(
        Object.assign(
          this.create_state(
            {
              created_at: milliseconds_utc_since_epoc(),
              redirect_uri,
              login_result,
            },
            state
          )
        )
      ),
    }

    return res.redirect(this.compose_url(this.authorize_url, authorize_query))
  }

  /**
   * Session logout
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @param {Object} query The query arguments
   */
  async svc_logout(req, res, next, { redirect_uri = null, no_revoke = null }) {
    /** @type {StratisOAuth2ProviderSession} */
    const oauth_session = await StratisOAuth2ProviderSession.load(this, req)

    if (no_revoke != 'true' && oauth_session.is_authenticated) {
      if (oauth_session.refresh_token != null)
        await this.revoke(oauth_session.refresh_token, 'refresh_token')
      if (oauth_session.access_token != null)
        await this.revoke(oauth_session.access_token, 'access_token')
    }

    await oauth_session.clear()

    return res.redirect(redirect_uri || '/F')
  }

  /**
   * Called to handle the authorize response.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @param {Object} query The query arguments
   * @param {string} query.state The query state
   */
  async svc_authorize_response(req, res, next, { state = null }) {
    assert(state != null, 'Authorize response returned with no state')

    // decrypt the state.
    const auth_state = this.decrypt_state(state)
    auth_state.login_result = auth_state.login_result || 'session'

    const token_info = await this.get_token_from_code(
      req.query.code,
      this.compose_redirect_uri(req).href
    )

    switch (auth_state.login_result) {
      case 'session':
        // session login
        /** @type {StratisOAuth2ProviderSession} */
        const oauth_session = await StratisOAuth2ProviderSession.load(this, req)

        // write the authentication info.
        await oauth_session.authenticate(token_info)

        return res.redirect(auth_state.redirect_uri || '/')

      case 'token_decrypt_url':
      case 'token':
        // need to encrypt the authentication keys for the token response
        // to not allow direct interaction with the authentication
        // service.

        const service_token = {}

        Object.entries({
          client_id: this.client_id,
          client_secret: this.client_secret,
          id_token: token_info.id_token,
          access_token: token_info.access_token,
          refresh_token: token_info.refresh_token,
          // use the encrypted gateway.
          idp_issuer_url: this.compose_service_url(req, 'oidc'),
        }).forEach((e) => {
          if (e[1] == null) return
          if (e[1] instanceof URL) e[1] = e[1].href
          return (service_token[e[0]] = e[1])
        })

        this.encrypt_oidc_service_keys(service_token)

        if (auth_state.login_result == 'token')
          return res.end(JSON.stringify(service_token))

        return res.end(
          this.compose_service_url(req, 'decrypt', {
            value: this.encrypt(service_token),
          }).href
        )
    }
  }

  /**
   * Encrypted gateway to the remote oidc response.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   * @param {Object} query The query arguments
   */
  async svc_oidc(req, res, next, query) {
    query = this.decrypt_oidc_service_keys(query)
    const proxy_req = await this.requests.request(
      this.compose_url(this.service_url, query),
      {
        headers: req.headers,
      }
    )
    proxy_req.pipe(res)
    return await new Promise((resolve, reject) => {
      proxy_req.on('end', () => resolve(res.end()))
      proxy_req.on('error', (err) => reject(err))
    })
  }

  /**
   * INTERNAL
   * @param {string} path
   */
  _clean_service_path(path = null) {
    path = path || this.basepath
    path = path.trim()
    if (!path.startsWith('/')) path = '/' + path
    if (path.endsWith('/')) path = path.substring(0, path.length - 1)
    return path
  }

  /**
   * Binds the oauth service paths to the express app.
   * @param {import('express').Express} app
   * @param {string} path The oauth serve path (must start with /), defaults to this.basepath
   */
  bind_services(app, path = null) {
    path = this._clean_service_path(path)

    const service_bind_names = Object.getOwnPropertyNames(
      Object.getPrototypeOf(this)
    ).filter((v) => v.startsWith('svc_') && typeof this[v] == 'function')

    /**
     * @type {Object<string,{
     * type: string,
     * function_name: string,
     * invoke: (req:Request, res:Response,next:NextFunction, query:{})=>{}
     * path: string
     * }>}
     */
    const services = {}

    /**
     * @param {StratisOAuth2ProviderServiceType} service_type
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const invoke_service = async (service_type, req, res, next) => {
      try {
        assert(
          typeof service_type == 'string',
          'Service type unknown: ' + service_type
        )

        const service = services[service_type]
        assert(service != null, 'Service not found ' + service_type)

        // override next
        let next_called = false
        const intern_next = (...args) => {
          next_called = true
          return next(...args)
        }

        await this.prepare_oauth2_service_request(req, res, intern_next)
        if (res.writableEnded || next_called) return

        return await service.invoke(req, res, intern_next, req.query)
      } catch (err) {
        next(err)
      }
    }

    for (let function_name of service_bind_names) {
      const service_type = function_name.substring('svc_'.length)
      const service = {
        type: service_type,
        function_name,
        invoke: async (...args) => {
          return await this[function_name](...args)
        },
        path: [path, service_type].join('/'),
      }

      services[service_type] = service

      app.use(service.path, async (req, res, next) => {
        await invoke_service(service.type, req, res, next)
      })
    }

    /** @type {StratisOAuth2ProviderServiceType} */
    const default_service = 'authorize_response'

    app.use(this.basepath, async (req, res, next) => {
      return await invoke_service(
        req.query.state != null ? 'authorize_response' : 'login',
        req,
        res,
        next
      )
    })
  }

  /**
   * Bins the oauth controller to a (non stratis) express app.
   * @param {Express} app
   */
  bind(app) {
    this.bind_services(app)
    app.use(this.auth_middleware())
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
