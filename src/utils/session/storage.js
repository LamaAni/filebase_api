const Cookies = require('cookies')
const { assert, assert_non_empty_string, filter_null } = require('../../common')
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
  save(req, res) {
    throw new StratisNotImplementedError('abstract method')
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  load(req, res) {
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
 * @property {boolean} httpOnly boolean indicating whether the cookie is only to be sent over HTTP(S), and not made available to client JavaScript (true by default).
 * @property {[string]|string} sign_with_keys A single/list of keys to sign the cookie with. Errors if changed.
 * @property {boolean} overwrite boolean indicating whether to overwrite previously set cookies of the same name (true by default).
 * @property {'strict'|'lax'|'none'} sameSite  If 'strict' dose not allow to send cookie over the we to other locations. defaults to 'lax'
 * @property {number} max_count The maximal number of part cookies (also size, n*max_size). Defaults to 25.
 * @property {number} max_size The maximal size for one cookie. Defaults to 4096. Total session size = max_size*max_count
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
    path = '/',
    domain = null,
    secure = false,
    httpOnly = false,
    overwrite = true,
    sign_with_keys = null,
    max_count = 25,
    max_size = 4096,
  }) {
    super()

    assert_non_empty_string(name, 'Name must be a non empty string')
    assert_non_empty_string(path, 'path must be a non empty string')
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

    expires = expires || maxAge == null ? null : Date.now() + maxAge

    this.cookie_options = filter_null({
      maxAge,
      expires,
      path,
      domain,
      secure,
      httpOnly,
      overwrite,
    })

    assert(
      max_size > name.length + 5,
      'max size must be larger then name.length + 5'
    )

    this.sign_with_keys = sign_with_keys
    this.extra_config = extra_config
    this.name = name
    this.max_count = max_count
    this.max_size = max_size
  }

  __compose_cookie_name_by_index(idx) {
    return idx == 0 ? this.name : `${this.name}:${idx}`
  }

  /**
   * @param {string} value
   */
  __split_to_cookie_size(value) {
    // size max 4096 - name length - 3 chars for index - 1 char for equal - 1 char for colunm
    const max_char_count = this.max_size - this.name.length - 5
    return value.match(new RegExp(`.{1,${max_char_count}}`, 'g'))
  }

  /**
   * @param {Cookies} cookies
   */
  __get_exsiting_value_parts(cookies) {
    let values = []
    let idx = 0
    while (true) {
      const val = cookies.get(this.__compose_cookie_name_by_index(idx), {
        signed: this.sign_with_keys.length > 0,
        keys: this.sign_with_keys.length > 0 ? this.sign_with_keys : null,
      })
      if (val == null) break
      values.push(val)
      idx += 1
    }
    return values
  }

  /**
   * @param {Request} req
   * @param {Response} res
   * @param {string} value
   */
  save(req, res, value) {
    if (typeof value == 'object') value = JSON.stringify(value)

    assert(
      value == null || typeof value == 'string',
      'value must be an object, a string or null'
    )

    const options = Object.assign({}, this.cookie_options, {
      signed: this.sign_with_keys.length > 0,
      keys: this.sign_with_keys.length > 0 ? this.sign_with_keys : null,
    })

    const cookies = new Cookies(req, res)
    const value_parts = this.__split_to_cookie_size(value)
    const existing_value_parts = this.__get_exsiting_value_parts(cookies)
    const max_count =
      value_parts.length > existing_value_parts.length
        ? value_parts.length
        : existing_value_parts.length

    for (let i = 0; i < max_count; i++) {
      const value = value_parts.length > i ? value_parts[i] : null
      cookies.set(this.__compose_cookie_name_by_index(i), value, options)
    }
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  load(req, res) {
    return this.__get_exsiting_value_parts(new Cookies(req, res)).join('')
  }
}

module.exports = {
  StratisSessionStorageProvider,
  StratisSessionCookieStorageProvider,
}
