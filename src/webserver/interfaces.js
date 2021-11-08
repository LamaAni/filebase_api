/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 * @typedef {import('./stratis.js').Stratis} Stratis
 * @typedef {import('ws')} WebSocket
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
 * @typedef {(args:{}|string, context: StratisPageCallContext)=>JsonCompatible} StratisApiMethod
 */

/**
 * @typedef {Object} StratisApiWebSocketRequestArgs
 * @property {string} rid The request id.
 * @property {string} name The api method to invoke.
 * @property {Object} args The api method arguments.
 */

module.exports = {
  /** @type {StratisEventEmitter} */
  StratisEventEmitter: () => {},
  /** @type {StratisEventListenRegister} */
  StratisEventListenRegister: () => {},
  /** @type {StratisApiMethod} */
  StratisApiMethod: () => {},
  /** @type {JsonCompatible} */
  JsonCompatible: {},
}
