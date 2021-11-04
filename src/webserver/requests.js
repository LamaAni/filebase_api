const { throws } = require('assert')
const path = require('path')
const { assert, path_stat, path_exists } = require('../common.js')

/**
 * @typedef {import('fs').Stats} Stats
 * @typedef {import('./stratis.js').Stratis} Stratis
 * @typedef {import('express/index').Request} Request
 */

/**
 * The type of code object. See documentation in readme.
 * @typedef {"public" | "private" } StratisFileAccessMode
 */

class StratisRequest {
  /**
   * @param {object} param0
   * @param {string} param0.serve_path The search path for the request stratis files.
   * @param {Stratis} param0.stratis
   * @param {Request} param0.request
   * @param {StratisFileAccessMode} param0.access_mode
   */
  constructor({
    serve_path,
    stratis,
    request,
    access_mode = null,
    find_access_modifiers = /[^\w](private|public)([^\w]|$)/g,
    codefile_extention = '.code.js',
  } = {}) {
    // Validate input
    assert(
      serve_path != null && typeof serve_path == 'string',
      'src path acnnot be null and must be a string'
    )
    assert(stratis != null, 'stratis cannot be null')
    assert(request != null, 'request cannot be null')

    this.serve_path = serve_path
    this.find_access_modifiers = find_access_modifiers
    this.codefile_extention = codefile_extention
    this.default_path = default_path

    this._stratis = stratis
    this._request = request
    this._url = new URL(request.url, `http://${request.headers.host}`)

    /** @type {StratisFileAccessMode} */
    this._access_mode = access_mode || stratis.default_access_mode

    /** @type {string} */
    this._query_path = null
    /** @type {string} */
    this._api_path = null
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
    return this.query_path.replace(/\.[^/.]+$/, '') + this.codefile_extention
  }

  get is_websocket_request() {
    return this.request.protocol == 'ws:' || this.request.protocol == 'wss:'
  }

  /**
   * @type {boolean}
   */
  get is_page() {
    if (this.query_path == null) return false
    if (this._is_page == null)
      this._is_page =
        new Set(this.stratis.template_extensions).has(
          path.extname(this.query_path)
        ) || path_exists(this.codepath)

    return this._is_page
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
      query_path: path.join(cur_path_items),
      api_path: path.join(path_items),
    }
  }

  /**
   * Initializes the startis request and collects
   * information about the request.
   */
  async initialize() {
    const paths = await this._resolve_query_path()
    if (paths == null) return

    this._query_path = paths.query_path
    this._api_path = paths.api_path

    // check access modifiers
    if (this.filepath.endsWith(this.codefile_extention)) {
      // codefiles are always private.
      this._access_mode = 'private'
    } else {
      let modifiers = new Set(
        this.query_path.matchAll(this.find_access_modifiers)
      )

      if (modifiers.has('private')) {
        this._access_mode = 'private'
      } else if (modifiers.has('public')) {
        this._access_mode = 'public'
      }
    }

    return this
  }
}

module.exports = {
  StratisRequest,
}
