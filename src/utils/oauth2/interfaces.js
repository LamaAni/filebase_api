/**
 * @typedef {'session'|'token'} StratisOAuth2ProviderLoginResult
 * @typedef {'login'|'logout'|'decrypt'|'token'|'authorize_response'} StratisOAuth2ProviderServiceType
 */

/**
 * @typedef {Object} StratisOAuth2ProviderAuthorizeState
 * @property {number} created_at // the time where the state was create (UTC milliseconds)
 * @property {string} redirect_uri The successful login redirect uri.
 * @property {boolean|string} token_as_link If true ('true') returns a token login as link.
 * @property {StratisOAuth2ProviderLoginResult} login_result What is the login result.
 **/

/**
 * @typedef {Object} StratisOAuth2ProviderSessionParams
 * @property {string} access_token
 * @property {string} token_type
 * @property {string} scope
 * @property {string} refresh_token
 * @property {number} authenticated The timestamp of creation (ms since epoc, utc)
 * @property {{}} token_info
 * @property {{}} token_response
 */

module.exports = {}
