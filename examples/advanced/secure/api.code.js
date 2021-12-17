/**
 * @typedef {import('../../../src/index').StratisApiObject} StratisApiObject
 */
module.exports = {
  /** @type {StratisApiObject} */
  print_something: async (args, context) => {
    return 'api call for something secure'
  },
  /** @type {StratisApiObject} */
  a_value: {
    some: 'secure api values',
  },
}
