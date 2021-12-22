/**
 * @typedef {import('../../../src/index').StratisApiObject} StratisApiObject
 */
module.exports = {
  /** @type {StratisApiObject} */
  print_something: async (args, context) => {
    return 'something secure by folder name'
  },
  /** @type {StratisApiObject} */
  a_value: {
    some: 'value',
  },
  /** @type {StratisApiObject} */
  async check_if_permitted({ group = '[unknown]' }, context) {
    context.assert_permitted(
      await context.is_permitted(group),
      'Test permission denied'
    )
  },
}
