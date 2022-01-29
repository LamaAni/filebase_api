const { assert } = require('../../common')
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
      let needs_reset = false
      try {
        if (this._source_session_json_value != null) {
          parsed_data_object = JSON.parse(this._source_session_json_value)
          this.data = Object.assign({}, this.data || {}, parsed_data_object)
        } else needs_reset = true
      } catch (err) {
        needs_reset = true
      }

      if (needs_reset) {
        this.data = Object.assign({}, this.data || {})
        this.accessed = true
      }

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

module.exports = {
  StratisSessionProviderContext,
}
