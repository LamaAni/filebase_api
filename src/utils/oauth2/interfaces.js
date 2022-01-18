/**
 * @typedef {'session'|'oidc_token'|'oidc_token_decrypt_url'} StratisOAuth2ProviderLoginResult
 * @typedef {'login'|'logout'|'decrypt'|'token'|'authorize_response'} StratisOAuth2ProviderServiceType
 */

/**
 * @typedef {Object} StratisOAuth2ProviderAuthorizeState
 * @property {number} created_at
 * @property {string} redirect_uri
 * @property {StratisOAuth2ProviderLoginResult} login_result
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
