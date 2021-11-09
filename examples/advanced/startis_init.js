/**
 * @typedef {import('@lamaani/infer').Cli} StratisCli
 * @typedef {import('@lamaani/stratis').Stratis} Stratis
 * @typedef {import('express').Express} Express
 */

/**
 * @param {import('../../src/index').Stratis} stratis
 * @param {import('express').Express} app
 * @param {import('../../src/index').CliLogger} logger
 */
module.exports = (stratis, app, logger) => {
  logger.info('Before stratis initialization (middleware)')
  stratis.init_service()
  logger.info('After stratis initialization (middleware)')
}
