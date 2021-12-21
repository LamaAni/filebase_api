const { throws } = require('assert')
const path = require('path')
const { assert, path_stat, path_exists } = require('../common.js')
const is_websocket_request =
  require('../utils/websocket.js').is_websocket_request

/**
 * @typedef {import('fs').Stats} Stats
 * @typedef {import('./stratis').Stratis} Stratis
 * @typedef {import('./interfaces').Request} Request
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
   * @param {Request} param0.request
   * @param {StratisFileAccessMode} param0.access_mode
   * @param {boolean} param0.log_errors
   * @param {boolean} param0.return_errors_to_client
   */
  constructor({
    serve_path,
    stratis,
    request,
    access_mode = null,
    access_modifiers_match_regex = ACCESS_MODIFIERS_MATCH_REGEX,
    log_errors = true,
    return_errors_to_client = false,
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
    this._return_errors_to_client = return_errors_to_client
    this._url = new URL(request.url, `http://${request.headers.host}`)

    /** @type {StratisFileAccessMode} */
    this._access_mode = access_mode || 'public'

    /** @type {string} */
    this._query_path = null
    /** @type {string} */
    this._api_path = null
    this._filepath_exists = false
    this._is_page = false
  }

  get stratis() {
    return this._stratis
  }

  get request() {
    return this._request
  }

  get url() {
    return this._url
  }

  get access_mode() {
    return this._access_mode
  }

  get query_path() {
    return this._query_path
  }

  get api_path() {
    return this._api_path
  }

  get filepath() {
    return path.join(this.serve_path, this.query_path)
  }

  get codepath() {
    return path.join(
      this.serve_path,
      this.stratis.compose_codefile_path(this.query_path)
    )
  }

  get is_websocket_request() {
    return is_websocket_request(this.request)
  }

  get return_errors_to_client() {
    return this._return_errors_to_client
  }

  get log_errors() {
    return this._log_errors
  }

  /**
   * @type {boolean}
   */
  get is_page() {
    return this._is_page || false
  }

  get is_codefile() {
    return this.stratis.is_codefile(this.query_path)
  }

  get filepath_exists() {
    return this._filepath_exists || false
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
   * information about the request.
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
      const modifires_matches = [
        ...this.query_path.matchAll(this.access_modifiers_match_regex),
      ]
      const modifiers = new Set(modifires_matches.map((m) => m[2]))

      if (modifiers.has('private')) this._access_mode = 'private'
      else if (modifiers.has('secure')) this._access_mode = 'secure'
      else if (modifiers.has('public')) this._access_mode = 'public'
    }

    this._is_page =
      new Set(this.stratis.page_file_ext).has(path.extname(this.query_path)) ||
      (await path_exists(this.codepath))

    return this
  }
}

module.exports = {
  StratisRequest,
}
