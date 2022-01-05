/**
 * @typedef {import('../../../src/index').StratisApiHandler} StratisApiHandler
 */
module.exports = {
  /** @type {StratisApiHandler} */
  view_action: ({}, context) => {
    return 'from view action'
  },
}
