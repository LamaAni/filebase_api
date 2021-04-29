#!/usr/bin/env node
// command line interface.
const { Cli, CliArgument } = require('@lamaani/infer')
const { assert } = require('./common')
const path = require('path')
const fs = require('fs')
const express = require('express')

const { Stratis } = require('./stratis')

class StratisCli {
  /**
   * Implements an infer set of arguments to control the stratis.
   */
  constructor() {
    this.serve_path = process.cwd()

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
      environmentVariable: 'IFR_INIT_SCRIPT_PATH',
      default: this.init_script_path,
      description: `The path to a stratis initialization js file. Must return method (stratis, express_app, stratis_cli)=>{}. Calling stratis.init_service() will register the stratis middleware.`,
      parse: (p) =>
        p == null || p.trim().length == 0 ? null : path.resolve(p),
    }

    this._api = new Stratis()
    this._app = express()
  }

  get api() {
    return this._api
  }

  get app() {
    return this._app
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

      this.app.use((req, res, next) => {
        cli.logger.debug(`${req.originalUrl}`, '->'.cyan)
        next()
      })

      this.api.server(this.serve_path, this.app)

      if (this.redirect_all_unknown) this.app.use(redirect)
      else this.app.all('/', redirect)

      cli.logger.info('Initialized stratis service middleware and routes')
    }

    if (init_stratis) init_stratis(this.api, this.app, cli)
    if (!stratis_init_called) this.api.init_service()

    this.api.init_service = null

    if (this.app.listeners().length == 0) {
      if (listen_sync) await this.app.listen(this.port)
      else this.app.listen(this.port)
    }
  }
}

module.exports = {
  StratisCli,
}

if (require.main == module) {
  const api = new StratisCli()
  const cli = new Cli({ name: 'stratis' })

  cli.default(
    async (args) => {
      await api.run(cli)
      cli.logger.info('Listening on http://localhost:' + api.port)
    },
    api,
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
