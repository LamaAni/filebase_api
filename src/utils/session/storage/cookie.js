const Cookies = require('cookies')
const { assert, sleep } = require('../../../common')
const { StratisSessionStorageProvider } = require('./core')
const { StratisError } = require('../../../errors')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('../provider').StratisSessionProviderContext} StratisSessionProviderContext
 * @typedef {import('./core').StratisSessionStorageProviderOptions} StratisSessionStorageProviderOptions
 */

/**
 * Create a new cookie session middleware.
 * @typedef {object} StratisSessionCookieStorageProviderOptionsExtend
 * @property {number} max_count The maximal number of part cookies (also size, n*max_size). Defaults to 25.
 * @property {number} max_size The maximal size for one cookie. Defaults to 4096. Total session size = max_size*max_count
 *
 * @typedef {StratisSessionStorageProviderOptions & StratisSessionCookieStorageProviderOptionsExtend} StratisSessionCookieStorageProviderOptions
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
    sameSite = null,
    max_count = 25,
    max_size = 4096,
  }) {
    super({
      name,
      extra_config,
      maxAge,
      expires,
      path,
      domain,
      secure,
      httpOnly,
      overwrite,
      sameSite,
      sign_with_keys,
    })

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
   * @param {StratisSessionProviderContext} context
   */
  __get_exsiting_value_parts(context) {
    let values = []
    let idx = 0
    while (true) {
      const val = context.read_cookie(
        this.__compose_cookie_name_by_index(idx),
        this.cookie_options
      )
      if (val == null) break
      values.push(val)
      idx += 1
    }
    return values
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
   * @param {StratisSessionProviderContext} context
   * @param {string} value
   */
  save_cookies_data(context, value) {
    assert(
      value == null || typeof value == 'string',
      'Value must be a string or null'
    )

    const value_parts = this.__split_to_cookie_size(value)

    if (value_parts.length > this.max_count)
      throw new StratisError(
        `Session state size over max size of (including cookie name) ${
          this.max_size * this.max_count
        }`
      )

    const existing_value_parts = this.__get_exsiting_value_parts(context)
    const max_count =
      value_parts.length > existing_value_parts.length
        ? value_parts.length
        : existing_value_parts.length

    for (let i = 0; i < max_count; i++) {
      const value = value_parts.length > i ? value_parts[i] : null
      context.write_cookie(
        this.__compose_cookie_name_by_index(i),
        value,
        this.cookie_options
      )
    }
  }

  /**
   * @param {StratisSessionProviderContext} context
   */
  load_cookies_data(context) {
    let values = this.__get_exsiting_value_parts(context)
    return values.length == 0 ? null : values.join('')
  }

  /**
   * @param {StratisSessionProviderContext} context
   * @returns {string} The initialize value
   */
  load(context) {
    return this.load_cookies_data(context)
  }

  /**
   * Used to write any response headers (including cookies)
   * @param {StratisSessionProviderContext} context
   */
  write_headers(context) {
    const value = context.get_session_value()
    this.save_cookies_data(context, value)
  }

  /**
   * Commit changes.
   * @param {Request} req
   * @param {Response} res
   * @param {StratisSessionProviderContext} context
   */
  commit(req, res, context) {
    // nothing to do here.
  }
}

module.exports = {
  StratisSessionCookieStorageProvider,
}
