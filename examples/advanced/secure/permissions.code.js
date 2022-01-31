/**
 * @typedef {import('../../../src/index').StratisApiHandler} StratisApiHandler
 */
module.exports = {
  /** @type {StratisApiHandler} */
  async check_if_permitted({ group = '[unknown]' }, context) {
    context.assert_permitted(
      await context.is_permitted(group),
      'Test permission denied for group ' + group
    )
    return true
  },
  /** @type {StratisApiHandler} */
  async get_user_token({} = {}, context) {
    if (context.req.stratis_oauth2_session == null) return null
    return context.req.stratis_oauth2_session.access_token
  },
}
