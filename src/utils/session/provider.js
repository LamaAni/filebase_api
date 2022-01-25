const on_headers = require('on-headers')
const {
  encrypt_string,
  decrypt_string,
  assert,
  assert_non_empty_string,
  assert_non_empty_string_or_null,
} = require('../../common')
const { StratisSessionStorageProvider } = require('./storage')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('../../webserver/interfaces').StratisLogger} StratisLogger
 * @typedef {import('./storage').StratisSessionStorageProvider} StratisSessionStorageProvider
 */

/**
 * @typedef {Object} StratisSessionProviderOptions
 * @property {StratisSessionStorageProvider} storage_provider The storage provider to use.
 * @property {string} encryption_key The encryption key to use for the session state. If null no encryption.
 * @property {StratisLogger} logger The associated logger. Defaults to console.
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
    add_cookies_provider = true,
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
  }

  /**
   * @param {string} as_json The json loaded string.
   */
  parse_session_data(as_json) {
    if (as_json == null) return {}

    assert(typeof as_json == 'string', 'as_json must be of type string or null')

    let data = {}
    try {
      if (this.encryption_key != null)
        as_json = decrypt_string(as_json, this.encryption_key)

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
    if (this.encryption_key != null)
      as_json = encrypt_string(as_json, this.encryption_key)
    return as_json
  }

  /**
   * The express api middleware.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req, res, next) {
    try {
      const session_data = this.parse_session_data(
        await this.storage_provider.load(req, res)
      )

      let changed = false

      const session_data_proxy = new Proxy(session_data, {
        get: (obj, prop) => {
          return obj[prop]
        },
        set: (obj, prop, value) => {
          changed = true
          obj[prop] = value
        },
      })

      // bind proxy data write.
      on_headers(res, () => {
        if (!changed) return
        try {
          this.storage_provider.save(
            req,
            res,
            this.stringify_session_data(session_data)
          )
        } catch (err) {
          this.logger.error(
            `Error while saving session state. ${err.stack || err}`
          )
          throw err
        }
      })

      req.session = session_data_proxy
    } catch (err) {
      next(err)
    }
    next()
  }
}

module.exports = {
  StratisSessionProvider,
}
