const express = require('express')
const events = require('events')
const path = require('path')
const fs = require('fs')
const ejs = require('ejs')
const mime = require('mime')
const stream = require('stream')
const { Request, Response, NextFunction } = require('express/index')

const websocket = require('../websocket.js')
const { split_stream_once, stream_to_buffer } = require('../streams.js')
const { assert } = require('../common.js')

const {
  STRATIS_CLIENTSIDE_SOURCE,
  DEFAULT_PAGE_FILE_EXT,
} = require('./consts.js')

const { StratisRequest } = require('./requests.js')
const { StratisCodeModuleBank } = require('./code.js')
const { StratisEJSTemplateBank } = require('./templates')

const {
  StratisPageApiCall,
  StratisPageRenderRequest,
  StratisPageCallContext,
} = require('./pages.js')

/**
 * @typedef {import('./interfaces').StratisEventListenRegister} StratisEventListenRegister
 * @typedef {import('./interfaces').StratisEventEmitter} StratisEventEmitter
 * @typedef {import('./requests').StratisFileAccessMode} StratisFileAccessMode
 * @typedef {import('./interfaces').StratisApiMethod} StratisApiMethod
 * @typedef {import('./templates').StratisEJSOptions} StratisEJSOptions
 * @typedef {import('./interfaces').StratisApiWebSocketRequestArgs} StratisApiWebSocketRequestArgs
 * @typedef {import('./code').StratisCodeModule} StratisCodeModule
 * @typedef {import('./code').StratisCodeModuleBankOptions} StratisCodeModuleBankOptions
 * @typedef {import('./templates').StratisEJSTemplateBankOptions} StratisEJSTemplateBankOptions
 */

/**
 * @typedef {Object} StratisMiddlewareOptions
 * @property {(req:Request,res:Response,next:NextFunction)=>{}} filter Path filter, if next
 * function was called then do not process in the middleware.
 * @property {boolean} next_on_private Call the next express handler if the current
 * filepath request is private.
 * @property {boolean} return_errors_to_client If true, prints the application errors to the http 500 response.
 * NOTE! To be used for debug, may expose sensitive information.
 * @property {boolean} log_errors If true, prints the application errors to the logger.
 */

/**
 * Interface for Stratis options.
 * @typedef {Object} StratisOptions
 * @property {[string]} page_file_ext A list of page default extensions to match.
 * @property {Object<string,StratisApiMethod} api_methods A collection of core api methods to expose.
 * @property {StratisEJSOptions} ejs_options A collection of stratis extended ejs options.
 * @property {StratisCodeModuleBankOptions} code_module_bank_options A collection of options for the code module bank
 * @property {StratisEJSTemplateBankOptions} templates_bank_options A collection of template bank options.
 * @property {string} codefile_extension The file extension (without starting .) for recognizing code files.
 * @property {console| {}} logger The logger to use, must have logging methods (info, warn, error ...)
 * @property {integer} cache_check_minimal_interval The minimal interval for cache checking [ms]
 * @property {integer} cache_clean_interval The minimal interval for cache cleaning [ms]
 * @property {integer} cache_max_lifetime The maximal cache lifetime [ms]
 * @property {integer} client_request_timeout The client side request timeout [ms]
 */

class Stratis extends events.EventEmitter {
  /**
   * Creates a file api handler that can be used to generate
   * the file api.
   * @param {StratisOptions} param0
   */
  constructor({
    page_file_ext = DEFAULT_PAGE_FILE_EXT,
    api_methods = {},
    code_module_bank_options = {},
    templates_bank_options = {},
    codefile_extension = 'code.js',
    show_application_errors = false,
    default_access_mode = null,

    // ejs templating
    ejs_options = {},

    // logging
    logger = null,
    log_errors_to_console = true,

    // cache
    cache_check_minimal_interval = 10,
    cache_clean_interval = 1000,
    cache_max_lifetime = 5 * 60 * 1000,
    client_request_timeout = 1 * 60 * 1000,
  } = {}) {
    super()

    /** @type {StratisEventListenRegister} */
    this.on
    /** @type {StratisEventListenRegister} */
    this.once
    /** @type {StratisEventEmitter} */
    this.emit

    /** @type {console | {}} */
    this.logger = logger || console

    /** @type {StratisEJSOptions} */
    this.ejs_options = ejs_options

    this.codefile_extension = codefile_extension
    this.cache_check_minimal_interval = cache_check_minimal_interval
    this.cache_clean_interval = cache_clean_interval
    this.cache_max_lifetime = cache_max_lifetime
    this.client_request_timeout = client_request_timeout || 1000
    this.page_file_ext = page_file_ext
    this.show_application_errors = show_application_errors

    // collections
    this.code_module_bank = new StratisCodeModuleBank(
      this,
      code_module_bank_options
    )

    this.template_bank = new StratisEJSTemplateBank(
      this,
      templates_bank_options
    )
  }

  /**
   * Compose codefile path for the code file.
   * @param {string} file_path The file path to compose a codefile for.
   */
  compose_codefile_path(file_path) {
    return file_path.replace(/\.[^/.]+$/, '') + this.codefile_extension
  }

  /**
   * @param {string} file_path The filepath to check
   */
  is_codefile(file_path) {
    return file_path.endsWith(this.codefile_extension)
  }

  /**
   * @param {Error} err
   * @param {StratisRequest} stratis_request
   */
  _emit_error(err, stratis_request) {
    if (stratis_request.log_errors) this.logger.error(err)
    this.emit('error', err)
  }

  /**
   * @param {StratisRequest} stratis_request
   * @param {Response} res
   * @param {NextFunction} next
   */
  async handle_websocket_request(stratis_request, res, next) {
    websocket((ws, ws_request) => {
      ws.on('message', async (data) => {
        /** @type {StratisApiWebSocketRequestArgs} */
        let ws_request_args = {}
        try {
          ws_request_args = await StratisPageApiCall.parse_api_call_args(data)
          if (
            ws_request_args.rid == null ||
            ws_request_args.method_name == null ||
            typeof ws_request_args.args != 'object'
          )
            throw Error(
              'Invalid stratis api websocket request. Expected {rid:string, method_name:string, args:{} }'
            )

          const call = new StratisPageApiCall(
            stratis_request,
            ws_request_args.method_name,
            ws_request_args.args
          )

          const rsp_data = await call.invoke()
          ws.send(
            JSON.stringify({
              rid: ws_request_args.rid,
              response: rsp_data,
            })
          )
        } catch (err) {
          this._emit_error(err, stratis_request)
          try {
            ws.send(
              JSON.stringify({
                rid: ws_request_args.rid,
                error: err,
              })
            )
          } catch (err) {
            this._emit_error(err, stratis_request)
          }
        }
      })

      ws.on('open', () => this.emit('websocket_open', ws))
      ws.on('close', () => this.emit('websocket_close', ws))
      ws.on('error', (err) => this._emit_error(err, stratis_request))
    })
  }

  /**
   * @param {StratisRequest} stratis_request
   * @param {Response} res
   * @param {NextFunction} next
   */
  async handle_page_api_call(stratis_request, res, next) {
    // resolve api method path.
    const method_name = stratis_request.api_path
      .split('/')
      .filter((v) => v.trim().length > 0)
      .join('.')

    const call = new StratisPageApiCall(
      stratis_request,
      method_name,
      await StratisPageApiCall.parse_api_call_args(
        stratis_request.request.body
      ),
      true
    )

    const rslt = await call.invoke()
    if (typeof rslt == 'object') rslt = JSON.stringify(rslt)

    return res.end(rslt)
  }

  /**
   * @param {StratisRequest} stratis_request
   * @param {Response} res
   * @param {NextFunction} next
   */
  async handle_page_render_request(stratis_request, res, next) {}

  /**
   * @param {StratisRequest} stratis_request
   * @param {Response} res
   * @param {NextFunction} next
   */
  async handle_page_request(stratis_request, res, next) {
    // a page request can be either:
    // page render request
    // page api request.
    if (stratis_request.api_path != null)
      return await this.handle_page_api_call(stratis_request, req, next)
    else
      return await this.handle_page_render_request(stratis_request, req, next)
  }

  /**
   * Creates an express middleware that serves requests.
   * @param {string} serve_path The path to server
   * @param {StratisMiddlewareOptions} options
   */
  middleware(
    serve_path,
    {
      filter = null,
      next_on_private = true,
      return_errors_to_client = false,
      log_errors = true,
    } = {}
  ) {
    if (!fs.existsSync(serve_path))
      throw new Error(`Stratis search path ${serve_path} dose not exist`)

    const src_stat = fs.statSync(serve_path)

    assert(
      src_stat.isDirectory(),
      Error(`Stratis search path ${serve_path} must point to a directory`)
    )

    /** @type {StratisFileAccessMode} */
    const default_access_mode =
      this.default_access_mode ||
      (fs.existsSync(path.join(serve_path, 'public')) ? 'private' : 'public')

    /**
     * Interception function for the middleware.
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercept = async (req, res, next) => {
      const stratis_request = new StratisRequest({
        serve_path,
        stratis: this,
        request: req,
        access_mode: default_access_mode,
        return_errors_to_client: return_errors_to_client,
        log_errors: log_errors,
      })

      // check filtering.
      try {
        if (filter != null) {
          let filter_called_next = false
          let filter_rslt = filter(req, res, (...args) => {
            filter_called_next = true
            return next(...args)
          })
          if (filter_called_next) return filter_rslt
        }

        await stratis_request.initialize()

        // filepath dose not exist. Move on to next handler.
        if (!stratis_request.filepath_exists) return next()

        // check permissions
        if (stratis_request.access_mode == 'private') {
          if (next_on_private) return next()
          if (stratis_request.is_codefile)
            res.write('Direct access to codefiles is always forbidden')
          return res.sendStatus(403)
        }

        if (!stratis_request.is_page)
          // file download.
          return res.sendFile(stratis_request.filepath)

        if (stratis_request.is_websocket_request)
          // open websocket
          return this.handle_websocket_request(stratis_request, res, next)

        return this.handle_page_request(stratis_request, res, next)
      } catch (err) {
        // returning the application error
        if (stratis_request.return_errors_to_client)
          res.write(`${err}`).sendStatus(500)
        this._emit_error(err, stratis_request)
        next(err)
      }
    }

    return intercept
  }
}

module.exports = {
  Stratis,
}
