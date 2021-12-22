/**
 * @typedef {import('../../../src/index').StratisApiObject} StratisApiObject
 */
module.exports = {
  /** @type {StratisApiObject} */
  async check_if_permitted({ group = '[unknown]' }, context) {
    context.assert_permitted(
      await context.is_permitted(group),
      'Test permission denied for group ' + group
    )
    return true
  },
  /** @type {StratisApiObject} */
  async get_user_access_token({}, context) {
    const user_info = await context.stratis_request.get_user_info()
    return user_info.access_token
  },
}
