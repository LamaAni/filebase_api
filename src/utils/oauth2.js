/**
 * @typedef {import('./oauth2/interfaces').StratisOAuth2ProviderServiceType} StratisOAuth2ProviderServiceType
 * @typedef {import('./oauth2/interfaces').StratisOAuth2ProviderAuthorizeState} StratisOAuth2ProviderAuthorizeState
 * @typedef {import('./oauth2/interfaces').StratisOAuth2ProviderAuthorizeState} StratisOAuth2ProviderAuthorizeState
 *
 * @typedef {import('./oauth2/provider').StratisOAuth2ProviderOptions} StratisOAuth2ProviderOptions
 * @typedef {import('./oauth2/session').StratisOAuth2ProviderSessionData} StratisOAuth2ProviderSessionData
 * @typedef {import('./oauth2/session').StratisOAuth2Provider} StratisOAuth2Provider
 * @typedef {import('./oauth2/session').StratisOAuth2ProviderSession} StratisOAuth2ProviderSession
 * @typedef {import('./oauth2/requests').StratisOAuth2RequestsClientOptions} StratisOAuth2RequestsClientOptions
 */

module.exports = {
  ...require('./oauth2/provider'),
  ...require('./oauth2/interfaces'),
  ...require('./oauth2/session'),
  ...require('./oauth2/requests'),
}
