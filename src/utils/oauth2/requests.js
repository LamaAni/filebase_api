const path = require('path')
const { StratisRequestsClient } = require('../requests')
const {
  assert,
  assert_non_empty_string,
  is_non_empty_string,
} = require('../../common')

/**
 * @typedef {import('../requests').StratisRequestsClientOptions} StratisRequestsClientOptions
 */

/**
 * @typedef {Object} StratisOAuth2RequestsClientOptionsExtend
 * @property {string} client_id
 * @property {string} client_secret
 * @property {string|URL} service_url  The base service url (the service root)
 * @property {string|URL} token_url  Get token url. Based on service if partial path.
 * @property {string|URL} authorize_url  authorize url. Based on service if partial path.
 * @property {string|URL} introspect_url  introspect url. Based on service if partial path.
 * @property {string|URL} revoke_url  revoke url. Based on service if partial path.
 * @property {[string]} scope List of service scopes
 * @property {console} logger The internal logger.
 *
 * @typedef {StratisRequestsClientOptions & StratisOAuth2RequestsClientOptionsExtend} StratisOAuth2RequestsClientOptions
 */

class StratisOAuth2RequestClient extends StratisRequestsClient {
  /** @param {StratisOAuth2RequestsClientOptions} param0 */
  constructor({
    client_id,
    client_secret,
    service_url,
    token_url = 'token',
    authorize_url = 'authorize',
    introspect_url = 'introspect',
    revoke_url = 'revoke',
    scope = [],
    timeout = 1000 * 10,
    logger = console,
    use_proxies = true,
  } = {}) {
    super({
      use_proxies,
      proxy_agent_options: {
        timeout,
      },
    })

    assert(
      service_url instanceof URL || is_non_empty_string(service_url),
      'You must provide a root service url where .well-known/... can be found.'
    )
    assert_non_empty_string(client_id, 'client_id must be a non empty string')
    assert_non_empty_string(
      client_secret,
      'client_secret must be a non empty string'
    )

    assert(
      scope instanceof Array && scope.every((v) => is_non_empty_string(v)),
      'scope must be a non empty string'
    )

    this.client_id = client_id
    this.client_secret = client_secret

    this.service_url = this.to_url(service_url, false)
    this.token_url = this.to_url(token_url)
    this.authorize_url = this.to_url(authorize_url)
    this.introspect_url = this.to_url(introspect_url)
    this.revoke_url = this.to_url(revoke_url)
    this.scope = scope
    this.logger = logger
  }

  /**
   * @param {string|URL} url The url to validate
   * @param {string|URL} use_service_url_base The service base url
   * @returns {URL}
   */
  to_url(url, use_service_url_base = true) {
    if (url == null) return null
    if (url instanceof URL) return url
    assert(typeof url == 'string', 'Invalid url ' + url)
    if (!use_service_url_base) return new URL(url)

    let base_url = this.service_url.origin
    if (!url.startsWith('/')) base_url += this.service_url.pathname
    if (!base_url.endsWith('/')) base_url += '/'

    return new URL(url, base_url)
  }

  /**
   * Updates and returns the request options for the oauth client.
   * @param {StratisRequestOptions} options
   * @param {boolean} use_proxies If true, attempt to use proxy agent.
   */
  compose_request_options(options = {}, use_proxies = true) {
    /** @type {StratisRequestOptions} */
    const client_options = {}
    client_options.headers = {}
    client_options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    client_options.timeout = this.request_timeout

    return Object.assign({}, client_options, options)
  }

  /**
   * Compose a url from a base url and query arguments
   * @param {string|URL} url The base url to compose from
   * @param {{}} query The query arguments to compose from
   * @param {string|URL} base_url The base url to compose from
   */
  compose_url(url, query = null, base_url = null) {
    if (base_url != null) url = new URL(url, base_url)
    else url = new URL(url)

    query = query || {}
    assert(typeof query == 'object', 'Query must be a dictionary')

    Object.entries(query)
      .filter((entry) => entry[1] != null)
      .forEach((entry) => url.searchParams.set(entry[0], entry[1]))

    return url
  }

  /**
   * Composes an authorize url state.
   * @param {string|URL} redirect_uri The response url
   * @param {string|Object} state The authorize state.
   * @param {'code'} response_type The response type.
   */
  compose_authorize_url(redirect_uri, state, response_type = 'code') {
    return this.compose_url(this.authorize_url, {
      redirect_uri:
        typeof redirect_uri == 'string' ? redirect_uri : redirect_uri.href,
      client_id: this.client_id,
      response_type,
      scope:
        this.scope == null || this.scope.length == 0
          ? null
          : this.scope.join(' '),
      state,
    })
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {{}} token_flow_args A dictionary of token flow args to send.
   * @param {string} grant_type The grant type
   * @returns
   */
  async get_token(grant_type, token_flow_args) {
    const url = this.compose_url(
      this.token_url,
      Object.assign(
        {
          client_id: this.client_id,
          client_secret: this.client_secret,
          scope: this.scope.join(' '),
          grant_type,
        },
        token_flow_args
      )
    )

    return await (
      await this.post_form(
        url,
        this.compose_request_options({
          custom_error_message: `Error while getting token from ${url.origin}${url.pathname}`,
        })
      )
    ).to_json()
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {string} code The get token authorization steps code.
   * @param {string} redirect_uri The redirect url.
   * @returns
   */
  async get_token_from_code(code, redirect_uri) {
    return await this.get_token('authorization_code', {
      code,
      redirect_uri,
    })
  }

  /**
   * Sends a request to the remote service and returns the token.
   * @param {string} refresh_token The get token authorization steps code.
   * @returns
   */
  async get_token_from_refresh_token(refresh_token) {
    return await this.get_token('refresh_token', {
      refresh_token,
    })
  }

  /**
   * Returns the token info using the introspect url. Sends a request to the server.
   * @param {string} token The token to get info about.
   * @param {'access_token'|'refresh_token'|'id_token'} token_type_hint The token type.
   */
  async introspect(token, token_type_hint = 'access_token') {
    const url = this.compose_url(this.introspect_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint,
    })

    return await (
      await this.post_form(
        url,
        this.compose_request_options({
          custom_error_message: `Error while getting token info from ${url.origin}${url.pathname}`,
        })
      )
    ).to_json()
  }

  /**
   * Sends a revoke request for a specific token.
   * @param {string} token The token
   * @param {'access_token'|'refresh_token'|'id_token'} token_type_hint The token type.
   * @returns
   */
  async revoke(token, token_type_hint = 'access_token') {
    const url = this.compose_url(this.revoke_url, {
      client_id: this.client_id,
      client_secret: this.client_secret,
      token,
      token_type_hint,
    })

    return await (
      await this.post_form(
        url,
        this.compose_request_options({
          custom_error_message: `Error while revoking token at ${url.origin}${url.pathname}`,
        })
      )
    ).to_string()
  }
}

module.exports = {
  StratisOAuth2RequestClient,
}
