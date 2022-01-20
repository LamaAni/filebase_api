/**
 * @typedef {import('express/index').Request} Request
 * @typedef {import('express/index').Response} Response
 * @typedef {import('express/index').NextFunction} NextFunction
 */

/**
 * @param {Request} req
 */
function parse_barer_token(req) {
  const authorization =
    'authorization' in req.headers
      ? (req.headers['authorization'] || '').trim()
      : null

  if (authorization == null) return null

  const auth_barer_regex = /^bearer /gim

  if (!auth_barer_regex.test(authorization)) return null

  return authorization.replace(auth_barer_regex, '').trim()
}

/**
 * Concat url args into the current url, and returns the new url.
 * @param {URL|string} url
 * @param {{}} args
 */
function concat_url_args(url, args) {
  let is_relative = false
  let org_url = url
  args = args || {}
  try {
    url = new URL(url)
  } catch (err) {
    is_relative = true
    url = new URL(url, 'http://is-relative.com/')
  }

  const params = url.searchParams

  Object.entries(args).forEach((e) => {
    if (e[1] == null) return
    params.set(e[0], e[1])
  })

  if (!is_relative) return url.href

  url = url.pathname + url.search
  if (typeof org_url == 'string' && !org_url.startsWith('/'))
    url = url.startsWith('/') ? url.substring(1) : url

  return url
}

module.exports = {
  parse_barer_token,
  concat_url_args,
}

if (require.main == module) {
  console.log(concat_url_args('https://nope.com/lama?a=2', { b: 22 }))
  console.log(concat_url_args('lama?a=2', { b: 22 }))
}
