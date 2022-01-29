/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 */

/**
 * @param {Request} req
 */
function parse_bearer_token(req) {
  const authorization =
    'authorization' in req.headers
      ? (req.headers['authorization'] || '').trim()
      : null

  if (authorization == null) return null

  const auth_barer_regex = /^bearer /gim

  if (!auth_barer_regex.test(authorization)) return null

  return authorization.replace(auth_barer_regex, '').trim()
}

module.exports = {
  parse_bearer_token,
}
