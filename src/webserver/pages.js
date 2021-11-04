/**
 * @typedef {import('./requests.js').StratisRequest} StratisRequest
 */

/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 * @typedef {import('./stratis.js').Stratis} Stratis
 * @typedef {import('ws')} WebSocket
 */

/**
 * @typedef {Object} StratisPageCallContextOptions
 * @property {StratisRequest} stratis_request The stratis collected request
 * @property {Response} res The express http response object
 * @property {NextFunction} next the express http next function.
 * @property {WebSocket} ws The WebSocket connection if applicable.
 */

class StratisPageCallContext {
  /**
   * Implements the call context for stratis
   * @param {StratisPageCallContextOptions} param0
   */
  constructor({ stratis_request, res, next, ws } = {}) {
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
}

class StratisPageApiCall extends StratisPageCall {
  /**
   * Implements behavior for an api call.
   * @param {StratisRequest} request
   */
  constructor(request) {
    super(request)
  }

  /**
   * Invokes the api call.
   */
  async invoke() {}
}

class StratisPageRenderRequest {
  /**
   * Implements behavior for a page render request
   * @param {StratisRequest} request
   */
  constructor(request) {
    super(request)
  }
}

module.exports = {
  StratisPageCall,
  StratisPageCallContext,
  StratisPageApiCall,
  StratisPageRenderRequest,
}
