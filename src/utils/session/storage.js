const Cookies = require('cookies')
const { assert, assert_non_empty_string } = require('../../common')
const { StratisNotImplementedError } = require('../../webserver/errors')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 */

class StratisSessionStorageProvider {
  constructor() {}
  /**
   * @param {Request} req
   * @param {Response} res
   */
  async save(req, res) {
    throw new StratisNotImplementedError('abstract method')
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  async load(req, res) {
    throw new StratisNotImplementedError('abstract method')
  }
}

/**
 * Create a new cookie session middleware.
 * @typedef {object} StratisSessionCookieStorageProviderOptions
 * @property {string} name The session cookie name
 * @property {number} maxAge number representing the milliseconds from Date.now() for expiry
 * @property {Date} expires Date indicating the cookie's expiration date (expires at the end of session by default).
 * @property {string} path string indicating the path of the cookie (/ by default).
 * @property {string} domain string indicating the domain of the cookie (no default).
 * @property {boolean} secure boolean indicating whether the cookie is only to be sent over HTTPS (false by default for HTTP, true by default for HTTPS).
 * @property {boolean} secureProxy boolean indicating whether the cookie is only to be sent over HTTPS (use this if you handle SSL not in your node process).
 * @property {boolean} httpOnly boolean indicating whether the cookie is only to be sent over HTTP(S), and not made available to client JavaScript (true by default).
 * @property {[string]|string} sign_with_keys A single/list of keys to sign the cookie with. Errors if changed.
 * @property {boolean} overwrite boolean indicating whether to overwrite previously set cookies of the same name (true by default).
 * @property {'strict'|'lax'|'none'} sameSite  If 'strict' dose not allow to send cookie over the we to other locations. defaults to 'lax'
 */

class StratisSessionCookieStorageProvider extends StratisSessionStorageProvider {
  /**
   * @param {StratisSessionCookieStorageProviderOptions} param0
   */
  constructor({
    name = 'stratis:session',
    extra_config = null,
    maxAge = null,
    expires = null,
    path = null,
    domain = null,
    secure = null,
    secureProxy = null,
    httpOnly = null,
    sign_with_keys = null,
    overwrite = null,
  }) {
    super()

    assert_non_empty_string(name, 'Name must be a non empty string')
    assert(
      extra_config == null || typeof extra_config == 'object',
      'extra_config must be a dictionary or none'
    )

    if (typeof keys == 'string') sign_with_keys = [keys]
    sign_with_keys = sign_with_keys || []

    assert(
      Array.isArray(sign_with_keys),
      'sign_with_keys must be an array, string or null'
    )

    this.cookie_options = {
      maxAge,
      expires,
      path,
      domain,
      secure,
      secureProxy,
      httpOnly,
      overwrite,
    }

    this.sign_with_keys = sign_with_keys
    this.extra_config = extra_config
    this.name = name
  }

  /**
   * @param {Request} req
   * @param {Response} res
   * @param {string} value
   */
  async save(req, res, value) {
    if (typeof value == 'object') value = JSON.stringify(value)
    assert(
      value == null || typeof value == 'string',
      'value must be an object, a string or null'
    )

    const options = Object.assign({}, this.cookie_options, {
      signed: this.sign_with_keys.length > 0,
      keys: this.sign_with_keys.length > 0 ? this.sign_with_keys : null,
    })

    new Cookies(req, res).set(this.name, value, options)
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  async load(req, res) {
    return new Cookies(req, res).get(this.name, {
      signed: this.sign_with_keys.length > 0,
      keys: this.sign_with_keys.length > 0 ? this.sign_with_keys : null,
    })
  }
}

module.exports = {
  StratisSessionStorageProvider,
  StratisSessionCookieStorageProvider,
}
