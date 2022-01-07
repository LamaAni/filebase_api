const bent = require('bent')
const http = require('http')
const https = require('https')
const { assert } = require('../common')
const stream = require('stream')
const { stream_to_buffer, create_content_stream } = require('./streams')

/**
 * @typedef {'string'|'json'|'bytes'|(buffer:Buffer)=>any} StreamDataParser
 * @typedef {import('./streams').StreamDataType} StreamDataType
 */

/**
 * @param {string} encoding The request encoding
 */
function get_stream_content_type(encoding) {
  // determine body type.
  /** @type {StreamDataType} */
  let data_type = 'bytes'
  switch (encoding) {
    case 'gzip':
      data_type = 'gzip'
      encoding = 'utf-8'
      break
    case 'deflate':
      data_type = 'deflate'
      encoding = 'utf-8'
      break
  }
  return data_type
}

/**
 * @typedef {Object} StratisRequestResponseExtensions
 * @property {()=>Buffer} to_buffer
 * @property {(parse:StreamDataParser)=>Promise<any>} to_data
 * @property {(parse:StreamDataParser)=>Promise<Blob>} to_bytes
 * @property {(parse:StreamDataParser)=>Promise<string>} to_string
 * @property {(parse:StreamDataParser)=>Promise<any>} to_json
 *
 * @typedef {StratisRequestResponseExtensions & http.IncomingMessage} StratisRequestResponse
 */

/**
 * @typedef {Object} StratisRequestOptionsExtension
 * @property {Object|string|Buffer|ReadableStream} payload The request payload to send to the remote.
 * @property {boolean} use_pretty_json If true, and the payload is converted to json, use pretty format.
 *
 * @typedef {http.RequestOptions & StratisRequestOptionsExtension} StratisRequestOptions
 */

class StratisRequests {
  /**
   * @param {StratisRequestResponse} response The server response.
   */
  async to_buffer(response) {
    return await stream_to_buffer(response)
  }

  /**
   * @param {StreamDataParser} parse
   * @param {StratisRequestResponse} response The server response.
   */
  async to_data(parse = 'json', response) {
    // const data_type=
    const buffer = await this.to_buffer(response)
    const stream_encoding = response.headers['content-encoding'] || 'utf-8'
    const data_type = get_stream_content_type(stream_encoding)
    const data_encoding = data_type == 'bytes' ? stream_encoding : 'utf-8'

    if (typeof parse == 'function') return await parse(buffer)

    switch (parse) {
      case 'bytes':
        return new Blob(Uint8Array.from(buffer))
      case 'string':
        return buffer.toString(data_encoding)
      case 'json':
        return JSON.parse(buffer.toString(data_encoding))
      default:
        throw new Error('Unknown parse type: ' + parse)
    }
  }
  /**
   * @param {StratisRequestResponse} response The server response.
   */
  async to_json(response) {
    return await this.to_data('json', response)
  }

  /**
   * @param {StratisRequestResponse} response The server response.
   */
  async to_string(response) {
    return await this.to_data('string', response)
  }

  /**
   * @param {StratisRequestResponse} response The server response.
   */
  async to_bytes(response) {
    return await this.to_data('bytes', response)
  }

  /**
   * @param {http.IncomingMessage} response The server response.
   * @returns {StratisRequestResponse} The stratis server response.
   */
  to_stratis_response_object(response) {
    response.to_buffer = () => {
      return this.to_buffer(response)
    }
    response.to_data = (parse) => {
      return this.to_data(parse, response)
    }
    response.to_bytes = () => {
      return this.to_bytes(response)
    }
    response.to_string = () => {
      return this.to_string(response)
    }
    response.to_json = () => {
      return this.to_json(response)
    }
    return response
  }

  /**
   * Send an http/https request.
   * @param {URL|string} url The target url.
   * @param {StratisRequestOptions} options
   * @param {Object|string|Buffer|ReadableStream} data
   * @returns {StratisRequestResponse} The server response
   */
  async request(url, options = {}, data = null) {
    if (!(url instanceof URL)) {
      assert(typeof url == 'string', 'url must be of types string/URL')
      url = new URL(url)
    }

    assert(
      url.protocol == 'http:' || url.protocol == 'https:',
      'this request handler can only send http/https requests'
    )

    const handler = url.protocol == 'http:' ? http : https
    options = Object.assign({}, options)

    /** @type {http.OutgoingHttpHeaders} */
    const base_headers = {}

    if (options.payload != null) {
      if (typeof options.payload == 'string') {
        base_headers['Content-Type'] = 'application/text'
      } else if (options.payload instanceof Buffer) {
        base_headers['Content-Type'] = 'application/octet-stream'
      } else if (typeof options.payload == 'object') {
        options.payload =
          options.use_pretty_json === true
            ? JSON.stringify(options.payload, null, 2)
            : JSON.stringify(options.payload)
        base_headers['Content-Type'] = 'application/json'
      }
      base_headers['Content-Length'] = options.payload.length
    }

    /** @type {http.RequestOptions} */
    options = Object.assign(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || url.protocol == 'http:' ? 80 : 443,
        path: `${url.pathname}${url.search}`,
        protocol: url.protocol,
        timeout: 1000,
      },
      options,
      {
        headers: Object.assign({}, base_headers, options.headers || {}),
      }
    )

    const rsp = await new Promise((resolve, reject) => {
      try {
        const req = handler.request(options, function (res) {
          resolve(res)
        })

        req.on('error', (err) => reject(err))

        if (req.writable && options.payload) {
          req.write(options.payload)
        }
        req.end()
      } catch (err) {
        reject(err)
      }
    })

    return this.to_stratis_response_object(rsp)
  }
}

/**
 * Send an http/https request.
 * @param {URL|string} url The target url.
 * @param {http.RequestOptions} options
 * @returns {StratisRequestResponse} The server response
 */
async function request(url, options) {
  return await new StratisRequests().request(url, options)
}

module.exports = {
  request,
  get_stream_content_type,
  StratisRequests,
}
