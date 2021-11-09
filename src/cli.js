#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const express = require('express')

const { Request, Response, NextFunction } = require('express/index')
const { Cli, CliArgument } = require('@lamaani/infer')

const { Stratis } = require('./webserver/stratis.js')
const { assert } = require('./common')

/**
 * @typedef {import('./index').StratisMiddlewareOptions} StratisMiddlewareOptions
 */

class StratisCli {
  /**
   * Implements an infer set of arguments to control the stratis.
   */
  constructor() {
    this.serve_path = process.cwd()
    /** If true, start the stratis listeners. Otherwise init script must start the listeners. */
    this.use_stratis_listeners = true
    /** @type {CliArgument} */
    this.__$use_stratis_listeners = {
      type: 'named',
      environmentVariable: 'STRATIS_USE_STRATIS_LISTENERS',
      default: this.use_stratis_listeners,
      description:
        'If true, start the stratis listeners. Otherwise init script must start the listeners.',

      parse: (v) => v === true || v == 'true',
    }

    /** @type {CliArgument} */
    this.__$serve_path = {
      type: 'positional',
      default: this.serve_path,
      environmentVariable: 'STRATIS_SERVE_PATH',
      description:
        'The path where to find the public files (all files will be exposed)',
      parse: (p) => {
        if (p == null || p.trim().length == 0) return null
        let resolved = path.resolve(p)
        if (resolved == null) return p
        return resolved
      },
    }

    

    /** The webserver port*/
    this.port = 8080

    /** @type {CliArgument} The webserver port*/
    this.__$port = {
      type: 'named',
      default: this.port,
      environmentVariable: 'STRATIS_PORT',
      parse: (val) => (typeof val == 'number' ? val : parseInt(val)),
      description: 'The webserver port',
    }

    

    /** The https port to use. If null, do not listen on ssl. */
    this.https_port = 8443
    /** @type {CliArgument} */
    this.__$https_port = {
      type: 'named',
      environmentVariable: 'STRATIS_HTTPS_PORT',
      default: this.https_port,
      description: 'The https port to use. If empty, do not listen on ssl.',
      parse: (val) => {
        if (typeof val == 'number') return val
        if (val == null || val.trim().length == 0) return null
        return parseInt(val)
      },
    }

    /** If true enable https. https port must be defined. */
    this.enable_https = false
    /** @type {CliArgument} */
    this.__$enable_https = {
      type: 'flag',
      environmentVariable: 'STRATIS_ENABLE_HTTPS',
      default: this.enable_https,
      description:
        'If true enable https. https port must be defined. If enabled, all connections not whitelisted in allow_http_for will be redirected to https.',
    }

    /** The ssl key (certificate decrypt key) */
    this.ssl_key = null
    /** @type {CliArgument} */
    this.__$ssl_key = {
      type: 'named',
      environmentVariable: 'STRATIS_SSL_KEY',
      default: this.ssl_key,
      description: 'The ssl key (certificate decrypt key)',
    }

    /** The ssl certificate. */
    this.ssl_cert = null
    /** @type {CliArgument} */
    this.__$ssl_cert = {
      type: 'named',
      environmentVariable: 'STRATIS_SSL_CERT',
      default: this.ssl_cert,
      description: 'The ssl certificate.',
    }

    /** The ssl certificate key path (certificate decrypt key) */
    this.ssl_key_path = null
    /** @type {CliArgument} */
    this.__$ssl_key_path = {
      type: 'named',
      environmentVariable: 'STRATIS_SSL_KEY_PATH',
      default: this.ssl_key_path,
      description: 'The ssl certificate key path (certificate decrypt key)',
    }

    /** The ssl certificate path */
    this.ssl_cert_path = null
    /** @type {CliArgument} */
    this.__$ssl_cert_path = {
      type: 'named',
      environmentVariable: 'STRATIS_SSL_CERT_PATH',
      default: this.ssl_cert_path,
      description: 'The ssl certificate path',
    }

    /** The default redirect path to use for (/)*/
    this.default_redirect = null

    /** @type {CliArgument} The default redirect path to use for (/)*/
    this.__$default_redirect = {
      type: 'named',
      default: this.default_redirect,
      environmentVariable: 'STRATIS_DEFAULT_REDIRECT',
      description:
        'The default redirect path to use for (/). Default to public/index.html or index.html',
    }

    /** If true, redirects all unknown requests to the default redirect*/
    this.redirect_all_unknown = false

    /** @type {CliArgument} If true, redirects all unknown request to the default redirect*/
    this.__$redirect_all_unknown = {
      type: 'named',
      default: this.redirect_all_unknown,
      environmentVariable: 'STRATIS_REDIRECT_ALL_UNKNOWN',
      description:
        'If true, redirects all unknown request to the default redirect',
    }

    /** The log level, DEBUG will show all requests*/
    this.log_level = 'INFO'

    /** @type {CliArgument} The log level, DEBUG will show all requests*/
    this.__$log_level = {
      type: 'named',
      default: this.log_level,
      environmentVariable: 'STRATIS_LOG_LEVEL',
      description: 'The log level, DEBUG will show all requests',
    }

    /** Enable cache for requests*/
    this.cache = false

    /** @type {CliArgument} Enable cache for requests*/
    this.__$cache = {
      type: 'flag',
      default: this.cache,
      environmentVariable: 'STRATIS_CACHE',
      description: 'Enable cache for requests',
    }

    /** The path to a stratis initialization js file. Must return method (stratis, express_app, stratis_cli)=>{}.
     * Calling stratis.init_service() will register the stratis middleware */
    this.init_script_path = null
    /** @type {CliArgument} */
    this.__$init_script_path = {
      type: 'named',
      environmentVariable: 'STRATIS_INIT_SCRIPT_PATH',
      default: this.init_script_path,
      description: `The path to a stratis initialization js file. Must return method (stratis, express_app, stratis_cli)=>{}. Calling stratis.init_service() will register the stratis middleware.`,
      parse: (p) =>
        p == null || p.trim().length == 0 ? null : path.resolve(p),
    }

    /** If true, the require method will be added to the template rendering */
    this.ejs_add_require = true
    /** @type {CliArgument} */
    this.__$ejs_add_require = {
      type: 'named',
      environmentVariable: 'STRATIS_EJS_ADD_REQUIRE',
      default: this.ejs_add_require,
      description:
        'If true, the require method will be added to the template rendering',
      parse: (v) => v === true || v == 'true',
    }

    /** If true, sends the application error details to the client with 500 http response. */
    this.show_app_errors = false
    /** @type {CliArgument} */
    this.__$show_app_errors = {
      type: 'flag',
      environmentVariable: 'STRATIS_SHOW_APP_ERRORS',
      default: this.show_app_errors,
      description:
        'If true, sends the application error details to the client with 500 http response.',
    }

    /** @type {[RegExp]} An array or newline separated list of regular expressions to allow http connections. Only active in the case where https is active. */
    this.allow_http_for = []
    /** @type {CliArgument} */
    this.__$allow_http_for = {
      type: 'named',
      environmentVariable: 'STRATIS_ALLOW_HTTP_FOR',
      default: this.allow_http_for,
      collectMultiple: true,
      description:
        'A newline separated list of regular expressions to match against the request path. Active if enable_https.',
      parse:
        /**
         * @param {string} v
         * @returns {RegExp| [RegExp]}
         */
        (v) => {
          if (v instanceof RegExp) return v
          assert(typeof v == 'string')
          const v_arr = v
            .trim()
            .split('\n')
            .filter((v) => v.length > 0)
            .map((v) => new RegExp(v))

          assert(v_arr.length > 0, 'invalid array length for allow_http_for')

          this.allow_http_for = this.allow_http_for.concat(
            v_arr.slice(0, v_arr.length - 1)
          )

          return v_arr[v_arr.length - 1]
        },
    }

    /** If true, includes the domain in the http_allow_for */
    this.full_url_in_http_allow = false
    /** @type {CliArgument} */
    this.__$full_url_in_http_allow = {
      type: 'flag',
      environmentVariable: 'STRATIS_FULL_URL_IN_HTTP_ALLOW',
      default: this.full_url_in_http_allow,
      description:
        'If true, the http_allow_for will be matched to the full url.',
    }

    /** If true, denies localhost connections to use http. */
    this.no_localhost_http = false
    /** @type {CliArgument} */
    this.__$no_localhost_http = {
      type: 'flag',
      environmentVariable: 'STRATIS_NO_LOCALHOST_HTTP',
      default: this.allow_localhost_http,
      description: 'If true, denies localhost connections to use http.',
    }

    this._api = null
    this._app = express()
  }

  get api() {
    if (this._api == null) {
      this._api = new Stratis({
        ejs_options: {
          require: this.ejs_add_require,
        },
      })
    }
    return this._api
  }

  get app() {
    if (this._app == null) {
      this._app = express()
    }
    return this._app
  }

  async _get_value_or_file_content(val, fpath, error_text) {
    if (val != null) return val
    try {
      if (fpath == null || fpath.trim().length == 0)
        throw new Error('File path cannot be empty or null')
      return await fs.promises.readFile(fpath, { encoding: 'utf-8' })
    } catch (err) {
      throw new Error(error_text + ': ' + err.message)
    }
  }

  /**
   * @param {Cli} cli The command line interface.
   * @param {bool} listen_sync If true, await listen to the port.
   */
  async _listen(cli, listen_sync) {
    let ssl_certificates = null
    if (this.enable_https) {
      ssl_certificates = {
        key: await this._get_value_or_file_content(
          this.ssl_key,
          this.ssl_key_path,
          'Could not load ssl key'
        ),
        cert: await this._get_value_or_file_content(
          this.ssl_cert,
          this.ssl_cert_path,
          'Could not load ssl certificate'
        ),
      }
    }
    // crete the servers
    let httpServer = http.createServer(this.app)
    let httpsServer = ssl_certificates
      ? https.createServer({ ...ssl_certificates }, this.app)
      : null

    cli.logger.info(`Stratis is listening on: http://localhost:${this.port}`)
    if (ssl_certificates)
      cli.logger.info(
        `Stratis is listening on: https://localhost:${this.https_port}`
      )

    if (httpsServer) {
      httpsServer.listen(this.https_port)
    }

    if (listen_sync) httpServer.listen(this.port)
    else await httpServer.listen(this.port)
  }

  /**
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async redirect_to_https(req, res, next) {
    // In case a port was provided. Otherwise we should get an https request.
    const full_hostname = req
      .get('host')
      .replace(/[:][0-9]+$/, ':' + this.https_port)

    // not https. redirect.
    res.redirect('https://' + full_hostname + req.originalUrl)
  }

  /**
   * Call to run the stratis cli. (Overrideable)
   * @param {Cli} cli The command line interface.
   */
  async invoke_initialization_scripts(cli) {
    if (this.init_script_path != null) {
      const script_path = path.resolve(this.init_script_path)
      assert(
        fs.existsSync(script_path),
        `Init script file not found @ ${script_path}`
      )

      const init_stratis = require(script_path)
      assert(
        typeof init_stratis == 'function',
        `Stratis init script must return a function, e.g. (stratis, express_app, stratis_cli)=>{}  @ ${this.init_script_path}`
      )

      init_stratis(this.api, this.app, cli)
    }
  }

  /**
   * Call to run the stratis cli.
   * @param {Cli} cli The command line interface.
   * @param {bool} listen_sync If true, await listen to the port.
   */
  async run(cli = null, listen_sync = false) {
    let stat = null
    cli = cli || new Cli({ name: 'stratis' })
    cli.logger.level = this.log_level
    try {
      stat = await fs.promises.stat(this.serve_path)
    } catch (err) {}

    assert(
      this.serve_path != null && stat != null && stat.isDirectory(),
      `The path ${this.serve_path} could not be found or is not a directory.`
    )

    if (this.enable_https) {
      cli.logger.info(
        `Auto redirecting all traffic ${this.port}(http) -> ${this.https_port} (https) `
      )

      this.app.use((req, res, next) => {
        if (req.protocol != 'http') return next()
        if (
          !this.no_localhost_http &&
          (req.hostname == 'localhost' || req.hostname.endsWith('.localhost'))
        ) {
          return next()
        }

        const check_url = this.full_url_in_http_allow
          ? req.protocol + '://' + req.get('host') + req.path
          : req.path

        if (this.allow_http_for.some((re) => re.test(check_url))) {
          return next()
        }

        cli.logger.debug(
          `Redirect ${req.protocol} to https ` + req.originalUrl,
          '~>'.cyan
        )

        this.redirect_to_https(req, res, next)
      })
    }

    if (typeof this.default_redirect != 'string') {
      const redirect_basepath = fs.existsSync(
        path.join(this.serve_path, 'public')
      )
        ? 'public'
        : ''
      for (const fname of ['index.html', 'index.htm', 'api']) {
        if (fs.existsSync(path.join(this.serve_path, redirect_basepath, fname)))
          this.default_redirect = path.join(redirect_basepath, fname)
      }
    }

    const redirect = (req, res, next) => {
      return res.redirect(this.default_redirect)
    }

    let stratis_init_called = false
    this.api.__server_internal_command = this.api.server

    this.api.server =
      /**
       * Override server command to allow cli intervention
       * @param {StratisMiddlewareOptions} options
       * @param {express.Express} app The express app to use, if null create one.
       * @returns {express.Express} The express app to use. You can do express.listen
       * to start the app.
       */
      (options = {}, app = null) => {
        stratis_init_called = true

        if (this.ejs_add_require && this.api)
          this.app.use((req, res, next) => {
            cli.logger.debug(`${req.originalUrl}`, '->'.cyan)
            next()
          })

        this.api.__server_internal_command(
          Object.assign(
            {
              serve_path: this.serve_path,
              return_errors_to_client: this.show_app_errors,
              log_errors: true,
              next_on_private: false,
              next_on_not_found: true,
            },
            options
          ),
          app || this.app
        )

        if (this.default_redirect != null) {
          if (this.redirect_all_unknown) this.app.use(redirect)
          else this.app.all('/', redirect)
          cli.logger.info(
            `Redirecting ${
              this.redirect_all_unknown ? 'all missing paths (not found)' : '/'
            } to ${this.default_redirect}`
          )
        }

        cli.logger.info('Initialized stratis service middleware and routes')
      }

    await this.invoke_initialization_scripts(cli.logger || console)

    if (!stratis_init_called) this.api.server()

    this.api.init_service = null

    if (this.use_stratis_listeners) await this._listen(cli, listen_sync)
  }
}

module.exports = {
  StratisCli,
}

if (require.main == module) {
  const api_cli = new StratisCli()
  const cli = new Cli({ name: 'stratis' })

  cli.default(
    async (args) => {
      await api_cli.run(cli)
    },
    api_cli,
    {
      description:
        "A simple web template engine for fast api's and websites. Very low memory and cpu print that fits docker and kubernetes pods, or can run parallel to your application.",
    }
  )

  cli.parse().catch((err) => {
    try {
      console.error(err)
      cli.logger.error(err.message)
    } catch (err) {
    } finally {
      process.exit(1)
    }
  })
}
