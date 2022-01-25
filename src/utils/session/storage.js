const Cookies = require('cookies')
const { assert, assert_non_empty_string } = require('../../common')
const { StratisNotImplementedError } = require('../../webserver/errors')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 */

class StratisSessionStorageProvider {
  constructor() {
    throw new StratisNotImplementedError('abstract class')
  }
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
 * @typedef {(req:Request,res:Response,value:any,provider:StratisSessionCookieStorageProvider)=>any} CSPGetValue
 * Create a new cookie session middleware.
 * @typedef {object} CookieSessionOptions
 * @property {string|CSPGetValue} name The session cookie name
 * @property {[string]|CSPGetValue} keys The signature keys.
 * @property {number|CSPGetValue} maxAge number representing the milliseconds from Date.now() for expiry
 * @property {Date|CSPGetValue} expires Date indicating the cookie's expiration date (expires at the end of session by default).
 * @property {string|CSPGetValue} path string indicating the path of the cookie (/ by default).
 * @property {string|CSPGetValue} domain string indicating the domain of the cookie (no default).
 * @property {boolean|CSPGetValue} secure boolean indicating whether the cookie is only to be sent over HTTPS (false by default for HTTP, true by default for HTTPS).
 * @property {boolean|CSPGetValue} secureProxy boolean indicating whether the cookie is only to be sent over HTTPS (use this if you handle SSL not in your node process).
 * @property {boolean|CSPGetValue} httpOnly boolean indicating whether the cookie is only to be sent over HTTP(S), and not made available to client JavaScript (true by default).
 * @property {boolean|CSPGetValue} signed boolean indicating whether the cookie is to be signed (true by default).
 * @property {boolean|CSPGetValue} overwrite boolean indicating whether to overwrite previously set cookies of the same name (true by default).
 */

class StratisSessionCookieStorageProvider extends StratisSessionStorageProvider {
  /**
   * @param {CookieSessionOptions} param0
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
    signed = null,
    overwrite = null,
  }) {
    assert_non_empty_string(name, 'Name must be a non empty string')
    assert(
      extra_config == null || typeof extra_config == 'object',
      'extra_config must be a dictionary or none'
    )

    this.cookie_options = {
      maxAge,
      expires,
      path,
      domain,
      secure,
      secureProxy,
      httpOnly,
      signed,
      overwrite,
    }
    this.extra_config = extra_config
    this.name = name
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  async save(req, res, value) {
    const cookies = new Cookies(req, res)
    /**
     * @param {CSPGetValue|*} prop
     */
    const get_value = async (prop) => {
      if (typeof prop == 'function') return await prop(req, res, value, this)
      return prop
    }

    if (typeof value == 'object') value = JSON.stringify(value)

    assert(
      value == null || typeof value == 'string',
      'value must be an object, a string or null'
    )

    const opts = {}
    for (let e of Object.entries(this.cookie_options)) {
      opts[e[0]] = await get_value(e[1])
    }

    cookies.set(await get_value(this.name), value, opts)
  }

  /**
   * @param {Request} req
   * @param {Response} res
   */
  async load(req, res) {}
}
