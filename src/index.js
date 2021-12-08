const express = require('express')
const { Stratis } = require('./webserver/stratis')
const { JsonCompatible, StratisApiObject } = require('./webserver/interfaces')
const { StratisPageCallContext } = require('./webserver/pages')
const { StratisCli, create_statis_cli } = require('./cli')
const websocket = require('./utils/websocket')

/**
 * @typedef {import('@lamaani/infer').Cli} Cli
 * @typedef {import('@lamaani/infer').Logger} CliLogger
 */

/**
 * @typedef {import('./webserver/stratis').StratisOptions} StratisOptions
 * @typedef {import('./webserver/stratis').StratisEJSOptions} StratisEJSOptions
 * @typedef {import('./webserver/stratis').StratisMiddlewareOptions} StratisMiddlewareOptions
 * @typedef {import('./webserver/stratis').StratisClientSideApiOptions} StratisClientSideApiOptions
 * @typedef {import('./webserver/stratis').StratisCodeModuleBankOptions} StratisCodeModuleBankOptions
 * @typedef {import('./webserver/stratis').StratisEJSTemplateBankOptions} StratisEJSTemplateBankOptions
 * @typedef {import('./utils/oauth2').StratisOAuth2ProviderOptions} StratisOAuth2ProviderOptions
 */

module.exports = {
  create_statis_cli,
  websocket,
  JsonCompatible,
  StratisApiObject,
  Stratis,
  StratisCli,
  StratisPageCallContext,
}
