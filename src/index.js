const express = require('express')
const { Stratis } = require('./webserver/stratis')
const { StratisRequest } = require('./webserver/requests')
const { JsonCompatible, StratisApiHandler } = require('./webserver/interfaces')
const { StratisPageCallContext } = require('./webserver/pages')
const { StratisCli, create_statis_cli } = require('./cli')
const {
  StratisOAuth2Provider,
  StratisOAuth2ProviderSession,
} = require('./utils/oauth2')
const websocket = require('./utils/websocket')
const { StratisRequestsClient } = require('./utils/requests')

/**
 * @typedef {import('@lamaani/infer').Cli} Cli
 * @typedef {import('@lamaani/infer').Logger} CliLogger
 */

/**
 * @typedef {import('./webserver/interfaces').StratisExpressRequest} StratisExpressRequest
 * @typedef {import('./webserver/interfaces').StratisExpressResponse} StratisExpressResponse
 */

/**
 * @typedef {import('./webserver/stratis').StratisOptions} StratisOptions
 * @typedef {import('./webserver/stratis').StratisEJSOptions} StratisEJSOptions
 * @typedef {import('./webserver/stratis').StratisMiddlewareOptions} StratisMiddlewareOptions
 * @typedef {import('./webserver/stratis').StratisClientSideApiOptions} StratisClientSideApiOptions
 * @typedef {import('./webserver/stratis').StratisCodeModuleBankOptions} StratisCodeModuleBankOptions
 * @typedef {import('./webserver/stratis').StratisEJSTemplateBankOptions} StratisEJSTemplateBankOptions
 * */

/**
 * @typedef {import('./utils/requests').StratisRequestOptions} StratisRequestOptions
 */

/**
 * @typedef {import('./utils/oauth2.js').StratisOAuth2ProviderOptions} StratisOAuth2ProviderOptions
 */

module.exports = {
  create_statis_cli,
  websocket,
  JsonCompatible,
  StratisApiHandler,
  Stratis,
  StratisCli,
  StratisRequest,
  StratisPageCallContext,
  StratisOAuth2Provider,
  StratisRequestsClient,
  StratisOAuth2ProviderSession,
}
