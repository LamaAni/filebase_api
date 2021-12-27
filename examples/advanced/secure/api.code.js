/**
 * @typedef {import('../../../src/index').StratisApiObject} StratisApiObject
 */
module.exports = {
  /** @type {StratisApiObject} */
  print_something: async ({ message = 'lama' }, context) => {
    return `Api call for something secure. message: ${message}`
  },
  /** @type {StratisApiObject} */
  a_value: {
    some: 'secure api values',
  },
}
