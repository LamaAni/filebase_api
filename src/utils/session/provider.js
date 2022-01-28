const {
  encrypt_string,
  decrypt_string,
  assert,
  to_base64,
  from_base64,
  assert_non_empty_string_or_null,
} = require('../../common')

const { concat_errors } = require('../../errors')
const {
  StratisSessionStorageProvider,
  from_storage_type_name,
} = require('./storage')
const { StratisSessionProviderContext } = require('./context')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('../../webserver/interfaces').StratisLogger} StratisLogger
 * @typedef {import('./storage').StratisSessionStorageProvider} StratisSessionStorageProvider
 * @typedef {import('./storage').StratisSessionStorageProviderOptions} StratisSessionStorageProviderOptions
 * @typedef {import('./storage').StratisSessionStorageProviderType} StratisSessionStorageProviderType
 */

/**
 * @typedef {Object} StratisSessionProviderOptions
 * @property {StratisSessionStorageProvider|StratisSessionStorageProviderType} storage_provider The storage provider to use.
 * @property {StratisSessionStorageProviderOptions} storage_options Overrides for the storage provider options.
 * @property {string} encryption_key The encryption key to use for the session state. If null no encryption.
 * @property {number} cookie_subdomain_count  The number of subdomain elements to use for
 * @property {boolean} ingore_errors Populate an empty state on error, and log out the error.
 * the session cookie domain (auto generated). If null or domain is already set, no auto domain.
 *  example: For a request from a.b.c.d.com, and cookie_subdomain_count=2,
 *    cookie domain=>".b.c.d.com.". Defaults to 0.
 * @property {StratisLogger} logger The associated logger. Defaults to console.
 *
 */

class StratisSessionProvider {
  /**
   * Construct a new session provider
   * @param {StratisSessionProviderOptions} options
   */
  constructor({
    storage_provider = 'cookie',
    storage_options = null,
    encryption_key = null,
    cookie_subdomain_count = 0,
    logger = null,
    ingore_errors = true,
  } = {}) {
    if (typeof storage_provider == 'string')
      storage_provider = new (from_storage_type_name(storage_provider))(
        storage_options || {}
      )

    assert(
      storage_provider instanceof StratisSessionStorageProvider,
      'storage_provider must be of type StratisSessionStorageProvider'
    )

    assert_non_empty_string_or_null(
      encryption_key,
      'encryption_key Must be null or a non empty string'
    )

    storage_provider.options = Object.assign(
      {},
      storage_provider.options,
      storage_options || {}
    )

    this.ingore_errors = ingore_errors
    this.encryption_key = encryption_key
    this.storage_provider = storage_provider
    this.cookie_subdomain_count =
      cookie_subdomain_count == null ? -1 : cookie_subdomain_count

    /** @type {StratisLogger} */
    this.logger = logger || console
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
    if (this.encryption_key != null) {
      value = encrypt_string(value, this.encryption_key)
    } else {
      value = to_base64(value)
    }
    return value
  }

  decode(value, ingore_errors = null) {
    ingore_errors = ingore_errors === null ? this.ingore_errors : ingore_errors

    if (value == null) return {}
    // return value
    try {
      if (this.encryption_key != null) {
        value = decrypt_string(value, this.encryption_key)
      } else {
        value = from_base64(value)
      }
    } catch (err) {
      this.logger.error(
        concat_errors('Error decoding session state', err).stack
      )
      if (ingore_errors) throw err
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
    /**
     * @param {Error} err
     * @returns {boolean} True if error is to be thrown.
     */
    const handle_errors = (err, msg = 'Error processing session state') => {
      err = concat_errors(msg, err)
      if (this.ingore_errors === true) {
        this.logger.error(err.stack || `${err}`)
        return false
      }
      return true
    }

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
          if (handle_errors(err, 'Error writing session state headers'))
            throw err
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
          if (handle_errors(err, 'Error committing session state')) throw err
        }
        return original_res_end.apply(res, args)
      }
    } catch (err) {
      if (handle_errors(err)) next(err)

      req.session = req.session || {}
    }
    next()
  }
}

module.exports = {
  StratisSessionProvider,
  StratisSessionProviderContext,
}

if (require.main == module) {
  new StratisSessionProvider({
    storage_provider: 'cookie',
  })
  new StratisSessionProvider({
    storage_provider: 'etcd',
    storage_options: {
      hosts: 'https://localhost:3232',
    },
  })
}
