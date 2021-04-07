#!/usr/bin/env node
// command line interface.
const { Cli, Logger } = require('@LamaAni/zcli')
const CliArgument = require('@LamaAni/zcli/src/CliArgument')
const { assert } = require('console')
const path = require('path')
const fs = require('fs')
const express = require('express')

const { FileApi } = require('./index')

class FileApiCli {
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
      enviromentVariable: 'FILE_API_PORT',
      parse: (val) => (typeof val == 'number' ? val : parseInt(val)),
      description: 'The webserver port',
    }

    /** The default redirect path to use for (/)*/
    this.default_redirect = '/index.html'

    /** @type {CliArgument} The default redirect path to use for (/)*/
    this.__$default_redirect = {
      type: 'named',
      default: this.default_redirect,
      enviromentVariable: 'FILE_API_DEFAULT_REDIRECT',
      description: 'The default redirect path to use for (/)',
    }

    /** If true, redirects all unknown request to the default redirect*/
    this.redirect_all_unknown = false

    /** @type {CliArgument} If true, redirects all unknown request to the default redirect*/
    this.__$redirect_all_unknown = {
      type: 'named',
      default: this.redirect_all_unknown,
      enviromentVariable: 'FILE_API_REDIRECT_ALL_UNKNOWN',
      description:
        'If true, redirects all unknown request to the default redirect',
    }

    /** The log level, DEBUG will show all requests*/
    this.log_level = 'INFO'

    /** @type {CliArgument} The log level, DEBUG will show all requests*/
    this.__$log_level = {
      type: 'named',
      default: this.log_level,
      enviromentVariable: 'FILE_API_LOG_LEVEL',
      description: 'The log level, DEBUG will show all requests',
    }

    /** Enable cache for requests*/
    this.cache = false

    /** @type {CliArgument} Enable cache for requests*/
    this.__$cache = {
      type: 'flag',
      default: this.cache,
      enviromentVariable: 'FILE_API_CACHE',
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

    const api = new FileApi()
    const app = express()

    if (!this.cache) {
      app.use((req, rsp, next) => {
        rsp.set('Cache-Control', 'no-store')
        next()
      })
    }

    app.use((req, rsp, next) => {
      cli.logger.debug(`${req.originalUrl}`, '->'.cyan)
      next()
    })

    api.server(src, app)

    const redirect = (req, rsp, next) => {
      rsp.redirect(this.default_redirect)
    }
    if (this.redirect_all_unknown) app.use(redirect)
    else app.all('/', redirect)

    await app.listen(this.port)
    cli.logger.info('App is listening on http://localhost:' + this.port)
  }
}

const cli_args = new FileApiCli()
const cli = new Cli({ name: 'FileApi' })
cli.default((args) => cli_args.run(), cli_args)
cli.parse().catch((err) => {
  console.error(err)
})
