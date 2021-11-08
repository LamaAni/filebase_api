const stream = require('stream')
const { StratisNotFoundError } = require('./errors.js')
const { assert } = require('../common')
const { split_stream_once, stream_to_buffer } = require('../streams.js')

/**
 * @typedef {import('./requests.js').StratisRequest} StratisRequest
 */

/**
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
  constructor({ stratis_request, res, next, ws = null } = {}) {
    this._stratis_request = stratis_request
    this._res = res
    this._ws = ws
    this._next = next
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

  get next() {
    return this._next
  }

  /**
   * Call to initialize the context.
   */
  async initialize() {}
}

class StratisPageCall {
  /**
   * Implements a general page call.
   * @param {StratisRequest} request
   */
  constructor(request) {
    this.request = request
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
    const is_stream = payload_data instanceof stream.Readable
    const is_buffer = payload_data instanceof Buffer

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
      typeof payload == 'string',
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
   * @returns {JsonCompatible} The json compatible return value.
   */
  async invoke() {
    // load the code module for the api
    const code_module = (
      await this.request.stratis.code_module_bank.load(this.request.codepath)
    ).as_api_invoke_dict()

    if (code_module[this.name] == null) {
      throw new StratisNotFoundError('Api method or object not found')
    }
  }
}

class StratisPageRenderRequest extends StratisPageCall {
  /**
   * Implements behavior for a page render request
   * @param {StratisRequest} request
   * @param {Response} response
   */
  constructor(request, response) {
    super(request)
    this.response = response
  }

  async render(req, res) {
    return await this.request.stratis.template_bank.render(
      this.request.filepath,
      {
        req: this.request.request,
        res: this.response,
        session: this.request.request.session || {},
      }
    )
  }
}

module.exports = {
  StratisPageCall,
  StratisPageCallContext,
  StratisPageApiCall,
  StratisPageRenderRequest,
}
