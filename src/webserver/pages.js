const stream = require('stream')
const path = require('path')
const { StratisNotFoundError } = require('./errors.js')
const { assert } = require('../common')
const { split_stream_once, stream_to_buffer } = require('../streams.js')
const { StratisEJSTemplateRenderContext } = require('./templates')

/**
 * @typedef {import('./requests.js').StratisRequest} StratisRequest
 */

/**
 * @typedef {import('./interfaces').StratisApiObject} StratisApiObject
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 * @typedef {import('./stratis.js').Stratis} Stratis
 * @typedef {import('ws')} WebSocket
 * @typedef {import('./interfaces').JsonCompatible} JsonCompatible
 */

/**
 * @typedef {Object} StratisPageCallContextOptions
 * @property {StratisRequest} stratis_request The stratis collected request
 * @property {Response} res The express http response object
 * @property {NextFunction} next the express http next function.
 * @property {WebSocket} ws The WebSocket connection if applicable.
 */

/**
 * @typedef {Object} PageOptions
 * @property
 */

class StratisPageCallContext {
  /**
   * Implements the call context for stratis
   * @param {StratisPageCallContextOptions} param0
   */
  constructor({ stratis_request, res = null, next = null, ws = null } = {}) {
    assert(stratis_request != null, 'Stratis request cannot be null')
    this._stratis_request = stratis_request
    this._res = res
    this._ws = ws
    this._next = next

    /**
     * @type {{}} The code module dictionary for the request.
     */
    this._code_module = null
  }

  get is_websocket_request() {
    return this.ws != null
  }

  get stratis_request() {
    return this._stratis_request
  }

  get res() {
    return this._res
  }

  get req() {
    return this.stratis_request.request
  }

  get ws() {
    return this._ws
  }

  get websocket() {
    return this.ws
  }

  get stratis() {
    return this.stratis_request.stratis
  }

  get session() {
    return this.req.session
  }

  get next() {
    return this._next
  }

  get_api_objects() {
    return {
      render_stratis_api_yaml_description: (...args) =>
        this.render_stratis_api_description(...args),
      render_stratis_api_description: (...args) =>
        this.render_stratis_api_description(...args),
      render_stratis_browser_api_script: (...args) =>
        this.render_stratis_browser_api_script(...args),
      render_stratis_script_tag: (...args) =>
        this.render_stratis_script_tag(...args),
    }
  }

  get_render_objects() {
    return Object.assign({}, this.get_api_objects(), {
      req: this.req,
      res: this.res,
      session: this.session,
      context: this,
    })
  }

  /**
   * @param {boolean} include_api_objects
   * @returns {Object<string, StratisApiObject>}
   */
  async get_code_module_objects(include_api_objects = true) {
    const code_module_api_objects = (
      await this.stratis.code_module_bank.load(this.stratis_request.codepath)
    ).as_api_objects()

    return Object.assign(
      {},
      include_api_objects ? this.get_api_objects() : {},
      code_module_api_objects
    )
  }

  /**
   * Template method. Renders the file api script tag.
   */
  render_stratis_script_tag() {
    return `<script lang="javascript" src='${this.stratis_request.query_path}/render_stratis_browser_api_script'></script>`
  }

  /**
   * Render stratis api script.
   */
  async render_stratis_browser_api_script() {
    /** @type {StratisRequestEnvironment} */
    return await this.stratis_request.stratis.template_bank.render(
      this.stratis.client_api.api_code_path,
      {
        code_module: await this.get_code_module_objects(),
        request: this.stratis_request,
        stratis: this.stratis,
        context: this,
      }
    )
  }

  async render_stratis_api_description() {
    const code_module = await this.get_code_module_objects(false)
    const api_description = {
      path: this.stratis_request.query_path,
      methods: Object.keys(code_module),
    }

    return JSON.stringify(api_description, null, 2)
  }
}

class StratisPageCall {
  /**
   * Implements a general page call.
   * @param {StratisRequest} request
   */
  constructor(request) {
    this.request = request
  }

  get stratis() {
    return this.request.stratis
  }

  get_search_params_dictionary() {
    const prs = {}
    for (var pair of this.request.url.searchParams.entries()) {
      if (pair.length < 2) continue
      prs[pair[0]] = pair[1]
    }
  }
}

class StratisPageApiCall extends StratisPageCall {
  /**
   * Implements behavior for an api call.
   * @param {StratisRequest} request
   * @param {string} name The name of the method to call.
   * @param {object} args The method args to include.
   * @param {boolean} include_query_args If true, query args are included in the call args.
   */
  constructor(request, name, args = null, include_query_args = false) {
    super(request)
    this._name = name
    this._args = null

    if (include_query_args) this.merge_args(this.get_search_params_dictionary())
    this.merge_args(args)
  }

  get name() {
    return this._name
  }

  get args() {
    return this._args
  }

  /**
   * Reads the api call args from the payload data. Multiple calls will
   * result in multiple reads.
   * @param {stream.Readable|Buffer|string|Object<string,any>} payload The call payload data.
   * @returns {Object}
   */
  static async parse_api_call_args(payload) {
    if (payload == null) return {}

    const is_stream = payload instanceof stream.Readable
    const is_buffer = payload instanceof Buffer

    if (is_stream || is_buffer) {
      if (is_stream)
        payload = await stream_to_buffer(split_stream_once(data, '\0')[0])
      payload = payload.toString('utf-8')
      payload = payload.length == 0 ? null : payload
    }

    if (payload != null || typeof payload == 'string') {
      if (payload != null && /^\s*[\{]/gms.test(payload))
        payload = JSON.parse(payload)
      else
        payload = {
          payload: payload,
        }
    }

    assert(
      typeof payload == 'string' || typeof payload == 'object',
      'Payload data must be either a buffer, stream, string or dictionary (or null)'
    )

    return payload
  }

  /**
   * Merge a dictionary to the call args.
   * @param {Object<string,any>} to_merge The args to merge.
   */
  merge_args(to_merge) {
    this._args = Object.assign(this._args || {}, to_merge)
  }

  /**
   * Invokes the api call.
   * @param {StratisPageCallContext} context
   * @returns {JsonCompatible} The json compatible return value.
   */
  async invoke(context) {
    // load the code module for the api
    const code_module = Object.assign(
      context.get_api_objects(),
      await context.get_code_module_objects()
    )

    if (code_module[this.name] == null) {
      throw new StratisNotFoundError('Api method or object not found')
    }

    const to_invoke = code_module[this.name]
    if (typeof to_invoke != 'function') return to_invoke
    else return await to_invoke(this.args, context)
  }
}

class StratisPageRenderRequest extends StratisPageCall {
  /**
   * Implements behavior for a page render request
   * @param {StratisRequest} request
   */
  constructor(request) {
    super(request)
  }

  /**
   * Render a stratis request.
   * @param {StratisPageCallContext} context The request
   * @returns {JsonCompatible} response
   */
  async render(context) {
    const template_render_context = new StratisEJSTemplateRenderContext(
      {},
      context.get_render_objects()
    )
    return await this.request.stratis.template_bank.render(
      this.request.filepath,
      template_render_context
    )
  }
}

module.exports = {
  StratisPageCall,
  StratisPageCallContext,
  StratisPageApiCall,
  StratisPageRenderRequest,
}
