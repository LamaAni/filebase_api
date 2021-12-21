/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 * @typedef {import('./stratis.js').Stratis} Stratis
 * @typedef {import('ws')} WebSocket
 * @typedef {import('./requests').StratisRequest} StratisRequest
 * @typedef {import('./pages').StratisPageCallContext} StratisPageCallContext
 */

/**
 * @typedef {(event: 'error', listener: (error: Error) => void) => this} StratisEventListenError
 * @typedef {(event: 'log', listener: (level:string, ...args) => void) => this} StratisEventListenLog
 * @typedef {StratisEventListenError & StratisEventListenLog} StratisEventListenRegister
 */

/**
 * @typedef {(event: 'error', error:Error) => this} StratisEventEmitError
 * @typedef {(event: 'log', level:'DEBUG'|'INFO'|'WARN'|'ERROR', ...args) => this} StratisEventEmitLog
 * @typedef {StratisEventEmitError & StratisEventEmitLog} StratisEventEmitter
 */

/**
 * @typedef {string | number | {}} JsonCompatible
 */

/**
 * @typedef {(args:{}|string, context: StratisPageCallContext)=>JsonCompatible|string|number|{}} StratisApiObject
 */

/**
 * @typedef {Object} StratisApiWebSocketRequestArgs
 * @property {string} rid The request id.
 * @property {string} name The api method to invoke.
 * @property {Object} args The api method arguments.
 */

/**
 * @typedef {Object} StratisExpressRequestEnhancements
 * @property {StratisRequest} stratis_request
 * @property {Stratis} stratis
 */

/**
 * @typedef {StratisExpressRequestEnhancements & Request} StratisExpressRequest
 */

/**
 * @typedef {Object} StratisExpressResponseEnhancements
 * @property {StratisRequest} stratis_request
 * @property {Stratis} stratis
 */

/**
 * @typedef {StratisExpressResponseEnhancements & Response} StratisExpressResponse
 */

/**
 * @typedef {(request: Request, )=>{}} StratisPermissionsFilter
 */

module.exports = {
  /** @type {StratisEventEmitter} */
  StratisEventEmitter: () => {},
  /** @type {StratisEventListenRegister} */
  StratisEventListenRegister: () => {},
  /** @type {StratisApiObject} */
  StratisApiObject: () => {},
  /** @type {JsonCompatible} */
  JsonCompatible: {},
  /** @type {StratisExpressRequest} **/
  StratisExpressRequest: {},
  /** @type {StratisExpressResponse} **/
  StratisExpressResponse: {},
}
