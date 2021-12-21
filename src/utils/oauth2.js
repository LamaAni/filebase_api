const ProxyAgent = require('proxy-agent')
const superagent = require('superagent')
const { CacheDictionary } = require('../webserver/collections')
const { StratisNotAuthorizedError } = require('../webserver/errors')
const {
  assert,
  assert_non_empty_string,
  is_non_empty_string,
  is_valid_url,
  get_express_request_url,
  milliseconds_utc_since_epoc,
  value_from_object_path,
  sleep,
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
 * @property {number} updated The last time this params were updated (ms since epoc, utc)
 * @property {number} authenticated The timestamp of creation (ms since epoc, utc)
 * @property {string} username
 * @property {boolean} is_access_granted
 * @property {boolean} is_barer_token If true, the token origin is a barer token.
 * @property {{}} token_info
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
 * @property {'json' |'form'} body_format The request body format.
 * @property {"header" | "body"} authorization_method
 * @property {[string]} scope the scope to use.
 * @property {string} session_key The session key to use when recording the oauth token
 * @property {(req:Request)=>{}} state_generator The oauth state generator.
 * @property {number} recheck_interval The number of milliseconds before revalidating the token.
 * @property {number} expires_in The number of milliseconds before forcing the session to expire. If null then ignored.
 * @property {number} request_timeout The number of milliseconds for requests timeout.
 * @property {console} logger The internal logger.
 * @property {string|[string]} username_from_token_info_path The path to the username to parse out of the user info.
 * @property {string} request_user_object_key The req[key] to save the user information. defaults to user.
 * @property {[{token_info_path:string, regexp:string}|(info:{})=>boolean}]} access_validators A list of valid access validators.
 * @property {string} response_type The authentication type. Currently supports only code.
 */

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
    body_format = 'form',
    authorization_method = 'header',
    scope = [],
    session_key = 'stratis:oauth2:token',
    response_type = 'code',
    recheck_interval = 1000 * 60,
    expires_in = null,
    request_timeout = 1000 * 10,
    logger = console,
    access_validators = [],
    request_user_object_key = 'user',
    username_from_token_info_path = ['username', 'email', 'user', 'name'],
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
    this.body_format = body_format
    this.authorization_method = authorization_method
    this.response_type = response_type

    this.scope = scope
    this.session_key = session_key
    this.state_generator = state_generator
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

    access_validators = access_validators || []
    /**
     * @type {[(token_info)=>boolean}]}
     */
    this.access_validators = access_validators
      .map((av) => {
        if (typeof av == 'function') return av
        assert(
          typeof av.regexp == 'string' && typeof av.token_info_path == 'string',
          'access validations must be either a function or an object {token_info_path:string, regex:string}'
        )
        const regex = new RegExp(av.regexp)
        return (token_info) => {
          let val = value_from_object_path(token_info, av.token_info_path)
          if (val == null) return false
          val = typeof val == 'object' ? JSON.stringify(val) : val + ''
          return regex.test(val)
        }
      })
      .filter((av) => av != null)

    assert(
      this.access_validators.length == 0 || this.token_introspect_url != null,
      'If access validators are provided you must provide a token introspect url.'
    )

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
    if (req.session != null) {
      let session_value =
        req.session == null ? null : req.session[this.session_key]
      if (session_value != null) {
        try {
          session_value =
            typeof session_value == 'string'
              ? JSON.parse(session_value)
              : session_value
        } catch (err) {
          throw new Error('Could not parse oauth session value')
        }
        return session_value
      }
    }

    if ('authorization' in req.headers && this.token_introspect_url != null) {
      // barer tokens are not allowed when not having introspect urls.
      // checking token in headers.
      let access_token = req.headers['authorization']
      if (access_token.toLowerCase().startsWith('bearer '))
        access_token = access_token.substr('bearer '.length)
      else access_token = null

      if (access_token == null) return null

      const params = this.token_cache_bank.get(access_token) || /**
       * @type {OAuthSessionParams}
       */
      {
        access_token: access_token,
      }

      return params
    }
  }

  /**
   * @param {Request} req
   * @param {Response} res
   * @param {OAuthSessionParams} session_params
   */
  write_oauth_session_params(req, res, session_params) {
    session_params.authenticated =
      session_params.authenticated || milliseconds_utc_since_epoc()
    session_params.updated = milliseconds_utc_since_epoc()
    req.session[this.session_key] = session_params
    if (session_params.access_token != null)
      this.token_cache_bank.set(session_params.access_token, session_params)
    return session_params
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

  async get_token_info(token, token_type = 'access_token') {
    const token_introspect_url = this.compose_url(this.token_introspect_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint: token_type,
    })

    const token_info = (
      await this.configure_request(
        superagent.post(token_introspect_url.href)
      ).send()
    ).body

    return token_info
  }

  async get_user_info(token) {
    if (this.user_info_url == null) {
      return {}
    }

    const user_info_url = this.compose_url(this.user_info_url)

    const user_info = (
      await this.configure_request(superagent.get(user_info_url.href))
        .set('Authorization', `Bearer ${token}`)
        .send()
    ).body
    return user_info
  }

  /**
   * Internal. Call to update the token info and access validation.
   * @param {OAuthSessionParams} params
   */
  async _update_auth_info(params) {
    // need to validate checks or redirect to login, depends
    // on the configuration.
    try {
      const token_info = await this.get_token_info(
        params.access_token,
        'access_token'
      )
    } catch (err) {}
  }

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
   * Implements the authentication check middleware. If called request
   * must be authenticated against oauth2 to proceed. Use login_middleware
   * to create a login page redirect.
   * @param {string} auth_redirect_path The authentication path to redirect to.
   * @returns {(req:Request,res:Response, next:NextFunction)=>{}} Auth middleware
   */
  auth_middleware(auth_redirect_path = null) {
    auth_redirect_path = auth_redirect_path || this.basepath

    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercrept = async (req, res, next) => {
      if (req.path == auth_redirect_path) return next()

      try {
        const params = this.read_oauth_session_params(req)

        const redirect_to_login = () => {
          const redirecturl = `${auth_redirect_path}?origin=${encodeURIComponent(
            req.originalUrl
          )}`

          return res.redirect(redirecturl)
        }

        if (params != null && params.access_token != null) {
          const elapsed_since_last_check =
            params.updated == null
              ? Infinity
              : milliseconds_utc_since_epoc() - params.updated

          const elapsed_since_authenticated =
            params.authenticated == null
              ? Infinity
              : milliseconds_utc_since_epoc() - params.authenticated

          if (
            params.access_token != null &&
            this.expires_in != null &&
            elapsed_since_authenticated > this.expires_in
          ) {
            return res.redirect(
              `${auth_redirect_path}?revoke=true&&redirect_to=${encodeURIComponent(
                req.originalUrl
              )}`
            )
          } else if (
            (params.token_info == null && this.token_introspect_url != null) ||
            elapsed_since_last_check > this.recheck_interval ||
            params.is_access_granted == null
          ) {
            if (this.token_introspect_url != null) {
              // need to validate checks or redirect to login, depends
              // on the configuration.
              params.token_info = await this.get_token_info(
                params.access_token,
                'access_token'
              )

              // checking access
              if (params.token_info.active != true) {
                params.access_token = null
                params.is_access_granted = false
              } else
                params.is_access_granted =
                  this.access_validators.length > 0
                    ? this.access_validators.every((av) =>
                        av(params.token_info)
                      )
                    : true

              params.username = this.username_from_token_info_path
                .map((p) => value_from_object_path(params.token_info, p))
                .filter((v) => v != null)[0]
            } else {
              assert(
                this.access_validators.length == 0,
                'Access validators were provided but token_introspect_url is null'
              )
              params.username = 'Anonymous'
              params.is_access_granted = true
            }

            params.token_ident =
              params.access_token == null ? '??????' : params.access_token
            params.token_ident =
              params.token_ident.length < 6
                ? '[short]'
                : params.token_ident.substr(params.token_ident.length - 6)

            // update timestamp and access token.
            this.write_oauth_session_params(req, res, params)

            this.logger.info(
              `Authentication info updated for ${params.username}. (TID: ${
                params.token_ident
              }, Access ${params.is_access_granted ? 'GRANTED' : 'DENIED'})`
            )
          }
        }

        if (params == null || params.access_token == null)
          return redirect_to_login()

        if (params.is_access_granted === false)
          throw new StratisNotAuthorizedError()

        // updating the user object.
        let user_object = req[this.request_user_object_key] || {}
        if (typeof user_object != 'object') user_object = {}
        user_object = Object.assign(user_object, {
          username: user_object.username || params.username,
          access_token: params.access_token,
          token_info: params.token_info,
        })

        req[this.request_user_object_key] = user_object
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

      const query = Object.assign(
        {},
        req.query || {},
        JSON.parse(req.body || '{}')
      )

      try {
        if (query.error != null) throw new Error(`${JSON.stringify(query)}`)

        let oauth_redirect_uri =
          this.redirect_url ||
          `${request_url.protocol}//${request_url.host}${request_url.pathname}`

        const session_params = this.read_oauth_session_params(req)

        const is_revoke = req.query.revoke == 'true'

        const is_authentication_request =
          req.query.code == null && query.origin != null
        const is_authentication_response = query.code != null

        if (is_revoke) {
          if (session_params.access_token != null)
            await this.revoke(session_params.access_token, 'access_token')

          session_params.access_token = null
          this.write_oauth_session_params(req, res, session_params)

          return res.redirect(
            req.query.redirect_to ||
              `${request_url.protocol}//${request_url.host}`
          )
        } else if (is_authentication_response) {
          // Case we already authenticated and we need to get the token.
          const auth_state = this.decode_state(req.query.state)

          assert(
            session_params != null &&
              (session_params.state || {}).uuid == auth_state.uuid,
            'Invalid token validation request, session state could not retrieve state validation key'
          )

          const token = await this.get_token(req.query.code, oauth_redirect_uri)

          session_params.authenticated = milliseconds_utc_since_epoc()

          this.write_oauth_session_params(
            req,
            res,
            Object.assign({}, session_params, token)
          )

          return res.redirect(session_params.state.origin)
        } else if (is_authentication_request) {
          // we have not yet authenticated and need redirect.
          const origin = query.origin || '/'

          const session_params = this.write_oauth_session_params(req, res, {
            state: Object.assign(
              {},
              this.state_generator ? await this.state_generator() : {},
              {
                updated_at: new Date().getTime(),
                uuid: StratisOAuth2Provider.create_uuid(),
                origin,
              }
            ),
          })

          const authorize_url = this.compose_authorize_url(
            oauth_redirect_uri,
            session_params.state
          )

          this.logger.debug(`Auth redirect when requesting origin: ${origin}`)

          return res.redirect(authorize_url)
        } else {
          throw new Error('unknown auth request: ' + request_url.href)
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
}

module.exports = {
  StratisOAuth2Provider,
  /** @type {StratisOAuth2ProviderOptions} */
  StratisOAuth2ProviderOptions: {},
}
