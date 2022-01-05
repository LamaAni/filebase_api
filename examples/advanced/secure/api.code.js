/**
 * @typedef {import('../../../src/index').StratisApiHandler} StratisApiHandler
 */
module.exports = {
  /** @type {StratisApiHandler} */
  print_something: async ({ message = 'lama' }, context) => {
    return `Api call for something secure. message: ${message}`
  },
  /** @type {StratisApiHandler} */
  echo: async (args, context) => {
    return args
  },
  /** @type {StratisApiHandler} */
  a_value: {
    some: 'secure api values',
  },
}
