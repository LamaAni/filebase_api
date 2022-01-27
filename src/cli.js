#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const express = require('express')
const cookie_parser = require('cookie-parser')

const { Request, Response, NextFunction } = require('express/index')
const { Cli, CliArgument } = require('@lamaani/infer')

const {
  StratisSessionProvider,
  StratisSessionStorageProvider,
  from_storage_type_name,
  StratisSessionStorageProvidersByType,
} = require('./utils/session')
const { StratisOAuth2Provider } = require('./utils/oauth2')
const { Stratis } = require('./webserver/stratis.js')
const { assert, get_express_request_url, concat_url_args } = require('./common')

/**
 * @typedef {import('./utils/session').StratisSessionProviderOptions} StratisSessionProviderOptions
 * @typedef {import('./utils/session').StratisSessionStorageProviderOptions} StratisSessionStorageProviderOptions
 * @typedef {import('./utils/session').StratisSessionStorageProviderName} StratisSessionStorageProviderName
 * @typedef {import('./index').StratisMiddlewareOptions} StratisMiddlewareOptions
 * @typedef {import('./utils/oauth2').StratisOAuth2ProviderOptions} StratisOAuth2ProviderOptions
 */

/** @type {StratisSessionStorageProviderOptions} */
const DEFAULT_SESSION_STORAGE_PROVIDER_OPTIONS = {
  name: 'stratis:session',
  maxAge: 1000 * 60 * 60 * 12,
  overwrite: true,
}

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

    /** Show the stratis api version and exit */
    this.version = false
    /** @type {CliArgument} */
    this.__$version = {
      type: 'flag',
      default: this.version,
      description: 'Show the stratis api version and exit',
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

    /** If true, disables the internal cookie parser */
    this.cookies_disabled = false
    /** @type {CliArgument} */
    this.__$cookies_disabled = {
      type: 'flag',
      environmentVariable: 'STRATIS_COOKIES_DISABLE',
      default: this.cookies_disabled,
      description: 'If true, disables the internal cookie parser',
    }

    /** The cookies encryption key to use. If not provided then the cookies are not encrypted. */
    this.cookies_key = null
    /** @type {CliArgument} */
    this.__$cookies_key = {
      type: 'named',
      environmentVariable: 'STRATIS_COOKIES_KEY',
      default: this.cookies_key,
      description:
        'The cookies encryption key to use. If not provided then the cookies are not encrypted.',
    }

    /** If exists, disables the stratis user session (cookies). */
    this.session_disabled = false
    /** @type {CliArgument} */
    this.__$session_disabled = {
      type: 'flag',
      environmentVariable: 'STRATIS_SESSION_DISABLED',
      default: this.session_disabled,
      description: 'If exists, disables the stratis user session (cookies).',
    }

    /** The stratis session encryption key. Defaults to the  If not provided then the session will not be encrypted. */
    this.session_key =
      'STRATIS_RANDOM_SESSION_KEY:' + Math.floor(Math.random() * 100000)
    /** @type {CliArgument} */
    this.__$session_key = {
      type: 'named',
      environmentVariable: 'STRATIS_SESSION_KEY',
      default: this.session_key,
      description:
        'The stratis session encryption key. If not provided then the session will not be encrypted.',
      parse: (val) => {
        if (val.trim().length == 0) return null
        return val
      },
    }

    /**
     * @type {(req:Request,res:Response,next:NextFunction)=>any} The cookie session provider override.
     * Defaults to cookie-session.
     */
    this.session_provider = null

    /**
     * The session provider options. Defaults core options, but may vary depending on
     * the provider type. See storage providers in [repo]/utils/session/storage
     * @type {StratisSessionStorageProviderOptions}*/
    this.session_storage_options = Object.assign(
      {},
      DEFAULT_SESSION_STORAGE_PROVIDER_OPTIONS
    )

    /** @type {CliArgument} */
    this.__$session_storage_options = {
      type: 'named',
      environmentVariable: 'STRATIS_SESSION_STORAGE_OPTIONS',
      default: this.session_storage_options,
      description:
        'The session provider options. Defaults to core options, ' +
        'but may vary depending on the provider type. ' +
        'See storage providers in [repo]/utils/session/storage',
      parse: (val) => {
        return Object.assign(
          {},
          this.session_storage_options ||
            DEFAULT_SESSION_STORAGE_PROVIDER_OPTIONS,
          val == null ? {} : JSON.parse(val)
        )
      },
    }

    /** The session storage type to use. */
    /** @type {StratisSessionStorageProviderName} */
    this.session_provider_type = 'cookie'

    /** @type {CliArgument} */
    this.__$session_storage_type = {
      type: 'named',
      environmentVariable: 'STRATIS_SESSION_STORAGE_TYPE',
      default: this.session_provider_type,
      description:
        'The session storage type to use. May be one of ' +
        Object.keys(StratisSessionStorageProvidersByType),
      parse: (val) => {
        if (val instanceof StratisSessionStorageProvider) return val
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
    this.log_level = null

    /** @type {CliArgument} The log level, DEBUG will show all requests*/
    this.__$log_level = {
      type: 'named',
      default: this.log_level,
      environmentVariable: 'STRATIS_LOG_LEVEL',
      description: 'The log level, DEBUG will show all requests',
    }

    /** The path to a stratis initialization js file. Must return method (stratis, express_app, stratis_cli)=>{}.*/
    this.init_script_path = null

    /** @type {CliArgument} */
    this.__$init_script_path = {
      type: 'named',
      environmentVariable: 'STRATIS_INIT_SCRIPT_PATH',
      default: this.init_script_path,
      description: `The path to a stratis initialization js file. Must return method (StratisCli)=>{}`,
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

    /** Configuration (json) for oauth2. See configuration. See README for more. */
    this.oauth2_config = null
    /** @type {CliArgument} */
    this.__$oauth2_config = {
      type: 'named',
      environmentVariable: 'STRATIS_OAUTH2_CONFIG',
      default: this.oauth2_config,
      description: 'Configuration (json) for oauth2. See README for more.',
    }

    /** Configuration file path (json) for oauth2. See README for more. */
    this.oauth2_config_path = null
    /** @type {CliArgument} */
    this.__$oauth2_config_path = {
      type: 'named',
      environmentVariable: 'STRATIS_OAUTH2_CONFIG_PATH',
      default: this.oauth2_config_path,
      description:
        'Configuration file path (json) for oauth2. See README for more.',
    }

    this._api = null
    this._app = express()

    this._initialized = false
  }

  /**
   * If true, the api has been initialized.
   */
  get initialized() {
    return this._initialized
  }

  get logger() {
    return this.api.logger || console
  }

  get api() {
    if (this._api == null) {
      this._api = new Stratis({
        template_options: {
          add_require: this.ejs_add_require,
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
    const redirect_to = get_express_request_url(req)
    redirect_to.protocol = 'https'
    redirect_to.port = `${this.https_port}`

    // not https. redirect.
    return res.redirect(redirect_to.href)
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

      await init_stratis(this)
    }
  }

  async _get_oauth2_provider(logger) {
    const has_oauth2 =
      this.oauth2_config != null || this.oauth2_config_path != null

    if (!has_oauth2) return null

    let oauth2_merge_config = []
    try {
      if (this.oauth2_config_path != null) {
        assert(
          fs.existsSync(this.oauth2_config_path),
          'OAuth2 config file not found @ ' + this.oauth2_config_path
        )

        oauth2_merge_config.push(
          JSON.parse(await fs.readFile(this.oauth2_config_path, 'utf-8'))
        )
      }

      if (this.oauth2_config != null)
        oauth2_merge_config.push(
          typeof this.oauth2_config == 'string'
            ? JSON.parse(this.oauth2_config)
            : this.oauth2_config
        )
    } catch (err) {
      throw new Error('Could not parse oauth2_config', err)
    }

    /** @type {StratisOAuth2ProviderOptions} */
    const options = Object.assign({}, ...oauth2_merge_config)
    options.logger =
      typeof options.logger == 'object' && options.logger.info != null
        ? options.logger
        : logger || console
    return new StratisOAuth2Provider(options)
  }

  _enable_https_redirect() {
    this.logger.info(
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

      this.logger.debug(
        `Redirect ${req.protocol} to https ` + req.originalUrl,
        '~>'.cyan
      )

      this.redirect_to_https(req, res, next)
    })

    this.logger.info('Enabled http/https redirection')
  }

  /**
   * @param {StratisSessionStorageProviderOptions & StratisSessionProviderOptions} options
   */
  _create_session_provider(options = null) {
    options = Object.assign(
      {
        name: 'stratis:session',
        encryption_key: this.session_key,
        logger: this.logger,
      },
      this.session_storage_options || {},
      options || {}
    )

    options.storage_provider =
      options.storage_provider ||
      new (from_storage_type_name(this.session_provider_type))(options)

    const session_provider = new StratisSessionProvider(options)

    return (req, res, next) => session_provider.middleware(req, res, next)
  }

  _enable_cookies_parser() {
    this.app.use(
      cookie_parser(this.cookies_key, {
        decode: this.cookies_key != null,
      })
    )
    this.logger.info('Enabled cookie parser')
  }

  _enable_sessions() {
    assert(
      this.cookies_disabled != true,
      'Cannot enable cookie sessions without enabling cookies'
    )

    this.session_provider =
      this.session_provider || this._create_session_provider()

    this.app.use(async (req, res, next) => {
      return this.session_provider(req, res, next)
    })

    if (this.session_key == null) {
      this.logger.warn(
        'Session enabled but no session_key (encryption) was provided. Session state cookie is insecure!'
      )
    } else {
      this.logger.info('Enabled cookie session state')
    }
  }

  async _enable_security_provider() {
    const security_provider = await this._get_oauth2_provider(this.logger)

    if (security_provider == null) return

    this.api.middleware_options.authenticate =
      security_provider.auth_middleware()

    // binding the provider
    this.app.use((req, res, next) => {
      req.stratis_security_provider = security_provider
      next()
    })

    // set the login path
    security_provider.bind_services(this.app)
    security_provider.bind_stratis_api(this.api)

    this.logger.info('Enabled OAuth2 security provider')

    return security_provider
  }

  async show_version() {
    let version_file_options = [
      path.resolve(path.join(__dirname, '..', 'version')),
      path.resolve(path.join(__dirname, '..', 'package.json')),
      path.resolve(path.join(__dirname, 'package.json')),
    ]

    let ver = null

    for (let package_path of version_file_options) {
      if (fs.existsSync(package_path)) {
        if (package_path.endsWith('.json')) ver = require(package_path).version
        else ver = fs.readFileSync(package_path)
      }
    }

    console.log(ver || '[Unknown]')
  }

  /**
   * Initialize the stratis api (configure the service)
   * @param {StratisMiddlewareOptions} options
   */
  async initialize(options = {}) {
    this._initialized = true
    this.api.logging_options.return_stack_trace_to_client = this.show_app_errors

    // composing the default middleware options.
    this.api.middleware_options = Object.assign(
      {},
      this.api.middleware_options || {},
      {
        serve_path: this.serve_path,
        next_on_private: false,
        next_on_not_found: true,
      }
    )

    if (typeof this.default_redirect != 'string') {
      const redirect_basepath = fs.existsSync(
        path.join(this.serve_path, 'public')
      )
        ? 'public'
        : ''

      for (const fname of ['index.html', 'index.htm', 'api']) {
        if (
          fs.existsSync(path.join(this.serve_path, redirect_basepath, fname))
        ) {
          this.default_redirect = path.join(redirect_basepath, fname)
          break
        }
      }
    }

    let stat = null
    try {
      stat = await fs.promises.stat(this.serve_path)
    } catch (err) {}

    assert(
      this.serve_path != null && stat != null && stat.isDirectory(),
      `The path ${this.serve_path} could not be found or is not a directory.`
    )

    // Default logging
    this.app.use((req, res, next) => {
      this.logger.debug(`${req.originalUrl}`, '->'.cyan)
      next()
    })

    if (this.enable_https) this._enable_https_redirect()
    if (!this.cookies_disabled) this._enable_cookies_parser()
    if (!this.session_disabled) this._enable_sessions()

    await this._enable_security_provider()

    this.api.server(options, this.app)
  }

  /**
   * Call to run the stratis cli.
   * @param {Cli} cli The command line interface.
   * @param {bool} listen_sync If true, await listen to the port.
   */
  async run(cli = null, listen_sync = false) {
    cli = cli || new Cli({ name: 'stratis' })
    cli.logger.level = this.log_level || cli.logger.level
    this.api.logging_options.logger = cli.logger

    if (this.version) return await this.show_version()

    // will only print in debug mode.
    this.logger.debug('Debug mode ACTIVE'.yellow)

    // updating configuration.

    /** @type {CookieSessionOptions} */
    let run_session_storage_options = {
      secure: this.enable_https,
      signed: this.session_key != null,
      keys: this.session_key == null ? null : [this.session_key],
    }

    this.session_storage_options = Object.assign(
      this.session_storage_options || {},
      run_session_storage_options
    )

    // calling startup script
    await this.invoke_initialization_scripts(this.logger || console)

    // check call the server command (i.e. was initialized)
    if (!this.initialized) await this.initialize()

    if (this.default_redirect != null) {
      /**
       * check call redirect if needed.
       * @param {Request} req
       * @param {Response} res
       * @param {NextFunction} next
       * @returns
       */
      const redirect = (req, res, next) => {
        if (res.writableEnded) return next()
        const redirect_to = concat_url_args(this.default_redirect, req.query)
        return res.redirect(redirect_to)
      }

      if (this.redirect_all_unknown) this.app.use(redirect)
      else this.app.all('/', redirect)
      this.logger.info(
        `Redirecting ${
          this.redirect_all_unknown ? 'all missing paths (not found)' : '/'
        } to ${this.default_redirect}`
      )
    }

    // handle errors.
    this.app.use(
      async (err, req, res, next) =>
        await this.api.handle_errors(err, req, res, next)
    )

    this.logger.info('Initialized stratis service middleware and routes')

    if (this.use_stratis_listeners) await this._listen(cli, listen_sync)
  }
}

function create_statis_cli() {
  const stratis_cli_config = new StratisCli()
  const cli = new Cli({ name: 'stratis' })

  cli.default(
    async (args) => {
      await stratis_cli_config.run(cli)
    },
    stratis_cli_config,
    {
      description:
        "A simple web template engine for fast api's and websites. " +
        'Very low memory and cpu print that fits docker and kubernetes pods, ' +
        'or can run parallel to your application.',
    }
  )

  return {
    cli,
    stratis_cli_config,
  }
}

module.exports = {
  create_statis_cli,
  StratisCli,
}

if (require.main == module) {
  const { cli } = create_statis_cli()

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
