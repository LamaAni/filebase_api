const Cookies = require('cookies')
const { Etcd3 } = require('etcd3')

const { StratisSessionStorageProvider } = require('./core')
const { StratisError } = require('../../../errors')
const { create_uuid } = require('../../../common')

const {
  assert,
  assert_non_empty_string,
  filter_null,
} = require('../../../common')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('etcd3').IOptions} EtcdOptions
 * @typedef {import('../provider').StratisSessionProviderContext} StratisSessionProviderContext
 * @typedef {import('./core').StratisSessionStorageProviderOptions} StratisSessionStorageProviderOptions
 */

/**
 * @typedef { StratisSessionStorageProviderOptions & EtcdOptions} StratisSessionEtcdStorageProviderOptions
 */

/** @type {CookieSetOptions} */
const DEFAULT_COOKIE_OPTIONS = {}

class StratisSessionEtcdStorageProvider extends StratisSessionStorageProvider {
  /**
   * Creates an etcd options provider
   * @param {StratisSessionEtcdStorageProviderOptions} param0
   */
  constructor({
    hosts,
    name = 'stratis:session',
    extra_config = null,
    maxAge = null,
    expires = null,
    path = '/',
    domain = null,
    secure = false,
    httpOnly = false,
    overwrite = true,
    sameSite = null,
    sign_with_keys = null,
    auth = null,
    credentials = null,
    defaultCallOptions = null,
    dialTimeout = null,
    faultHandling = null,
    grpcOptions = null,
  } = {}) {
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

    this.client = new Etcd3(
      filter_null({
        hosts,
        auth,
        credentials,
        defaultCallOptions,
        dialTimeout,
        faultHandling,
        grpcOptions,
      })
    )
  }
  /**
   * @param {StratisSessionProviderContext} context
   * @param {boolean} can_create
   * @returns {string} The initialize value
   */
  get_session_id(context, can_create = false) {
    let session_id = context.session_id

    // read from cookie
    if (session_id == null)
      session_id = context.read_cookie(this.name, this.cookie_options)

    // validate
    if (session_id != null && session_id.match(/[^0-9a-zA-Z-]/g))
      session_id = null

    if (session_id == null)
      if (!can_create) throw new Error('Could not find or create session id')
      else {
        session_id = create_uuid()
        context.write_cookie(this.name, session_id)
      }

    context.session_id = session_id

    return session_id
  }

  /**
   * @param {StratisSessionProviderContext} context
   * @returns {string} The initialize value
   */
  async load(context) {
    const session_id = this.get_session_id(context, true)
    const val = await this.client.get(session_id)
    if (val == null) return null

    return await val.toString()
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
  async commit(context) {
    const session_id = this.get_session_id(context, false)
    return await this.client.put(session_id).value(context.get_session_value())
  }
}

module.exports = {
  StratisSessionEtcdStorageProvider,
}
