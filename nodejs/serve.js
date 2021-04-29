#!/usr/bin/env node
// command line interface.
const { Cli, CliArgument } = require('@lamaani/infer')
const { assert } = require('./common')
const path = require('path')
const fs = require('fs')
const express = require('express')
const http = require('http')
const https = require('https')

const { Stratis } = require('./stratis')

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
      parse: (p) =>
        p == null || p.trim().length == 0 ? null : path.resolve(p),
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
    this.https_port = null
    /** @type {CliArgument} */
    this.__$https_port = {
      type: 'named',
      environmentVariable: 'STRATIS_HTTPS_PORT',
      default: this.https_port,
      description: 'The https port to use. If empty, do not listen on ssl.',
      parse: (val) => {
        if (val == null || val.trim().length == 0) return null
        if (typeof val == 'number') return val
        return parseInt(val)
      },
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
    this.default_redirect = '/index.html'

    /** @type {CliArgument} The default redirect path to use for (/)*/
    this.__$default_redirect = {
      type: 'named',
      default: this.default_redirect,
      environmentVariable: 'STRATIS_DEFAULT_REDIRECT',
      description: 'The default redirect path to use for (/)',
    }

    /** If true, redirects all unknown request to the default redirect*/
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

    this._api = null
    this._app = express()
  }

  get api() {
    if (this._api == null) {
      this._api = new Stratis({
        ejs_environment_require: this.ejs_add_require,
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
    if (this.https_port) {
      ssl_certificates = {
        key: await this._get_value_or_file_content(
          this.ssl_key,
          this.ssl_key_path,
          'Could not load ssl key'
        ),
        cert: await this._get_value_or_file_content(
          this.ssl_cert_cert,
          this.cert_key_path,
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
   * Call to run the stratis cli.
   * @param {Cli} cli The command line interface.
   * @param {bool} listen_sync If true, await listen to the port.
   */
  async run(cli, listen_sync = false) {
    let stat = null
    cli.logger.level = this.log_level
    try {
      stat = await fs.promises.stat(this.serve_path)
    } catch (err) {
      this.serve_path = null
    }

    assert(
      this.serve_path != null && stat.isDirectory(),
      `The path ${this.serve_path} could not be found or is not a directory.`
    )

    let init_stratis = null

    if (this.init_script_path != null) {
      assert(
        fs.existsSync(this.init_script_path),
        `Init script file not found @ ${this.init_script_path}`
      )

      init_stratis = require(this.init_script_path)
      assert(
        typeof init_stratis == 'function',
        `Stratis init script must return a function, e.g. (stratis, express_app, stratis_cli)=>{}  @ ${this.init_script_path}`
      )
    }

    const redirect = (req, res, next) => {
      res.redirect(this.default_redirect)
    }

    let stratis_init_called = false

    this.api.init_service = () => {
      stratis_init_called = true

      if (this.ejs_add_require && this.api)
        this.app.use((req, res, next) => {
          cli.logger.debug(`${req.originalUrl}`, '->'.cyan)
          next()
        })

      this.api.server(this.serve_path, this.app)

      if (this.redirect_all_unknown) this.app.use(redirect)
      else this.app.all('/', redirect)

      cli.logger.info('Initialized stratis service middleware and routes')
    }

    if (init_stratis) await init_stratis(this.api, this.app, cli)
    if (!stratis_init_called) this.api.init_service()

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
    console.error(err)
    try {
      cli.logger.error(err.message)
    } catch {}
  })
}
