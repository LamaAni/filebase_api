const on_headers = require('on-headers')
const {
  encrypt_string,
  decrypt_string,
  assert,
  to_base64,
  from_base64,
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
    if (this.encryption_key != null)
      return encrypt_string(value, this.encryption_key)
    else return to_base64(value)
  }

  decode(value, throw_errors = false) {
    try {
      if (this.encryption_key != null)
        return decrypt_string(value, this.encryption_key)
      else return from_base64(value)
    } catch (err) {
      this.logger.debug(`Error decoding session state: ${err.state || err}`)
      if (throw_errors) throw err
      return null
    }
  }

  /**
   * The express api middleware.
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req, res, next) {
    try {
      const request_session_value = this.decode(
        await this.storage_provider.load(req, res)
      )

      const session_data = this.parse_session_data(request_session_value)
      let accessed = false

      req.session = new Proxy(session_data, {
        get: (obj, prop) => {
          accessed = true
          return obj[prop]
        },
        set: (obj, prop, value) => {
          accessed = true
          obj[prop] = value
          return true
        },
      })

      const write_session_data = () => {
        if (session_data.do_not_update === true) return
        // if (!accessed) return
        const response_session_value = this.stringify_session_data(session_data)
        if (response_session_value == request_session_value) {
          return
        }

        try {
          const encoded_value = this.encode(response_session_value)
          this.storage_provider.save(req, res, encoded_value)
          this.logger.debug(
            `Session state data updated (${
              encoded_value.length
            } bytes) starting with ${encoded_value.substring(0, 5)}`.blue
          )
        } catch (err) {
          this.logger.error(
            `Error while saving session state. ${err.stack || err}`
          )
          throw err
        }
      }

      // on_headers(res, write_session_data)

      const original_write_head = res.writeHead
      res.writeHead = (...args) => {
        write_session_data()
        return original_write_head.apply(res, args)
      }
    } catch (err) {
      next(err)
    }
    next()
  }
}

module.exports = {
  StratisSessionProvider,
}
