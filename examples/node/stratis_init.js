/**
 * @typedef {import('@lamaani/infer').Cli} StratisCli
 * @typedef {import('@lamaani/stratis').Stratis} Stratis
 * @typedef {import('express').Express} Express
 */

/**
 * @param {Stratis} stratis
 * @param {Express} app
 * @param {StratisCli} cli
 */
module.exports = (stratis, app, cli) => {
  cli.logger.info('Before stratis initialization (middleware)')
  stratis.init_service()
  cli.logger.info('After stratis initialization (middleware)')
}
