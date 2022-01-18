/**
 * @typedef {import('./oauth2/interfaces').StratisOAuth2ProviderServiceType} StratisOAuth2ProviderServiceType
 * @typedef {import('./oauth2/interfaces').StratisOAuth2ProviderAuthorizeState} StratisOAuth2ProviderAuthorizeState
 * @typedef {import('./oauth2/interfaces').StratisOAuth2ProviderAuthorizeState} StratisOAuth2ProviderAuthorizeState
 *
 * @typedef {import('./oauth2/provider').StratisOAuth2ProviderOptions} StratisOAuth2ProviderOptions
 * @typedef {import('./oauth2/session').StratisOAuth2ProviderSessionParams} StratisOAuth2ProviderSessionParams
 * @typedef {import('./oauth2/requests').StratisOAuth2RequestsClientOptions} StratisOAuth2RequestsClientOptions
 */

module.exports = {
  ...require('./oauth2/provider'),
  ...require('./oauth2/interfaces'),
  ...require('./oauth2/session'),
  ...require('./oauth2/requests'),
}
