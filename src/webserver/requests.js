const { throws } = require('assert')
const path = require('path')
const { assert, path_stat, path_exists } = require('../common.js')
const is_websocket_request =
  require('../utils/websocket.js').is_websocket_request

/**
 * @typedef {import('fs').Stats} Stats
 * @typedef {import('./stratis').Stratis} Stratis
 * @typedef {import('./interfaces').StratisExpressRequest} StratisExpressRequest
 * @typedef {import('./interfaces').StratisExpressResponse} StratisExpressResponse
 * @typedef {import('./pages').StratisPageCallContext} StratisPageCallContext
 */

/**
 * The type of code object. See documentation in readme.
 * @typedef { "public" | "private" | "secure" } StratisFileAccessMode
 */

const ACCESS_MODIFIERS_MATCH_REGEX =
  /([^\w]|^)(private|public|secure)([^\w]|$)/g

class StratisRequest {
  /**
   * @param {object} param0
   * @param {string} param0.serve_path The search path for the request stratis files.
   * @param {Stratis} param0.stratis
   * @param {StratisExpressRequest} param0.request
   * @param {StratisFileAccessMode} param0.access_mode
   * @param {boolean} param0.log_errors
   * @param {boolean} param0.return_stack_trace_to_client
   * @param {string} param0.request_user_object_key
   * @param {StratisPageCallContext} param0.context
   */
  constructor({
    serve_path,
    stratis,
    request,
    access_mode = null,
    access_modifiers_match_regex = ACCESS_MODIFIERS_MATCH_REGEX,
    log_errors = true,
    return_stack_trace_to_client = null,
    request_user_object_key = 'user',
    context = null,
  } = {}) {
    // Validate input
    assert(
      serve_path != null && typeof serve_path == 'string',
      'src path cannot be null and must be a string'
    )
    assert(stratis != null, 'stratis cannot be null')
    assert(request != null, 'request cannot be null')

    this.serve_path = serve_path
    this.access_modifiers_match_regex = access_modifiers_match_regex

    this._stratis = stratis
    this._request = request
    this._log_errors = log_errors
    this._return_stack_trace_to_client = return_stack_trace_to_client
    this._request_user_object_key = request_user_object_key
    this._url = new URL(request.url, `http://${request.headers.host}`)

    /** @type {StratisFileAccessMode} */
    this._access_mode = access_mode || 'public'

    /** @type {string} */
    this._query_path = null
    /** @type {string} */
    this._api_path = null
    this._filepath_exists = false
    this._is_page = false
    /** @type {StratisPageCallContext} */
    this._context = context
  }

  /**
   * The stratis api.
   */
  get stratis() {
    return this._stratis
  }

  /**
   * The enhanced express object.
   */
  get request() {
    return this._request
  }

  /**
   * Return the active page context.
   */
  get context() {
    return this._context
  }

  /**
   * The original url.
   */
  get url() {
    return this._url
  }

  /**
   * The access mode of this request.
   */
  get access_mode() {
    return this._access_mode
  }

  /**
   * The original query path.
   */
  get query_path() {
    return this._query_path
  }

  /**
   * The path to the api call
   */
  get api_path() {
    return this._api_path
  }

  /**
   * The path to the template file.
   */
  get filepath() {
    return path.join(this.serve_path, this.query_path)
  }

  /**
   * The path to the codefile.
   */
  get codepath() {
    return path.join(
      this.serve_path,
      this.stratis.compose_codefile_path(this.query_path)
    )
  }

  /**
   * If true then this is a websocket request.
   */
  get is_websocket_request() {
    return is_websocket_request(this.request)
  }

  /**
   * If true, returns errors to client on this request.
   */
  get return_stack_trace_to_client() {
    return (
      this._return_stack_trace_to_client ||
      this.stratis.logging_options.return_stack_trace_to_client
    )
  }

  /**
   * If true, returns errors to client on this request.
   */
  set return_stack_trace_to_client(val) {
    this._return_stack_trace_to_client = val == true
  }

  /**
   * If true, logs errors for this request.
   */
  get log_errors() {
    return this._log_errors
  }

  /**
   * If true, logs errors for this request.
   */
  set log_errors(val) {
    this.log_errors = val == true
  }

  /**
   * @type {boolean}
   */
  get is_page() {
    return this._is_page || false
  }

  /**
   * If true, this is a codefile path.
   */
  get is_codefile() {
    return this.stratis.is_codefile(this.query_path)
  }

  /**
   * If true then the template file exists.
   */
  get filepath_exists() {
    return this._filepath_exists || false
  }

  /**
   * Retrieve the user information.
   * @returns {Object<string,any>} The user information.
   */
  async get_user_info() {
    if (this.stratis.session_options.get_user_info == null) return {}

    return await this.stratis.session_options.get_user_info(this)
  }

  /**
   * Check if the current security is permitted.
   * @param  {...any} args User parameters to check
   * @returns
   */
  async is_permitted(...args) {
    if (this.stratis.session_options.is_permitted == null) return true
    return await this.stratis.session_options.is_permitted(this, ...args)
  }

  /**
   * Check if the current user is allowed to access secure resources.
   * Must be authenticated.
   */
  async is_secure_permitted() {
    if (this.stratis.session_options.is_secure_permitted == null) return true
    return await this.stratis.session_options.is_secure_permitted(this)
  }

  /**
   * Called to resolve the query path, will
   * match the first matching file within the query path.
   */
  async _resolve_query_path() {
    let path_items = this.url.pathname
      .split('/')
      .map((i) => i.trim())
      .filter((i) => i.length > 0)

    let cur_path_items = []
    while (path_items.length > 0) {
      cur_path_items.push(path_items.shift())

      let stat = await path_stat(path.join(this.serve_path, ...cur_path_items))
      if (stat == null) return null // dose not exist
      if (stat.isFile()) break
    }

    return {
      query_path: path.join(...cur_path_items),
      api_path: path_items.length == 0 ? null : path.join(...path_items),
    }
  }

  /**
   * Initializes the startis request and collects
   * information about the request. Called by the stratis system
   * do not call directly.
   */
  async initialize() {
    const paths = await this._resolve_query_path()
    if (paths == null) return
    this._filepath_exists = true
    this._query_path = paths.query_path
    this._api_path = paths.api_path

    // check access modifiers
    if (this.is_codefile) {
      // codefiles are always private and never a page.
      this._access_mode = 'private'
      return
    } else {
      const modifiers_matches = [
        ...this.query_path.matchAll(this.access_modifiers_match_regex),
      ]
      const modifiers = new Set(modifiers_matches.map((m) => m[2]))

      if (modifiers.has('private')) this._access_mode = 'private'
      else if (modifiers.has('secure')) this._access_mode = 'secure'
      else if (modifiers.has('public')) this._access_mode = 'public'
    }

    this._is_page =
      new Set(this.stratis.page_options.page_extensions).has(
        path.extname(this.query_path)
      ) || (await path_exists(this.codepath))

    return this
  }
}

module.exports = {
  StratisRequest,
}
