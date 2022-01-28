/**
 * @typedef {'session'|'token'} StratisOAuth2ProviderLoginResult
 * @typedef {'echo'|'login'|'logout'|'decrypt'|'token'|'authorize_response'|'validate'|'introspect'|'authorize_session'} StratisOAuth2ProviderServiceType
 */

/**
 * @typedef {Object} StratisOAuth2ProviderAuthorizeState
 * @property {number} created_at // the time where the state was create (UTC milliseconds)
 * @property {string} redirect_uri The successful login redirect uri.
 * @property {boolean|string} token_as_link If true ('true') returns a token login as link.
 * @property {StratisOAuth2ProviderLoginResult} login_result What is the login result.
 **/

module.exports = {}
