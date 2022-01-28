/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 * @typedef {import('./stratis.js').Stratis} Stratis
 * @typedef {import('ws')} WebSocket
 * @typedef {import('./requests').StratisRequest} StratisRequest
 * @typedef {import('./pages').StratisPageCallContext} StratisPageCallContext
 * @typedef {import('../utils/session').StratisSessionProviderContext} StratisSessionProviderContext
 * @typedef {import('../utils/oauth2').StratisOAuth2Provider} StratisOAuth2Provider
 * @typedef {import('../utils/oauth2').StratisOAuth2ProviderSession} StratisOAuth2ProviderSession
 */

/**
 * @typedef {(event: 'error', listener: (error: Error) => void) => this} StratisEventListenError
 * @typedef {(event: 'log', listener: (level:string, ...args) => void) => this} StratisEventListenLog
 * @typedef {(event: 'stratis_request', listener: (stratis_request:StratisRequest) => void) => this} StratisEventListenStratisRequest
 * @typedef {StratisEventListenStratisRequest & StratisEventListenError & StratisEventListenLog} StratisEventListenRegister
 */

/**
 * @typedef {(event: 'error', error:Error) => this} StratisEventEmitError
 * @typedef {(event: 'log', level:'DEBUG'|'INFO'|'WARN'|'ERROR', ...args) => this} StratisEventEmitLog
 * @typedef {(event: 'stratis_request', stratis_request:StratisRequest) => this} StratisEventEmitStratisRequest
 * @typedef {StratisEventEmitStratisRequest & StratisEventEmitError & StratisEventEmitLog} StratisEventEmitter
 */

/**
 * An object that can ben stringified as json
 * @typedef {string | number | {}} JsonCompatible
 */

/**
 * @typedef {(args:{}|string, context: StratisPageCallContext)=>JsonCompatible|string|number|Object} StratisApiHandler
 */

/**
 * @typedef {Object} StratisApiWebSocketRequestArgs
 * @property {string} rid The request id.
 * @property {string} name The api method to invoke.
 * @property {Object} args The api method arguments.
 */

/**
 * @typedef {Object} StratisExpressRequestEnhancements
 * @property {Stratis} stratis
 * @property {StratisRequest} stratis_request
 * @property {StratisSessionProviderContext} stratis_session_provider_context
 * @property {StratisOAuth2Provider} stratis_security_provider
 * @property {StratisOAuth2ProviderSession} stratis_oauth2_session
 */

/**
 * @typedef {StratisExpressRequestEnhancements & Request} StratisExpressRequest
 */

/**
 * @typedef {Object} StratisExpressResponseEnhancements
 * @property {Stratis} stratis
 * @property {StratisRequest} stratis_request
 */

/**
 * @typedef {StratisExpressResponseEnhancements & Response} StratisExpressResponse
 */

/**
 * @typedef {(request: Request, )=>{}} StratisPermissionsFilter
 */

/**
 * @typedef {{info(...args)=>{},warn(...args)=>{},error(...args)=>{},debug(...args)=>{},trace(...args)=>{}}} StratisLogger
 */

module.exports = {
  /** @type {StratisEventEmitter} */
  StratisEventEmitter: () => {},
  /** @type {StratisEventListenRegister} */
  StratisEventListenRegister: () => {},
  /** @type {StratisApiHandler} */
  StratisApiHandler: () => {},
  /** @type {JsonCompatible} */
  JsonCompatible: {},
  /** @type {StratisExpressRequest} **/
  StratisExpressRequest: {},
  /** @type {StratisExpressResponse} **/
  StratisExpressResponse: {},
  /** @type {StratisLogger} */
  StratisLogger: console,
}
