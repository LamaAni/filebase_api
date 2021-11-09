const express = require('express')
const events = require('events')
const path = require('path')
const fs = require('fs')
const { Request, Response, NextFunction } = require('express/index')
const websocket = require('../websocket.js')
const { assert, with_timeout } = require('../common.js')

const {
  STRATIS_CLIENTSIDE_SOURCE,
  DEFAULT_PAGE_FILE_EXT,
} = require('./consts.js')

const {
  StratisNotFoundError,
  StratisError,
  StratisTimeOutError,
  StratisNotAuthorizedError,
} = require('./errors')
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
 * @typedef {import('./interfaces').StratisApiObject} StratisApiObject
 * @typedef {import('./templates').StratisEJSOptions} StratisEJSOptions
 * @typedef {import('./interfaces').StratisApiWebSocketRequestArgs} StratisApiWebSocketRequestArgs
 * @typedef {import('./code').StratisCodeModule} StratisCodeModule
 * @typedef {import('./code').StratisCodeModuleBankOptions} StratisCodeModuleBankOptions
 * @typedef {import('./templates').StratisEJSTemplateBankOptions} StratisEJSTemplateBankOptions
 */

/**
 * @typedef {Object} StratisClientSideApiOptions
 * @property {string} api_code_path The path to the api code to use (render)
 * @property {number} timeout The client side api timeout. Defaults to server side timeout.
 */

/**
 * @typedef {Object} StratisMiddlewareOptions
 * @property {(req:Request,res:Response,next:NextFunction)=>{}} filter Path filter, if next
 * function was called then do not process in the middleware.
 * @property {(req:Request,res:Response,next:NextFunction)=>{}} security_filter Secure resources validation filter.
 * return false or throw error when not accesable. Defaults to allow all.
 * @property {boolean} next_on_private Call the next express handler if the current
 * filepath request is private.
 * @property {boolean} next_on_not_found Call the next express handler if the current
 * filepath request is not found.
 * @property {boolean} return_errors_to_client If true, prints the application errors to the http 500 response.
 * NOTE! To be used for debug, may expose sensitive information.
 * @property {boolean} log_errors If true, prints the application errors to the logger.
 * @property {boolean} ignore_empty_path If true, next handler on empty path.
 */

/**
 * Interface for Stratis options.
 * @typedef {Object} StratisOptions
 * @property {[string]} page_file_ext A list of page default extensions to match.
 * @property {Object<string,StratisApiObject>} common_api A collection of core api objects or
 * methods to expose.
 * @property {StratisEJSOptions} ejs_options A collection of stratis extended ejs options.
 * @property {StratisCodeModuleBankOptions} code_module_bank_options A collection of options for the code module bank
 * @property {StratisEJSTemplateBankOptions} template_bank_options A collection of template bank options.
 * @property {string} codefile_extension The file extension (without starting .) for recognizing code files.
 * @property {console| {}} logger The logger to use, must have logging methods (info, warn, error ...)
 * @property {integer} timeout The client side request timeout [ms]
 * @property {StratisClientSideApiOptions} client_api_options client api options.
 * @property {StratisPageCallContext} page_call_context_constructor A page call context constructor
 */

const STRATIS_CLIENTSIDE_API_DEFAULT_OPTIONS = {
  api_code_path: path.join(__dirname, 'clientside.js'),
}

/**
 * @type {StratisEJSOptions}
 */
const STRATIS_DEFAULT_EJS_OPTIONS = {
  require: true,
}

class Stratis extends events.EventEmitter {
  /**
   * Creates a file api handler that can be used to generate
   * the file api.
   * @param {StratisOptions} param0
   */
  constructor({
    page_file_ext = DEFAULT_PAGE_FILE_EXT,
    common_api = {},
    code_module_bank_options = {},
    template_bank_options = {},
    client_api_options = STRATIS_CLIENTSIDE_API_DEFAULT_OPTIONS,
    ejs_options = STRATIS_DEFAULT_EJS_OPTIONS,
    codefile_extension = '.code.js',
    logger = console,
    timeout = 1000 * 60,

    page_call_context_constructor = StratisPageCallContext,
  } = {}) {
    super()

    assert(
      page_call_context_constructor.prototype instanceof StratisPageCallContext,
      'page_call_context_constructor must be of type StratisPageCallContext'
    )

    this.page_file_ext = page_file_ext
    this.common_api = common_api
    this.logger = logger || console
    this.ejs_options = Object.assign(
      {},
      STRATIS_DEFAULT_EJS_OPTIONS,
      ejs_options
    )
    this.codefile_extension = codefile_extension
    this.page_call_context_constructor = page_call_context_constructor
    this.timeout =
      typeof timeout != 'number' || timeout <= 0 ? Infinity : timeout

    /**
     * @type {StratisClientSideApiOptions}
     */
    this.client_api_options = Object.assign(
      { timeout: this.timeout },
      STRATIS_CLIENTSIDE_API_DEFAULT_OPTIONS,
      client_api_options || {}
    )

    /** @type {StratisEventListenRegister} */
    this.on
    /** @type {StratisEventListenRegister} */
    this.once
    /** @type {StratisEventEmitter} */
    this.emit

    this.on('error', (...args) => this._internal_on_emit_error(...args))

    // collections
    this.code_module_bank = new StratisCodeModuleBank(
      this,
      code_module_bank_options
    )
    this.template_bank = new StratisEJSTemplateBank(this, template_bank_options)
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
  _internal_on_emit_error(err, stratis_request) {
    if (stratis_request.log_errors) this.logger.error(err)
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
          ws_request_args.args = ws_request_args.args || {}
          if (
            ws_request_args.rid == null ||
            ws_request_args.name == null ||
            typeof ws_request_args.args != 'object'
          )
            throw Error(
              'Invalid stratis api websocket request. Expected {rid:string, name:string, args:{} }'
            )

          const call = new StratisPageApiCall(
            stratis_request,
            ws_request_args.name,
            ws_request_args.args
          )

          const context = new this.page_call_context_constructor({
            stratis_request,
            next,
            res: null,
            ws,
          })

          const rsp_data = await with_timeout(
            async () => {
              return await call.invoke(context)
            },
            this.timeout,
            new StratisTimeOutError('Websocket request timed out')
          )

          ws.send(
            JSON.stringify({
              rid: ws_request_args.rid,
              response: rsp_data,
            })
          )
        } catch (err) {
          this.emit('error', err, stratis_request)
          try {
            ws.send(
              JSON.stringify({
                rid: ws_request_args.rid,
                error: this.return_errors_to_client
                  ? `${err}`
                  : 'Error while serving request',
              })
            )
          } catch (err) {
            this.emit('error', err, stratis_request)
          }
        }
      })

      ws.on('open', () => this.emit('websocket_open', ws))
      ws.on('close', () => this.emit('websocket_close', ws))
      ws.on('error', (err) => this.emit('error', err, stratis_request))
    })(stratis_request.request, res, next)
  }

  /**
   * @param {StratisRequest} stratis_request
   * @param {Response} res
   * @param {NextFunction} next
   */
  async handle_page_api_call(stratis_request, res, next) {
    // resolve api method path.
    const name = stratis_request.api_path
      .split('/')
      .filter((v) => v.trim().length > 0)
      .join('.')

    const call = new StratisPageApiCall(
      stratis_request,
      name,
      await StratisPageApiCall.parse_api_call_args(
        stratis_request.request.body
      ),
      true
    )

    const context = new this.page_call_context_constructor({
      stratis_request,
      next,
      res,
      ws: null,
    })

    const rslt = await call.invoke(context)
    if (typeof rslt == 'object') rslt = JSON.stringify(rslt)

    return res.end(rslt)
  }

  /**
   * @param {StratisRequest} stratis_request
   * @param {Response} res
   * @param {NextFunction} next
   */
  async handle_page_render_request(stratis_request, res, next) {
    const call = new StratisPageRenderRequest(stratis_request)
    const context = new this.page_call_context_constructor({
      stratis_request,
      next,
      res,
      ws: null,
    })
    return res.end(await call.render(context))
  }

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
      return await this.handle_page_api_call(stratis_request, res, next)
    else
      return await this.handle_page_render_request(stratis_request, res, next)
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
      security_filter = null,
      next_on_private = false,
      next_on_not_found = true,
      return_errors_to_client = true,
      log_errors = true,
      ignore_empty_path = true,
    } = {}
  ) {
    if (!fs.existsSync(serve_path))
      throw new StratisNotFoundError(
        `Stratis search path ${serve_path} dose not exist`
      )

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
      if (ignore_empty_path && req.path == '/') return next()

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
        req.stratis_request = stratis_request
        req.stratis = this

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
        if (!stratis_request.filepath_exists)
          if (next_on_not_found) return next()
          else throw new StratisNotFoundError()

        // check permissions
        if (stratis_request.access_mode == 'private') {
          if (next_on_private) return next()
          if (stratis_request.is_codefile)
            res.write('Direct access to codefiles is always forbidden')
          return res.sendStatus(403)
        }

        if (
          security_filter != null &&
          stratis_request.access_mode == 'secure'
        ) {
          if (!security_filter(req, res, next)) {
            throw new StratisNotAuthorizedError(
              `Cannot access or find ${stratis_request.query_path}`
            )
          }
        }

        if (!stratis_request.is_page)
          // file download.
          return res.sendFile(stratis_request.filepath)

        return await with_timeout(
          async () => {
            if (stratis_request.is_websocket_request)
              // open websocket
              return this.handle_websocket_request(stratis_request, res, next)
            return this.handle_page_request(stratis_request, res, next)
          },
          this.timeout,
          new StratisTimeOutError('timed out processing request')
        )
      } catch (err) {
        // returning the application error
        this.emit('error', err, stratis_request)
        res.status(err instanceof StratisError ? err.http_response_code : 500)

        if (stratis_request.return_errors_to_client) res.end(`${err}`)
        else next(err)
      } finally {
        delete req.stratis_request
        delete req.stratis
      }
    }

    return intercept
  }

  /**
   * Creates a new express server to use with the Stratis.
   * @param {string} src The path to the folder to serve.
   * @param {express.Express} app The express app to use, if null create one.
   * @param {StratisMiddlewareOptions} options
   * @returns {express.Express} The express app to use. You can do express.listen
   * to start the app.
   */
  server(src, app = null, options = {}) {
    app = app || express()
    app.use(this.middleware(src, options))
    return app
  }
}

module.exports = {
  Stratis,
}
