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

const { STRATIS_CLIENTSIDE_SOURCE } = require('./consts.js')

/**
 * @typedef {import('./events').StratisEventListenRegister} StratisEventListenRegister
 * @typedef {import('./events').StratisEventEmitter} StratisEventEmitter
 */

/**
 * Interface for Stratis options.
 * @typedef {Object} StratisOptions
 * @property {Object<string,(...args, req:Request, res: Response, next:NextFunction)=>void>} api_methods A collection
 * of core api methods to expose.
 * @property {Object<string, any>} ejs_environment A collection to render time objects to expose.
 * @property {boolean} ejs_environment_require IF true, adds the require method to the ejs call. Required
 * Files can only be loaded in main (not imported template files), and are loaded only once.
 * @property {string} codefile_extention The file extension (without starting .) for recognizing code files.
 * @property {console| {}} logger The logger to use, must have logging methods (info, warn, error ...)
 * @property {boolean} log_errors_to_console Auto log all errors to console.
 * @property {integer} cache_check_minimal_interval The minimal interval for cache checking [ms]
 * @property {integer} cache_clean_interval The minimal interval for cache cleaning [ms]
 * @property {integer} cache_max_lifetime The maximal cache lifetime [ms]
 * @property {integer} client_request_timeout The client side request timeout [ms]
 * @property {ejs.Options} ejs_options The ejs options.
 * @property {(filepath)=>boolean} access_filter If true, then allow the file to be accessed from the web. Defaults
 * @property {boolean} show_application_errors If true, prints the application errors to the http 500 response.
 * To be used for debug, may expose sensitive information.
 */

class Stratis extends events.EventEmitter {
  /**
   * Creates a file api handler that can be used to generate
   * the file api.
   * @param {StratisOptions} param0
   */
  constructor({
    template_extensions = [
      '.html',
      '.htm',
      '.xhtml',
      '.js',
      '.css',
      '.api.yaml',
      '.api.json',
    ],
    api_methods = {},
    codefile_extention = 'code.js',
    show_application_errors = false,

    // ejs templating
    ejs_options = {},
    ejs_environment = {},
    ejs_environment_require = true,

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

    this.logger = logger || console
    this.codefile_extention = codefile_extention
    this.cache_check_minimal_interval = cache_check_minimal_interval
    this.cache_clean_interval = cache_clean_interval
    this.cache_max_lifetime = cache_max_lifetime
    this.client_request_timeout = client_request_timeout || 1000
    this.template_extensions = template_extensions
    this.access_filter = access_filter
    this.next_handler_on_forbidden = next_handler_on_forbidden
    this.ejs_environment_require = ejs_environment_require
    this.show_application_errors = show_application_errors
  }

  /**
   * Creates an express middleware that serves requests.
   * @param {string} serve_path The path to server
   */
  middleware(serve_path) {
    if (!fs.existsSync(serve_path))
      throw new Error(`Stratis search path ${serve_path} dose not exist`)

    const src_stat = fs.statSync(serve_path)

    assert(
      src_stat.isDirectory(),
      Error(`Stratis search path ${serve_path} must point to a directory`)
    )
  }
}
