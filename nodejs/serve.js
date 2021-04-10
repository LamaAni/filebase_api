#!/usr/bin/env node
// command line interface.
const { Cli, CliArgument } = require('@lamaani/infer')
const { assert } = require('console')
const path = require('path')
const fs = require('fs')
const express = require('express')

const { Stratis } = require('./index')

class StratisCli {
  constructor() {
    this.serve_path = path.c

    /** @type {CliArgument} */
    this.__$serve_path = {
      type: 'positional',
      default: this.serve_path,
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
  }

  async run() {
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

    const api = new Stratis()
    const app = express()

    if (!this.cache) {
      app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store')
        next()
      })
    }

    app.use((req, res, next) => {
      cli.logger.debug(`${req.originalUrl}`, '->'.cyan)
      next()
    })

    api.server(src, app)

    const redirect = (req, res, next) => {
      res.redirect(this.default_redirect)
    }
    if (this.redirect_all_unknown) app.use(redirect)
    else app.all('/', redirect)

    await app.listen(this.port)
    cli.logger.info('App is listening on http://localhost:' + this.port)
  }
}

const cli_args = new StratisCli()
const cli = new Cli({ name: 'stratis' })

module.exports = {
  cli,
  cli_args,
}

if (require.main == module) {
  cli.default((args) => cli_args.run(), cli_args, {
    description:
      "A simple web template engine for fast api's and websites. Very low memory and cpu print that fits docker and kubernetes pods, or can run parallel to your application.",
  })
  cli.parse().catch((err) => {
    console.error(err)
  })
}
