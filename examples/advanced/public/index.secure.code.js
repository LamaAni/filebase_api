/**
 * @typedef {import('../../../src/index').StratisApiObject} StratisApiObject
 */
 module.exports = {
  /** @type {StratisApiObject} */
  print_something: async (args, context) => {
    return 'something secure by name'
  },
  /** @type {StratisApiObject} */
  a_value: {
    some: 'value',
  },
}
