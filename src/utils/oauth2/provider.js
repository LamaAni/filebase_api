const path = require('path')
const { CacheDictionary } = require('../../webserver/collections')
const {
  StratisNotAuthorizedReloadError,
  StratisNotAuthorizedError,
  StratisNoEmitError,
} = require('../../webserver/errors')
const {
  assert,
  assert_non_empty_string,
  get_express_request_url,
  milliseconds_utc_since_epoc,
  encrypt_string,
  decrypt_string,
} = require('../../common')
const { concat_url_args } = require('./common')
const { stream_to_buffer } = require('../streams')

const { StratisOAuth2RequestClient } = require('./requests')
const { StratisOAuth2ProviderSession } = require('./session')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('./requests').StratisOAuth2RequestsClientOptions} StratisOAuth2RequestsClientOptions
 * @typedef {import('./interfaces').StratisOAuth2ProviderServiceType} StratisOAuth2ProviderServiceType
 * @typedef {import('./interfaces').StratisOAuth2ProviderAuthorizeState} StratisOAuth2ProviderAuthorizeState
 *
 * @typedef {Object} StratisOAuth2ProviderOptionsExtend
 * @property {string|URL|(req:Request, query: {})=>string|URL} redirect_url Overrides the oauth redirect call back url.
 * @property {stirng} basepath The path to use for the apply command (serves the oauth2 login and redirect)
 * @property {'access_token' | 'id_token'} token_type The (remote service) token type to use when refreshing a token.
 * @property {string} session_key The session key to use when recording the oauth token
 * @property {string} encryption_key The encryption key for session encryption. Defaults to client_secret.
 * @property {string} encryption_expiration The time, in ms, for the encryption expiration. Defaults to 5 minutes.
 * @property {number} recheck_interval The number of milliseconds before revalidating the token.
 * @property {number} expires_in The number of milliseconds before forcing the session to expire. If null then ignored.
 * @property {string|[string]} username_from_token_info_path The path to the username to parse out of the user info.
 * @property {string} user_key The req[key] to save the user information. defaults to user.
 * @property {string} response_type The authentication type. Currently supports only code.
 * @property {StratisOAuth2Provider.allow_login} allow_login Check if the current request source allows redirect to login.
 * @property {boolean} use_proxies If true, and proxies are detected use them.
 * @property {boolean} enable_oidc_token If true, allows the download of a service token. WARNING! exposes the client_secret.
 * @property {boolean} enable_introspect If true, enables the introspect service.
 *
 * @typedef {StratisOAuth2RequestsClientOptions & StratisOAuth2ProviderOptionsExtend} StratisOAuth2ProviderOptions
 */

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
    token_type = 'access_token',
    session_key = 'stratis:oauth2:token',
    encryption_key = null,
    encryption_expiration = 1000 * 60 * 5,
    response_type = 'code',
    recheck_interval = 1000 * 60,
    expires_in = null,
    timeout = 1000 * 10,
    logger = console,
    user_key = 'user',
    allow_login = StratisOAuth2Provider.allow_login,
    use_proxies = true,
    enable_oidc_token = false,
    enable_introspect = false,
    username_from_token_info_path = ['username', 'email', 'user', 'name'],
  } = {}) {
    this.requests = new StratisOAuth2RequestClient({
      client_id,
      client_secret,
      service_url,
      token_url,
      authorize_url,
      introspect_url,
      revoke_url,
      scope,
      timeout,
      logger,
      use_proxies,
    })

    assert_non_empty_string(
      session_key,
      'session_key must be a non empty string'
    )

    assert(
      typeof encryption_expiration == 'number' && encryption_expiration > 0,
      'The encryption_expiration must be a number > 0'
    )

    assert(typeof basepath == 'string', 'basepath must be a string')

    this.basepath = StratisOAuth2Provider.clean_service_path(basepath)
    this.response_type = response_type
    this.allow_login = allow_login
    this.session_key = session_key
    this.encryption_key = encryption_key || client_secret
    this.encryption_expiration = encryption_expiration
    this.enable_oidc_token = enable_oidc_token
    this.enable_introspect = enable_introspect
    this.recheck_interval = recheck_interval
    this.expires_in = expires_in
    this.logger = logger
    this.user_key = user_key
    this.token_type = token_type
    /** @type {[string]} */
    this.username_from_token_info_path = Array.isArray(
      username_from_token_info_path
    )
      ? username_from_token_info_path
      : [username_from_token_info_path]

    // build the redirect url.
    this.redirect_url = this.requests.to_url(redirect_url)

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
   * Cleans the a path and returns an oauth service path.
   * @param {string} path
   */
  static clean_service_path(path = null) {
    path = path || this.basepath
    path = path.trim()
    if (!path.startsWith('/')) path = '/' + path
    if (path.endsWith('/')) path = path.substring(0, path.length - 1)
    return path
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
   * @param {Request} req the express request
   * @param {StratisOAuth2ProviderServiceType} type
   * @param {{}} query The query arguments
   */
  compose_redirect_url(req, query = null) {
    if (this.redirect_url != null) {
      return typeof this.redirect_url == 'function'
        ? this.redirect_url(req, query)
        : this.redirect_url
    } else return this.compose_service_url(req, null, query)
  }

  /**
   * @param {Request} req the express request
   * @param {StratisOAuth2ProviderServiceType} type
   * @param {{}} query The query arguments
   */
  compose_service_url(req, type = null, query = null) {
    return this.requests.compose_url(
      [this.basepath, type].filter((v) => v != null).join('/'),
      query,
      `${req.protocol}://${req.get('host')}`
    )
  }

  /**
   * @param {StratisOAuth2ProviderAuthorizeState} state The state to update.
   * @param {{}} extend_with
   * @returns {StratisOAuth2ProviderAuthorizeState}
   */
  compose_state(state, extend_with = null) {
    return Object.assign(
      { created_at: milliseconds_utc_since_epoc() },
      state,
      extend_with || {}
    )
  }

  /**
   * Compose open ID configuration for the request.
   * @param {Request} req
   */
  compose_well_known_metadata(req) {
    return {
      token_endpoint: this.compose_service_url(req, 'token', {
        token_type: this.token_type,
      }),
      scopes_supported: this.scope,
      // Unsupported
      authorization_endpoint: null,
      device_authorization_endpoint: null,
      claims_supported: null,
      code_challenge_methods_supported: null,
      end_session_endpoint: null,
      grant_types_supported: null,
      introspection_endpoint: null,
      introspection_endpoint_auth_methods_supported: null,
      issuer: null,
      request_object_signing_alg_values_supported: null,
      request_parameter_supported: null,
      response_modes_supported: null,
      response_types_supported: null,
      revocation_endpoint: null,
      revocation_endpoint_auth_methods_supported: null,
      subject_types_supported: null,
      token_endpoint_auth_methods_supported: null,
    }
  }

  /**
   * @param {Request} req
   * @param {*} token_info
   * @returns
   */
  compose_encrypted_token(
    req,
    { id_token = null, access_token = null, refresh_token = null }
  ) {
    return {
      client_id: this.encrypt(this.client_id),
      id_token,
      access_token,
      refresh_token: this.encrypt(refresh_token, -1),
      issuer: this.compose_service_url(req),
    }
  }

  /**
   * Returns the bearer token session given the access token.
   * (Allows for third party bearer token to be directly accessed for validation)
   * @param {Request} req The express request.
   * @param {string} token The bearer token. (Null if read from request)
   * @returns {StratisOAuth2ProviderSession} The bearer token session.
   */
  async get_session(req, token = null) {
    assert(
      token == null || typeof token == 'string',
      'Token must be a string value or null to auto read from request'
    )
    const session = await StratisOAuth2ProviderSession.load(this, req, token)
    await session.update()
    return session
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
   * @param {boolean|string} query.token_as_link If true, return a token login result as link.
   */
  async svc_login(
    req,
    res,
    next,
    {
      redirect_uri: auth_redirect = null,
      state = null,
      login_result = 'session',
      token_as_link = true,
    }
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

    token_as_link =
      token_as_link == true || token_as_link.trim().toLowerCase() == 'true'

    state = this.encrypt(
      Object.assign(
        this.compose_state(
          {
            created_at: milliseconds_utc_since_epoc(),
            redirect_uri: auth_redirect,
            login_result,
            token_as_link,
          },
          state || {}
        )
      )
    )

    const redirect_url = this.requests.compose_authorize_url(
      this.redirect_url ||
        // The default service is the authorize service
        // Use this default since we want the auth redirect_uri
        // to be simple. e.g. [protocol]://[host]/[this.basepath]
        this.compose_redirect_url(req).href,
      state,
      this.response_type
    )

    return res.redirect(redirect_url)
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
        await this.requests.revoke(oauth_session.refresh_token, 'refresh_token')
      if (oauth_session.access_token != null)
        await this.requests.revoke(oauth_session.access_token, 'access_token')
    }

    await oauth_session.clear()

    return res.redirect(redirect_uri || '/')
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
    /** @type {StratisOAuth2ProviderAuthorizeState} */
    const auth_state = this.decrypt(state)
    auth_state.login_result = auth_state.login_result || 'session'

    const token_info = await this.requests.get_token_from_code(
      req.query.code,
      this.compose_redirect_url(req).href
    )

    switch (auth_state.login_result) {
      case 'session':
        // session login
        /** @type {StratisOAuth2ProviderSession} */
        const oauth_session = await StratisOAuth2ProviderSession.load(this, req)

        // write the authentication info.
        await oauth_session.authenticate(token_info)

        return res.redirect(auth_state.redirect_uri || '/')

      case 'token':
        // need to encrypt the authentication keys for the token response
        // to not allow direct interaction with the authentication
        // service.

        assert(
          this.enable_oidc_token,
          new StratisNotAuthorizedError(
            'Access to odic tokens is denied. The service is disabled'
          )
        )

        const token = this.compose_encrypted_token(req, {
          id_token: token_info.id_token,
          access_token: token_info.access_token,
          refresh_token: token_info.refresh_token,
        })

        let response_string = auth_state.token_as_link
          ? this.compose_service_url(req, 'decrypt', {
              value: this.encrypt(token),
            }).href
          : JSON.stringify(token)

        if (auth_state.redirect_uri == null) return res.end(response_string)
        else {
          const redirect_uri = concat_url_args(auth_state.redirect_uri, {
            token: response_string,
          })
          this.logger.debug('OAuth2 redirect with token -> ' + redirect_uri)
          return res.redirect(redirect_uri)
        }
      default:
        throw new StratisNoEmitError(
          'Unknown login result: ' + auth_state.login_result
        )
    }
  }

  /**
   * Uses the secure service to read the request response and query.
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @param {{refresh_token: string, token_type: 'access_token' | 'id_token'}} query
   */
  async svc_token(req, res, next, { refresh_token = null, token_type = null }) {
    token_type = token_type || this.token_type || 'access_token'
    assert(
      refresh_token != null,
      'Only refresh tokens are allowed in oauth2 proxy.'
    )

    // decrypting the refresh token
    refresh_token = this.decrypt(refresh_token)

    const info = await this.requests.get_token_from_refresh_token(refresh_token)

    const token = this.compose_encrypted_token(req, info)

    switch (token_type) {
      case 'access_token':
        token.id_token = info.access_token
        break
      case 'id_token':
        break
    }

    assert(
      token.id_token != null,
      new StratisNoEmitError(
        'Refresh token return did not provide a token of tyoe: ' + token_type
      )
    )

    return res.end(JSON.stringify(token))
  }

  /**
   * Returns response ok (200) if the token can be validated, otherwise unauthorized 404.
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @param {{access_token:string, id_token:string}} query
   */
  async svc_validate(req, res, next, { access_token = null, id_token = null }) {
    assert(
      access_token != null || id_token != null,
      new StratisNoEmitError(
        'You must provide either an access_token or an id_token'
      )
    )
    /** @type {'access_token' | 'id_token'} */
    const token_type = access_token != null ? 'access_token' : 'id_token'
    const token = access_token != null ? access_token : id_token

    const token_info = await this.requests.introspect(token, token_type)
    if (token_info.active != true)
      throw new StratisNotAuthorizedError('Token not authorized.')
    res.status(200)
    res.end('valid')
  }

  /**
   * Returns the token info for the token.
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @param {{access_token:string, id_token:string}} query
   */
  async svc_introspect(
    req,
    res,
    next,
    { access_token = null, id_token = null }
  ) {
    assert(
      this.enable_introspect === true,
      new StratisNoEmitError('Introspect service is not enabled. Access denied')
    )

    assert(
      access_token != null || id_token != null,
      new StratisNoEmitError(
        'You must provide either an access_token or an id_token'
      )
    )

    token_info = await this.requests.introspect(token)
    return res.end(token_info)
  }

  /**
   * Returns echo command. Validates the service is active and ready.
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @param {{}} query
   */
  async svc_echo(req, res, next, query) {
    return res.end(JSON.stringify(query))
  }

  /**
   * Binds the oauth service paths to the express app.
   * @param {import('express').Express} app
   * @param {string} serve_path The oauth serve path (must start with /), defaults to this.basepath
   */
  bind_services(app, serve_path = null) {
    serve_path = StratisOAuth2Provider.clean_service_path(
      serve_path || this.basepath
    )

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
     * @param {Request} req
     */
    const parse_request_query = async (req) => {
      let data_query = null

      switch (req.method) {
        case 'GET':
          break
        case 'POST':
          data_query = (await stream_to_buffer(req)).toString('utf-8')
          // Two options here. JSON or URL search.
          if (data_query.trim().startsWith('{'))
            data_query = JSON.parse(data_query)
          else {
            // assume url args.
            const data_entries = Array.from(
              new URLSearchParams(data_query).entries()
            )
            data_query = {}
            data_entries.forEach((e) => {
              data_query[e[0]] = e[1]
            })
          }
          break
        default:
          throw new StratisNoEmitError('OAuth2 requests can only be GET/POST')
      }

      return Object.assign(data_query || {}, req.query)
    }

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

        return await service.invoke(
          req,
          res,
          intern_next,
          await parse_request_query(req)
        )
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
        path: [serve_path, service_type].join('/'),
      }

      services[service_type] = service

      app.use(service.path, async (req, res, next) => {
        await invoke_service(service.type, req, res, next)
      })
    }

    app.use(
      path.join(this.basepath, '.well-known/openid-configuration'),
      async (req, res, next) => {
        res.end(JSON.stringify(this.compose_well_known_metadata(req)))
      }
    )

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
   * @param {StratisExpressRequest} req The express request. If a stratis express request then
   * uses the stratis request to check access mode to be secure.
   * @param {StratisExpressResponse} res The express response.
   * @param {NextFunction} next
   * @param {boolean} authenticate
   */
  async authentication_intercept(req, res, next, authenticate = true) {
    try {
      authenticate = authenticate == null ? true : authenticate

      const oauth_session = await StratisOAuth2ProviderSession.load(this, req)
      req.stratis_oauth2_session = oauth_session

      // only run authentication in the case where we have a need.
      // for the case of a stratis request, if its secure.
      if (authenticate) {
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
      if (!oauth_session.is_authenticated) {
        req[this.user_key] = null
        return
      }
      const current_user_object = req[this.user_key] || {}
      req[this.user_key] = Object.assign(
        typeof current_user_object != 'object' ? {} : current_user_object,
        {
          username: current_user_object.username || oauth_session.username,
          access_token: oauth_session.access_token,
          token_info: oauth_session.token_info,
        }
      )

      next()
    } catch (err) {
      return next(err)
    }
  }

  /**
   * Implements the authentication check middleware. If called request
   * must be authenticated against OAuth2 to proceed. Uses services_middleware
   * to create a login page redirect if needed.
   * @returns {(req:Request,res:Response, next:NextFunction, authenticate:boolean)=>{}} Auth middleware
   */
  auth_middleware() {
    return async (...args) => await this.authentication_intercept(...args)
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
      return req[this.user_key]
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
}
