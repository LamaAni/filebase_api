/**
 * @typedef {import('../../../src/index').StratisApiHandler} StratisApiHandler
 */
 module.exports = {
  /** @type {StratisApiHandler} */
  print_something: async (args, context) => {
    return 'something secure by name'
  },
  /** @type {StratisApiHandler} */
  a_value: {
    some: 'value',
  },
}
