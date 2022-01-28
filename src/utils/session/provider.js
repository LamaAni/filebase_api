const {
  encrypt_string,
  decrypt_string,
  assert,
  to_base64,
  from_base64,
  assert_non_empty_string_or_null,
  milliseconds_utc_since_epoc,
} = require('../../common')
const { concat_errors } = require('../../errors')
const { StratisSessionStorageProvider } = require('./storage')
const Cookies = require('cookies')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('../../webserver/interfaces').StratisLogger} StratisLogger
 * @typedef {import('./storage').StratisSessionStorageProvider} StratisSessionStorageProvider
 * @typedef {import('./storage').StratisSessionStorageProviderOptions} StratisSessionStorageProviderOptions
 */

class StratisSessionProviderContext {
  /**
   * @param {Request} req The express request
   * @param {Response} res The express response
   * @param {StratisSessionProvider} provider
   * @param {{}} data The session data.
   * @param {StratisSessionStorageProviderOptions} storage_options Extended storage options
   * for the current session (overrides storage_provider options)
   */
  constructor(req, res, provider, data = null, storage_options = null) {
    this.req = req
    this.res = res
    this.data = data
    this.provider = provider
    this._source_session_json_value = null
    this._session_json_value = null
    this.accessed = false
    /** @type {StratisSessionStorageProviderOptions} */
    this.storage_options = storage_options || {}
  }

  has_changed() {
    if (!this.accessed) return false
    this.update_session_value()
    return this._session_json_value != this._source_session_json_value
  }

  update_session_value() {
    if (!this.accessed) return
    this._session_json_value = JSON.stringify(this.data)
  }

  get_session_value() {
    return this.provider.encode(this._session_json_value)
  }

  /**
   * @param {string} name
   * @param {string} value
   * @param {Cookies.SetOption} options
   */
  write_cookie(name, value, options) {
    assert(
      value == null || typeof value == 'string',
      'Value must be a string or null'
    )
    return new Cookies(this.req, this.res).set(name, value, options)
  }

  /**
   * @param {string} name
   * @param {Cookies.GetOption} options
   * @returns {string} the value or null
   */
  read_cookie(name, options) {
    return new Cookies(this.req, this.res).get(name, options)
  }

  /**
   * Commit the session changes (if any)
   */
  async commit() {
    await this.provider.storage_provider.commit(this)
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  async initialize() {
    try {
      if (this.req.session != null)
        this.provider.logger.warn(
          'Another session proprietor has already set the session value for the request. req.session was overwritten'
        )

      // updating the cookie domain
      if (
        this.provider.cookie_subdomain_count > -1 &&
        this.provider.storage_provider.options.domain == null
      ) {
        // domain is null
        // and we have a subdomain count.
        const is_localhost =
          this.req.hostname.split('.').slice(-1)[0] == 'localhost'
        const total_including_subdomain =
          (is_localhost ? 1 : 2) + this.provider.cookie_subdomain_count
        let domain_parts = this.req.hostname
          .split('.')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)

        if (domain_parts.length > total_including_subdomain)
          domain_parts = domain_parts.slice(-total_including_subdomain)

        // auto domain includes subdomains for auth cookie persistence.
        this.storage_options.domain =
          (is_localhost ? '' : '.') + domain_parts.join('.')
      }

      // We cannot dynamically load the session value since we may not have
      // an async response in the value getter.
      // Therefore the session state must be loaded every time. (Slow?)

      this.req.stratis_session_provider_context = this
      this._source_session_json_value = this.provider.decode(
        await this.provider.storage_provider.load(this)
      )

      let parsed_data_object = {}
      try {
        parsed_data_object = JSON.parse(this._source_session_json_value)
      } catch (err) {}

      this.data = Object.assign({}, this.data || {}, parsed_data_object)

      this.req.session = new Proxy(this.data, {
        get: (obj, prop) => {
          this.accessed = true
          return obj[prop]
        },
        set: (obj, prop, value) => {
          this.accessed = true
          obj[prop] = value
          return true
        },
      })

      return this
    } catch (err) {
      throw concat_errors(
        new Error('Failed to initialize session provider'),
        err
      )
    }
  }

  /**
   * Write the response headers (if any)
   */
  write_headers() {
    this.provider.storage_provider.write_headers(this)
  }

  /**
   * @param {Request} req
   * @returns {StratisSessionProviderContext}
   */
  static from_request(req) {
    return req.stratis_session_provider_context
  }
}

/**
 * @typedef {Object} StratisSessionProviderOptions
 * @property {StratisSessionStorageProvider} storage_provider The storage provider to use.
 * @property {string} encryption_key The encryption key to use for the session state. If null no encryption.
 * @property {StratisLogger} logger The associated logger. Defaults to console.
 * @property {number} cookie_subdomain_count  The number of subdomain elements to use for
 * the session cookie domain (auto generated). If null or domain is already set, no auto domain.
 *  example: For a request from a.b.c.d.com, and cookie_subdomain_count=2,
 *    cookie domain=>".b.c.d.com.". Defaults to 0.
 */

class StratisSessionProvider {
  /**
   * Construct a new session provider
   * @param {StratisSessionProviderOptions} options
   */
  constructor({
    storage_provider,
    encryption_key = null,
    logger = null,
    cookie_subdomain_count = 0,
  } = {}) {
    assert(
      storage_provider instanceof StratisSessionStorageProvider,
      'storage_provider must be of type StratisSessionStorageProvider'
    )

    assert_non_empty_string_or_null(
      encryption_key,
      'encryption_key Must be null or a non empty string'
    )

    this.encryption_key = encryption_key
    /** @type {StratisLogger} */
    this.logger = logger || console
    this.storage_provider = storage_provider
    this.cookie_subdomain_count =
      cookie_subdomain_count == null ? -1 : cookie_subdomain_count
  }

  /**
   * @param {string} as_json The json loaded string.
   */
  parse_session_data(as_json) {
    if (as_json == null) return {}

    assert(typeof as_json == 'string', 'as_json must be of type string or null')

    let data = {}
    try {
      data = JSON.parse(as_json)
    } catch (err) {}

    assert(
      typeof data == 'object',
      'Parsed session data did not return an object'
    )

    return data
  }

  stringify_session_data(data) {
    data = data || {}
    assert(typeof data == 'object', 'data myst be of type object')

    let as_json = JSON.stringify(data)
    return as_json
  }

  encode(value) {
    // return value
    if (value == null) return null
    if (this.encryption_key != null)
      value = encrypt_string(value, this.encryption_key)
    else value = to_base64(value)
    return value
  }

  decode(value, throw_errors = false) {
    if (value == null) return {}
    // return value
    try {
      if (this.encryption_key != null)
        value = decrypt_string(value, this.encryption_key)
      else value = from_base64(value)
    } catch (err) {
      this.logger.error(
        concat_errors('Error decoding session state', err).stack
      )
      if (throw_errors) throw err
      return null
    }
    return value
  }

  /**
   * The express api middleware.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req, res, next) {
    try {
      // creating the context.
      const context = await new StratisSessionProviderContext(
        req,
        res,
        this
      ).initialize()

      let _has_changed = null
      const has_changed = () => {
        if (_has_changed == null) _has_changed = context.has_changed()
        return _has_changed
      }

      let session_has_error = false

      const original_write_head = res.writeHead
      res.writeHead = (...args) => {
        try {
          if (!session_has_error && has_changed()) {
            context.write_headers()
            this.logger.debug(`Session state response header data written`)
          }
        } catch (err) {
          session_has_error = true
          return next(err)
        }
        return original_write_head.apply(res, args)
      }

      const original_res_end = res.end
      res.end = async (...args) => {
        try {
          if (!session_has_error && has_changed()) {
            await context.commit()
            this.logger.debug(`Session state async data written`)
          }
        } catch (err) {
          session_has_error = true
          return next(err)
        }
        return original_res_end.apply(res, args)
      }
    } catch (err) {
      next(err)
    }
    next()
  }
}

module.exports = {
  StratisSessionProvider,
  StratisSessionProviderContext,
}
