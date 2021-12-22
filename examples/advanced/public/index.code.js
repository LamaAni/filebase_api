/**
 * @typedef {import('../../../src/index').StratisApiObject} StratisApiObject
 */
module.exports = {
  /** @type {StratisApiObject} */
  print_something: async ({ to_print = '[undefined]' }, context) => {
    return `something ${to_print}`
  },
  /** @type {StratisApiObject} */
  a_value: {
    some: 'value',
  },
}
