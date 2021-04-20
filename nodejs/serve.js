#!/usr/bin/env node
// command line interface.
const { Cli, CliArgument } = require('@lamaani/infer')
const { assert } = require('console')
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

    /** If exists, dose not load the stratis js file from the source directory. */
    this.skip_stratis_js_load = false
    /** @type {CliArgument} */
    this.__$skip_stratis_js_load = {
      type: 'flag',
      environmentVariable: 'STRATIS_SKIP_STRATIS_JS_LOAD',
      default: this.skip_stratis_js_load,
      description:
        'If exists, dose not load the stratis js file from the source directory.',
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
   */
  async run(cli) {
    let src = path.resolve(this.serve_path)
    let stat = null
    cli.logger.level = this.log_level
    try {
      stat = await fs.promises.stat(src)
    } catch (err) {
      src = null
    }

    assert(
      src != null && stat.isDirectory(),
      `The path ${this.serve_path} could not be found or is not a directory.`
    )

    let init_stratis = null
    if (
      !this.skip_stratis_js_load &&
      fs.existsSync(path.join(src, 'stratis.js'))
    ) {
      init_stratis = require(path.join(src, 'stratis.js'))
      if (typeof init_stratis != 'function') {
        init_stratis = null
        cli.logger.warn(
          'File stratis.js must export an initialization method, (stratis:Stratis, express_app:express.Express, cli:Cli)=>{}'
        )
        cli.logger.warn('Initialization skipped.')
      }
    }

    if (init_stratis) init_stratis(this.api, this.app, cli)

    if (!this.cache) {
      this.app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store')
        next()
      })
    }

    this.app.use((req, res, next) => {
      cli.logger.debug(`${req.originalUrl}`, '->'.cyan)
      next()
    })

    this.api.server(src, this.app)

    const redirect = (req, res, next) => {
      res.redirect(this.default_redirect)
    }

    if (this.redirect_all_unknown) this.app.use(redirect)
    else this.app.all('/', redirect)

    await this.app.listen(this.port)
  }
}

module.exports = {
  StratisCli,
}

if (require.main == module) {
  const api = new StratisCli()
  const cli = new Cli({ name: 'stratis' })

  cli.default(
    (args) => {
      api.run(cli)
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
  })
}
