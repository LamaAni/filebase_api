const Cookies = require('cookies')
const {
  assert,
  assert_non_empty_string,
  filter_null,
} = require('../../../common')
const { StratisNotImplementedError } = require('../../../errors')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('../provider').StratisSessionProviderContext} StratisSessionProviderContext
 */

/**
 * @typedef StratisSessionStorageProviderOptions
 * @property {string} name The session cookie name
 * @property {number} maxAge number representing the milliseconds from Date.now() for expiry
 * @property {Date} expires Date indicating the cookie's expiration date (expires at the end of session by default).
 * @property {string} path string indicating the path of the cookie (/ by default).
 * @property {string} domain string indicating the domain of the cookie (no default).
 * @property {boolean} secure boolean indicating whether the cookie is only to be sent over HTTPS (false by default for HTTP, true by default for HTTPS).
 * @property {boolean} httpOnly boolean indicating whether the cookie is only to be sent over HTTP(S), and not made available to client JavaScript (true by default).
 * @property {'strict'|'lax'|'none'} sameSite  If 'strict' dose not allow to send cookie over the we to other locations. defaults to 'lax'
 * @property {[string]|string} sign_with_keys A single/list of keys to sign the cookie with. Errors if changed.
 * @property {boolean} overwrite boolean indicating whether to overwrite previously set cookies of the same name (true by default).
 */

class StratisSessionStorageProvider {
  /**
   * @param {StratisSessionStorageProviderOptions} options
   */
  constructor({
    name = 'stratis:session',
    maxAge = null,
    expires = null,
    path = '/',
    domain = null,
    secure = false,
    httpOnly = false,
    overwrite = true,
    sameSite = null,
    sign_with_keys = null,
  }) {
    assert_non_empty_string(name, 'Name must be a non empty string')
    assert_non_empty_string(path, 'path must be a non empty string')

    if (typeof keys == 'string') sign_with_keys = [keys]
    sign_with_keys = sign_with_keys || []

    assert(
      Array.isArray(sign_with_keys),
      'sign_with_keys must be an array, string or null'
    )

    expires = expires || maxAge == null ? null : Date.now() + maxAge

    this.cookie_options = filter_null({
      maxAge,
      expires,
      path,
      domain,
      secure,
      httpOnly,
      overwrite,
      sameSite,
      sign: sign_with_keys.length > 0,
      keys: sign_with_keys.length > 0 ? this.sign_with_keys : null,
    })

    this.name = name
  }

  /**
   * @param {StratisSessionProviderContext} context
   * @returns {string} The initialize value
   */
  async load(context) {
    throw new StratisNotImplementedError('abstract')
  }

  /**
   * Used to write any response headers (including cookies) (Sync!)
   * @param {StratisSessionProviderContext} context
   */
  write_headers(context) {}

  /**
   * Commit changes. Can be async.
   * @param {StratisSessionProviderContext} context
   */
  async commit(context) {}
}

module.exports = {
  StratisSessionStorageProvider,
}
