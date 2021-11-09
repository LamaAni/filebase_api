const {
  AuthorizationCode,
  ClientCredentials,
  ResourceOwnerPassword,
} = require('simple-oauth2')

const {
  assert,
  assert_non_empty_string,
  is_non_empty_string,
  is_valid_url,
} = require('../common')

/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 */

/**
 * @typedef {Object} StratisOAuth2ProviderOptions
 * @property {string} authentication_host The hostname for the authentication. e.g. https://accounts.google.com/o/oauth2/v2/auth
 * @property {string|URL} token_url The token service url, e.g. https://accounts.google.com/o/oauth2/v2/auth
 * @property {string|URL} authorize_url The authorize service url, defaults to token_url
 * @property {string} authorize_path The path for authorization, overrides authorize_url path
 * @property {string} revoke_path The path for revoke, overrides token_url path
 * @property {string} token_path The path for a token, overrides token_url path
 * @property {string|URL} redirect_url The server response redirect url. If null takes the current request url as redirect url.
 * @property {'json' |'form'} body_format The request body format.
 * @property {"header" | "body"} authorization_method
 * @property {[string]} scope the scope to use.
 */

class StratisOAuth2Provider {
  /** @param {StratisOAuth2ProviderOptions} param0 */
  constructor({
    client_id,
    client_secret,
    token_url,
    authorize_url = null,
    authorize_path = null,
    revoke_path = null,
    token_path = null,
    redirect_url = null,
    body_format = 'json',
    authorization_method = 'header',
    scope = ['email'],
  } = {}) {
    assert_non_empty_string(client_id, 'client_id must be a non empty string')
    assert_non_empty_string(
      client_secret,
      'client_secret must be a non empty string'
    )

    assert_non_empty_string(scope, 'scope must be a non empty string')
    assert_non_empty_string(
      body_format,
      'body_format must be a non empty string'
    )
    assert_non_empty_string(
      authorization_method,
      'authorization_method must be a non empty string'
    )

    assert(token_url, 'authorize_url must be a URL or a non empty string')
    assert(
      authorize_url == null || is_valid_url(authorize_url),
      'authorize_url must be null, a URL or a non empty string'
    )
    assert(
      redirect_url == null || is_valid_url(redirect_url),
      'authorize_url must be null, a URL or a non empty string'
    )

    this.client_id = client_id
    this.client_secret = client_secret

    this.token_url = new URL(token_url)
    this.authorize_url = authorize_url == null ? null : new URL(authorize_url)
    this.body_format = body_format
    this.authorization_method = authorization_method

    this.authorize_path = authorize_path || this.authorize_url.pathname
    this.revoke_path = revoke_path || this.authorize_url.pathname
    this.token_path = token_path || this.authorize_url.pathname
    this.redirect_url = redirect_url

    this.scope = scope
  }

  /**
   * @returns {(Request,Response, NextFunction)=>{}} Auth middleware
   */
  middleware() {
    // parsing hosts and paths
    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    const intercept = async (req, res, next) => {
      const token_url = this.token_url
      const authorize_url = this.authorize_url || this.token_url
      const request_url = new URL(req.originalUrl)

      const client = new AuthorizationCode({
        options: {
          bodyFormat: this.body_format,
          authorizationMethod: this.authorization_method,
        },
        client: {
          id: this.client_id,
          secret: this.client_secret,
        },
        auth: {
          tokenHost: token_url.host,
          authorizeHost: authorize_url.host,
          // paths
          tokenPath: this.token_path || token_url.pathname,
          revokePath: this.revoke_path || token_url.pathname,
          authorizePath: this.authorize_path || authorize_url.pathname,
        },
      })

      const is_authentication_response = 
    }

    return intercept
  }
}

module.exports = {
  StratisOAuth2Provider,
}
