const events = require('events')
const { assert } = require('console')
const { Request, Response, NextFunction } = require('express/index')
const path = require('path')
const fs = require('fs')
const ejs = require('ejs')
const mime = require('mime')
const express = require('express')
const { split_stream_once, stream_to_buffer } = require('./streams')
const stream = require('stream')

const websocket = require('./websocket')

const Stratis_core_source = fs.readFileSync(
  path.join(__dirname, 'stratis.core.js'),
  'utf-8'
)

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
 * Interface for the current request information.
 * @typedef {{
 *  url: URL,
 *  filepath: string,
 *  codefilepath:string,
 *  query: string,
 *  stat:fs.Stats,
 *  exists:boolean,
 *  is_public: boolean,
 * }} StratisRequestInfo
 */

/**
 * The type of code object. See documentation in readme.
 * @typedef {"API_METHOD" | "PUSH_NOTIFICATION" | "TEMPLATE_ARG" | "REQUEST_HANDLER" | "IGNORE"} StratisCodeObjectTypeEnum
 */

class StratisCodeObject {
  /**
   * A code object to be used in the file api environment.
   * @param {any} val
   * @param {StratisCodeObjectTypeEnum } type
   * @param {string} name The name to use, (overrides)
   */
  constructor(val, type = null, name = null) {
    this.name = name
    /**
     * The request object type
     * @type {StratisCodeObjectTypeEnum}
     */
    this.type = type || StratisCodeObject.auto_detect_type(val)
    this.val = val
  }

  /**
   * @param {any} val
   * @returns {"API_METHOD" | "TEMPLATE_ARG" | "IGNORE" }
   */
  static auto_detect_type(val) {
    return typeof val == 'function' ? 'API_METHOD' : 'TEMPLATE_ARG'
  }

  /**
   *
   * @param {[StratisCodeObject]} lst
   * @returns {Object<string,any>}
   */
  static to_key_value_object(lst) {
    const o = {}
    for (let v of lst) o[v.name] = v.val
    return o
  }
}

/**
 * Creates a file api function to expose, which will appear on the client side.
 * @param {string} name The name of the Stratis method to expose
 * @param {(...args, req:Request, res: Response, next:NextFunction)} func The exposed function.
 * @returns The file api function
 */
function as_stratis_method(name, func) {
  return new StratisCodeObject(func, 'API_METHOD', name)
}

/**
 * Creates a file api template argument that will appear while rendering.
 * @param {string} name The name of the argument in the template.
 * @param {any} val The value of the argument. Can be a function as well.
 * @returns The Stratis template argument that appears in rendering.
 */
function as_stratis_template_arg(name, val) {
  return new StratisCodeObject(val, 'TEMPLATE_ARG', name)
}

class StratisRequestHandler extends StratisCodeObject {
  /**
   * Creates a request handler that can override/augment the request before
   * the file api executes.
   * @param {(req:Request, res:Response, next:NextFunction, api:Stratis)} on_request
   */
  constructor(on_request) {
    super('request_handler', on_request, 'REQUEST_HANDLER')
  }

  /**
   * @type {(req:Request, res:Response, next:NextFunction, api:Stratis)=>void} on_request
   */
  get on_request() {
    return this.val
  }
}

/**
 * A request environment for the jinja bank.
 * Holds the module information and status for the request.
 */
class StratisRequestEnvironment {
  /**
   * A request environment for the jinja bank.
   * Holds the module information and status for the request.
   * @param {Stratis} api
   * @param {StratisRequestInfo} info
   */
  constructor() {
    /**
     * @type {Object<string,function|Object|StratisCodeObject>}
     */
    this.codefile_module = null
    /**
     * @type {[StratisCodeObject]}
     */
    this.env_objects = null

    /**
     * @type {Date}
     */
    this.created = null

    /**
     * @type {Date}
     */
    this.last_checked = null

    /**
     * @type {[Date]}
     */
    this.last_modification_timestamps = null

    /** @type {string} */
    this.__api_script = null

    this.has_codefile = false

    this.content_type = null
  }

  /**
   * A collection of api methods to be exposed.
   * @returns {Object<string,function>}
   */
  get api_methods() {
    if (this.env_objects == null) return []
    if (this.__api_methods == null)
      this.__api_methods = StratisCodeObject.to_key_value_object(
        this.env_objects.filter((o) => o.type == 'API_METHOD')
      )
    return this.__api_methods
  }

  /**
   * A collection of template rendering objects to be used.
   * @returns {Object<string,function>}
   */
  get ejs_environment() {
    if (this.env_objects == null) return {}
    if (this.__ejs_environment == null)
      this.__ejs_environment = StratisCodeObject.to_key_value_object(
        this.env_objects.filter((o) => o.type == 'TEMPLATE_ARG')
      )
    return this.__ejs_environment
  }

  /**
   * @returns {[StratisRequestHandler]}
   */
  get request_handlers() {
    if (this.env_objects == null) return []
    if (this.__request_handlers == null)
      this.__request_handlers = this.env_objects.filter(
        (o) => o.type == 'REQUEST_HANDLER'
      )
    return this.__request_handlers
  }

  get api_script() {
    return this.__api_script
  }

  /**
   * @param {StratisRequestInfo} info
   * @returns {[Date]}
   */
  async __get_modification_timestamps(info) {
    const current_mtimes = [info.stat.mtime]
    try {
      current_mtimes.push((await fs.promises.stat(info.codefilepath)).mtime)
    } catch (err) {}
    return current_mtimes
  }

  /**
   * @param {StratisRequestInfo} info
   * @return {boolean} True if changed.
   */
  async check(info) {
    this.last_checked = new Date()

    const current_mtimes = await this.__get_modification_timestamps(info)

    if (this.last_modification_timestamps == null) return true

    for (let cur of current_mtimes)
      for (let last of this.last_modification_timestamps)
        if (cur > last) return true

    return false
  }

  /**
   * @param {Stratis} api
   */
  render_api_script(api) {
    return ejs.render(Stratis_core_source, {
      stratis: api,
      Stratis_methods: [
        '\n', // needed for comment override
        ...Object.keys(this.api_methods).map((k) => {
          return `static async ${k}(...args){return await _stratis_send_ws_request("${k}",null,...args)}`
        }),
      ].join('\n'),
    })
  }

  /**
   * @param {Stratis} api
   * @param {StratisRequestInfo} info
   */
  async load_request(api, info) {
    this.created = new Date()
    this.has_codefile = fs.existsSync(info.codefilepath)
    this.last_modification_timestamps = await this.__get_modification_timestamps(
      info
    )

    if (this.has_codefile) delete require.cache[info.codefilepath]
    this.codefile_module = this.has_codefile ? require(info.codefilepath) : {}

    this.env_objects = [...api.env_objects] // copy

    for (let key of Object.keys(this.codefile_module)) {
      let o = this.codefile_module[key]
      o = o instanceof StratisCodeObject ? o : new StratisCodeObject(o)
      o.name = o.name || key
      this.env_objects.push(o)
    }

    for (let o of api.__core_env_objects) {
      this.env_objects.push(o)
    }

    this.__api_script = this.render_api_script(api)
    const charset = mime.charsets.lookup(info.filepath)
    this.content_type =
      mime.lookup(info.filepath, 'html/txt') +
      (charset ? '; charset=' + charset : '')
  }
}

class StratisRequestEnvironmentBank {
  /**
   * A memory bank for pre-rendered templates, env cache.
   * @param {Stratis} api
   */
  constructor(api) {
    this.api = api
    /**
     * @type {Object<string,StratisRequestEnvironment>}
     */
    this.__col = {}
    this.last_cleaned = null
  }

  /**
   * @type {Object<string,StratisRequestEnvironment>}
   */
  get col() {
    return this.__col
  }

  clean() {
    if (
      this.last_cleaned != null &&
      new Date() - this.last_cleaned < this.api.cache_clean_interval
    )
      return
    Object.keys(this.col).forEach((k) => {
      const env = this.col[k]
      if (new Date() - env.last_checked > this.api.cache_max_lifetime) {
        delete this.__col[k]
      }
    })
  }

  /**
   * @param {StratisRequestInfo} info
   * @param {boolean} validate
   */
  async get(info, validate = true) {
    let env = this.col[info.filepath]
    if (
      validate &&
      env != null &&
      new Date() - env.last_checked > this.api.cache_check_minimal_interval
    ) {
      if (await env.check(info)) env = null
    }

    if (env == null) {
      env = new StratisRequestEnvironment()
      await env.load_request(this.api, info)
      this.col[info.filepath] = env
    }

    return env
  }

  reset() {
    this.__col = {}
  }
}

/**
 * Interface for Stratis options.
 * @typedef {Object} StratisOptions
 * @property {Object<string,(...args, req:Request, res: Response, next:NextFunction)=>void>} api_methods A collection
 * of core api methods to expose.
 * @property {Object<string, any>} ejs_environment A collection to render time objects to expose.
 * @property {RegExp} filepath_and_query_regexp The filepath and query regexp. Must return two groups.
 * @property {string} codefile_postfix The file extension (without starting .) for recognizing code files.
 * @property {console| {}} logger The logger to use, must have logging methods (info, warn, error ...)
 * @property {boolean} log_errors_to_console Auto log all errors to console.
 * @property {integer} cache_check_minimal_interval The minimal interval for cache checking [ms]
 * @property {integer} cache_clean_interval The minimal interval for cache cleaning [ms]
 * @property {integer} cache_max_lifetime The maximal cache lifetime [ms]
 * @property {integer} client_request_timeout The client side request timeout [ms]
 * @property {string}  api_version The api version name to use
 * @property {ejs.Options} ejs_options The ejs options.
 * @property {(filepath)=>boolean} access_filter If true, then allow the file to be accessed from the web. Defaults
 * @property {boolean} next_handler_on_forbidden If true, then dose not send a 404 on a forbidden file, but rather
 * sends the request to the next handler.
 * to true.
 * (if search query api='api_version', means api request)
 */

class Stratis extends events.EventEmitter {
  /**
   * Creates a file api handler that can be used to generate
   * the file api.
   * @param {StratisOptions} param0
   */
  constructor({
    api_methods = {},
    ejs_environment = {},
    template_extensions = [
      '.html',
      '.htm',
      '.xhtml',
      '.js',
      '.css',
      '.api.yaml',
      '.api.json',
    ],
    filepath_and_query_regexp = /^([^?#]+)(.*)$/,
    codefile_postfix = 'code.js',
    logger = null,
    log_errors_to_console = true,
    cache_check_minimal_interval = 10,
    cache_clean_interval = 1000,
    cache_max_lifetime = 5 * 60 * 1000,
    client_request_timeout = 1 * 60 * 1000,
    api_version = 'v1',
    ejs_options = {},
    access_filter = null,
    next_handler_on_forbidden = false,
  } = {}) {
    super()

    /** @type {StratisEventListenRegister} */
    this.on
    /** @type {StratisEventListenRegister} */
    this.once

    /** @type {StratisEventEmitter} */
    this.emit

    this.logger = logger || console
    this.filepath_and_query_regexp = filepath_and_query_regexp
    this.codefile_postfix = codefile_postfix
    this.cache_check_minimal_interval = cache_check_minimal_interval
    this.cache_clean_interval = cache_clean_interval
    this.cache_max_lifetime = cache_max_lifetime
    this.client_request_timeout = client_request_timeout || 1000
    this.api_version = api_version
    this.template_extensions = template_extensions
    this.access_filter = access_filter
    this.next_handler_on_forbidden = next_handler_on_forbidden

    /** @type {ejs.Options} */
    this.ejs_options = {
      ...ejs_options,
    }

    this.env_bank = new StratisRequestEnvironmentBank(this)

    assert(
      api_methods == null ||
        Object.values(api_methods).every((v) => typeof v == 'function'),
      'Remote methods object must only contain methods'
    )

    /**
     * @type {[StratisCodeObject]}
     */
    this.env_objects = []
    Object.keys(api_methods).forEach((k) =>
      this.env_objects.push(
        new StratisCodeObject(api_methods[k], 'API_METHOD', k)
      )
    )
    Object.keys(ejs_environment).forEach((k) =>
      this.env_objects.push(
        new StratisCodeObject(ejs_environment[k], 'TEMPLATE_ARG', k)
      )
    )

    this.__core_env_objects = [
      as_stratis_template_arg(
        'render_stratis_script_tag',
        Stratis.render_stratis_script_tag
      ),
      as_stratis_method(
        'render_stratis_api_description',
        Stratis.render_stratis_api_description
      ),
      as_stratis_method(
        'render_stratis_browser_api_script',
        Stratis.render_stratis_browser_api_script
      ),
      as_stratis_template_arg('stratis', this),
    ]

    if (log_errors_to_console) {
      this.on('error', (err) => {
        console.error(err)
      })
    }
  }

  /**
   * Internal.
   * @param {string} src
   * @param {Request} req
   * @returns {StratisRequestInfo}
   */
  async _get_request_info(src, req) {
    const fileQuery = req.originalUrl.substr(req.baseUrl.length)
    const match = new RegExp(this.filepath_and_query_regexp).exec(fileQuery)
    if (match == null) {
      return {}
    }

    const filepath = path.join(src, match[1] || '')
    const is_public =
      this.access_filter == null ? true : this.access_filter(filepath)

    /**
     * @type {fs.Stats}
     */
    let stat = null
    try {
      stat = await fs.promises.stat(path.join(src, match[1] || ''))
    } catch {}

    const is_target_a_codefile = filepath.endsWith(this.codefile_postfix)

    const codefilepath = is_target_a_codefile
      ? null
      : path.join(
          path.dirname(filepath),
          [
            path.basename(filepath).split('.').slice(0, -1).join('.'),
            this.codefile_postfix,
          ].join('.')
        )

    return {
      url: new URL(req.protocol + '://' + req.get('host') + req.originalUrl),
      codefilepath,
      filepath,
      stat,
      exists: stat != null,
      query: match[2],
      is_public: is_target_a_codefile ? false : is_public,
    }
  }

  /**
   * Template method. Renders the file api script.
   * @param {Request} req
   * @param {Response} res
   */
  static render_stratis_script_tag(req, res) {
    const ver = req.stratis.api_version || 'v1'
    const uri = path.basename(req.path)
    return `<script lang="javascript" src='${uri}?api=${ver}&call=render_stratis_browser_api_script'></script>`
  }

  static render_stratis_browser_api_script(req, res) {
    /** @type {StratisRequestEnvironment} */
    const env = req.stratis_env
    return env.api_script
  }

  static render_stratis_api_description(req, res) {
    /** @type {StratisRequestEnvironment} */
    const env = req.stratis_env
    /** @type {Stratis} */
    const stratis = req.stratis

    const api_description = {
      api: stratis.api_version,
      methods: Object.keys(env.api_methods),
    }

    return JSON.stringify(api_description)
  }

  /**
   * @param {Request} req
   * @param {StratisRequestInfo} info
   * @param {StratisRequestEnvironment} env
   * @param {Buffer} payload
   */
  _apply_stratis_request_args(req, info, env, payload = null) {
    req.stratis = this
    req.stratis_env = env
    req.stratis_info = info
    req.payload = payload
  }

  /**
   *
   * @param {Request} req
   */
  _clean_stratis_request_args(req) {
    delete req.stratis
    delete req.stratis_env
    delete req.stratis_info
    delete req.payload
  }

  async _invoke_api_method(info, env, req, res, name, args) {
    try {
      if (env.api_methods[name] == null)
        throw new Error(`api ${name} method not found`)
      return await env.api_methods[name](...args, req, res)
    } catch (err) {
      this.emit('api_error', err)
      throw err
    }
  }

  /**
   * @param {stream.Readable|Buffer|string} data
   * @returns {[call_info: Object, payload: stream.Readable]} The call info and the stream body.
   */
  async _parse_body(data) {
    const [call_info_stream, payload] = split_stream_once(data, '\0')
    const call_info_buffer = await stream_to_buffer(call_info_stream)
    return [
      call_info_buffer.length == 0
        ? {}
        : JSON.parse(call_info_buffer.toString('utf-8')),
      payload,
    ]
  }

  /**
   * Internal.
   * @param {StratisRequestInfo} info The request environment.
   * @param {StratisRequestEnvironment} env The request environment.
   * @param {Request} req The express request
   * @param {Response} res The express response to be sent
   * @param {NextFunction} next call next
   */
  async _handle_websocket_request(info, env, req, res, next) {
    websocket((ws, req) => {
      const invoke =
        /**
         * @param {Object} call_info
         * @param {Buffer} payload
         */
        async (call_info, payload) => {
          try {
            const env = await this.env_bank.get(info)
            this._apply_stratis_request_args(req, info, env, payload)
            const rslt = await this._invoke_api_method(
              info,
              env,
              req,
              res,
              call_info.call,
              call_info.args
            )
            ws.send(
              JSON.stringify({
                call: call_info.rid,
                args: [rslt],
              })
            )
          } catch (err) {
            ws.send(
              JSON.stringify({
                call: 'error',
                args: [err],
              })
            )
            this.emit('error', err)
          } finally {
            this._clean_stratis_request_args(req)
          }
        }

      ws.on('message', async (data) => {
        const [call_info, payload] = await this._parse_body(data)
        await invoke(call_info, payload)
      })

      ws.on('open', () => this.emit('websocket_open'))
      ws.on('close', () => this.emit('websocket_close'))
      ws.on('error', (err) => this.emit('error', err))
    })(req, res, next)
  }

  /**
   * Internal.
   * @param {StratisRequestInfo} info The request environment.
   * @param {StratisRequestEnvironment} env The request environment.
   * @param {Request} req The express request
   * @param {Response} res The express response to be sent
   * @param {NextFunction} next call next
   */
  async _handle_api_request(info, env, req, res, next) {
    let [call_info, payload] = await this._parse_body(req.body || '')

    let search_params_args = null
    let search_params_call = null
    for (let k of info.url.searchParams.keys()) {
      if (k == 'call') {
        search_params_call = info.url.searchParams.get(k)
        continue
      } else if (k == 'api') {
        continue
      }
      if (search_params_args == null) {
        search_params_args = {}
      }
      search_params_args[k] = info.url.searchParams.get(k)
    }

    call_info.rid = call_info.rid || ''
    call_info.call = search_params_call || call_info.call
    call_info.args = call_info.args || []

    if (!Array.isArray(call_info.args)) call_info.args = [call_info.args]
    if (search_params_args) call_info.args.unshift(search_params_args)

    if (call_info.call == null || env.api_methods[call_info.call] == null)
      return res.sendStatus(404)

    this._apply_stratis_request_args(req, info, env, payload)

    let return_val = await this._invoke_api_method(
      info,
      env,
      req,
      res,
      call_info.call,
      call_info.args
    )

    if (return_val == null) return res.end()

    if (typeof return_val == 'object' && !return_val instanceof Date) {
      return_val = JSON.stringify(return_val)
    }

    return res.send(`${return_val}`)
  }

  /**
   * Internal,
   * @param {StratisRequestInfo} info The request environment.
   * @param {StratisRequestEnvironment} env The request environment.
   * @param {Request} req The express request
   * @param {Response} res The express response to be sent
   * @param {NextFunction} next call next
   */
  async _handle_file_request(info, env, req, res, next) {
    const is_template = this.template_extensions.some((ext) =>
      info.filepath.endsWith(ext)
    )
    if (!is_template) return res.sendFile(info.filepath)
    if (env.content_type) res.setHeader('Content-Type', env.content_type)

    const ejs_data = { req, res, session: req.session || {} }
    for (let k of Object.keys(env.ejs_environment)) {
      let o = env.ejs_environment[k]
      if (typeof o == 'function') {
        const call_to = o
        o = (...args) => call_to(...args, req, res)
      }
      ejs_data[k] = o
    }
    res.send(
      await ejs.renderFile(info.filepath, ejs_data, {
        async: true,
      })
    )
  }

  /**
   * @param {string} src The base path where to search for files.
   * @returns {(req:Request,res:Response,next:NextFunction)=>void} The middleware
   */
  middleware(src) {
    if (!fs.existsSync(src))
      throw new Error(`Stratis search path ${src} dose not exist`)
    const src_stat = fs.statSync(src)

    assert(
      src_stat.isDirectory(),
      Error(`Stratis search path ${src} must point to a directory`)
    )

    /**
     * @param {Request} req The request
     * @param {Response} res The response
     * @param {NextFunction} next Call next
     */
    const intercept = async (req, res, next) => {
      const info = await this._get_request_info(src, req)

      if (info.filepath == null) {
        this.emit('error', new Error('Could not parse filepath'))
        res.sendStatus(500)
        return
      }

      if (!info.exists || info.stat.isDirectory()) {
        return next()
      }

      if (!info.is_public) {
        if (this.next_handler_on_forbidden) return next()
        return res.sendStatus(404)
      }

      // back cleaning.
      this.env_bank.clean()

      const env = await this.env_bank.get(info)
      this._apply_stratis_request_args(req, info, env)

      try {
        let moved_next = false
        let next_rsp = null
        for (let handler of env.request_handlers) {
          handler.on_request(
            req,
            res,
            (...args) => {
              moved_next = true
              next_rsp = next(...args)
              return next_rsp
            },
            this
          )
          if (moved_next) {
            // cleanup, since next is called.
            cleanup()
            return next_rsp
          }
        }

        if (websocket.is_websocket_request(req))
          await this._handle_websocket_request(info, env, req, res, next)
        else if (info.url.searchParams.get('api') == this.api_version)
          await this._handle_api_request(info, env, req, res, next)
        else await this._handle_file_request(info, env, req, res, next)
      } finally {
        // cleanup.
        this._clean_stratis_request_args(req)
      }
    }

    return intercept
  }

  /**
   * Creates a new express server to use with the Stratis.
   * @param {string} src The path to the folder to serve.
   * @param {express.Express} app The express app to use, if null create one.
   * @returns {express.Express} The express app to use. You can do express.listen
   * to start the app.
   */
  server(src, app = null) {
    app = app || express()
    app.use(this.middleware(src))
    return app
  }
}

module.exports = {
  Stratis,
  /** @type {StratisOptions} */
  StratisOptions: {},
  /** @type {StratisRequestInfo} */
  StratisRequestInfo: {},
  StratisCodeObject,
  StratisRequestHandler,
  StratisRequestEnvironment,
  StratisRequestEnvironmentBank,
  as_stratis_method,
  as_stratis_template_arg,
}
