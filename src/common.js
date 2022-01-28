const fs = require('fs')
const crypto = require('crypto')

async function sleep(ms) {
  assert(typeof ms == 'number')
  await new Promise((resolve) => {
    setTimeout(() => resolve(), Math.round(ms))
  })
}

function assert(condition, ...data) {
  if (condition != true)
    throw data.length == 1 && data[0] instanceof Error
      ? data[0]
      : new Error(...data)
  return true
}

function assert_non_empty_string(value, ...data) {
  return assert(is_non_empty_string(value), ...data)
}

function assert_non_empty_string_or_null(value, ...data) {
  if (value == null) return true
  return assert(is_non_empty_string(value), ...data)
}

function is_non_empty_string(value) {
  return typeof value == 'string' && value.trim().length > 0
}

function is_valid_url(value) {
  if (value instanceof URL) return true
  if (!is_non_empty_string(value)) return false
  try {
    value = new URL(value)
  } catch (err) {
    return false
  }
  return true
}

/**
 * @param {import('express/index').Request} req
 */
function get_express_request_url(req) {
  const full_hostname = req.get('host')
  let protocol = req.protocol
  protocol = protocol.trim().endsWith(':')
    ? protocol.trim()
    : protocol.trim() + ':'
  return new URL(`${protocol}//${full_hostname}${req.originalUrl}`)
}

async function path_stat(path) {
  try {
    if (path.startsWith('/snapshot') || path.startsWith('c:\\snapshot'))
      // when using snapshot drive, the promise fails..
      return fs.statSync(path)

    return await fs.promises.stat(path)
  } catch (err) {
    return null
  }
}

async function path_exists(
  path,
  { allow_directory = true, allow_file = true } = {}
) {
  let stat = await path_stat(path)
  if (stat == null) return false
  if (allow_directory && stat.isDirectory()) return true
  if (allow_file && stat.isFile()) return true
  return false
}

function deep_merge_objects(target, ...to_merge) {
  // Iterate through `source` properties and if an `Object` set property to merge of `target` and `source` properties
  for (const source of to_merge) {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object)
        Object.assign(source[key], deep_merge_objects(target[key], source[key]))
    }

    // Join `target` and modified `source`
    Object.assign(target || {}, source)
  }
  return target
}

/**
 * Call a method with timeout.
 * @param {()=>any} method The method to invoke (can be async)
 * @param {number} timeout The timeout
 * @param {Error} timeout_error The timeout error.
 */
async function with_timeout(method, timeout, timeout_error) {
  assert(
    typeof timeout == 'number' && timeout > 0,
    'timeout muse be a number larger than zero'
  )

  return await new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => {
      reject(timeout_error || 'timeout ' + timeout)
    }, Math.ceil(timeout))

    ;(async () => {
      try {
        const rslt = await method()
        clearTimeout(timeout_id)
        resolve(rslt)
      } catch (err) {
        clearTimeout(timeout_id)
        reject(err)
      }
    })()
  })
}

function milliseconds_utc_since_epoc() {
  return Date.parse(new Date().toUTCString())
}

/**
 * Returns the value from a . or [] seperated path.
 * @param {{}} o The object
 * @param {string|[string|number]} path
 */
function value_from_object_path(o, path) {
  if (typeof path == 'string') {
    path = path.replace(/([^.])\[/g, '$1.[')
    path = path
      .split('.')
      .filter((pk) => pk.trim().length > 0)
      .map((path_key) => {
        if (path_key.startsWith('[')) {
          path_key = path_key.substr(1, path_key.length - 2)
          try {
            path_key = parseInt(path_key)
          } catch (err) {
            path_key = -1
          }
        }
        return path_key
      })
  }
  assert(path.length > 0, 'Invalid or empty path')
  try {
    o = o[path[0]]
  } catch (err) {
    return null
  }
  path = path.slice(1)
  if (path.length == 0) return o
  return value_from_object_path(o, path)
}

function escape_regex(val) {
  return val.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
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

function create_uuid() {
  const S4 = function () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1)
  }
  return (
    S4() +
    S4() +
    '-' +
    S4() +
    '-' +
    S4() +
    '-' +
    S4() +
    '-' +
    S4() +
    S4() +
    S4()
  )
}

/**
 *
 * @param {string} path
 */
function remove_path_folder_ender(path) {
  if (path.endsWith('/')) return path.substring(0, path.length - 1)
  return path
}

/**
 * @param {Object} obj Filter null from this object.
 */
function filter_null(obj) {
  assert(typeof obj == 'object')
  for (let e of Object.entries(obj)) {
    if (e[1] == null) {
      delete obj[e[0]]
    }
  }
  return obj
}

class StringEncryptor {
  /**
   * @param {string|Buffer} encryptionKey
   */
  constructor(encryptionKey) {
    this.algorithm = 'aes-192-cbc'
    this.key = crypto.scryptSync(encryptionKey, 'salt', 24)
    this.seperator = '-'
  }

  encrypt(clearText) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv)
    const encrypted = cipher.update(clearText, 'utf8', 'base64')
    const final = cipher.final('base64')

    return [iv.toString('base64'), encrypted + final].join(this.seperator)
  }

  decrypt(encryptedText) {
    const [iv, encrypted] = encryptedText.split(this.seperator)
    if (!iv) throw new Error('IV not found')
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'base64')
    )
    const val = decipher.update(encrypted, 'base64', 'utf8')
    const final = decipher.final('utf8')
    return val + final
  }
}

function encrypt_string(val, key) {
  return new StringEncryptor(key).encrypt(val)
}

function decrypt_string(val, key) {
  return new StringEncryptor(key).decrypt(val)
}

function to_base64(val, encoding = 'utf8') {
  return Buffer.from(val, encoding).toString('base64')
}

function from_base64(val, encoding = 'utf8') {
  Buffer.from(val, 'base64').toString(encoding)
}

module.exports = {
  /**
   * @param {boolean} condition
   * @param  {...any} data The data or errors to throw.
   */
  assert,
  sleep,
  assert_non_empty_string,
  assert_non_empty_string_or_null,
  is_non_empty_string,
  is_valid_url,
  path_exists,
  path_stat,
  with_timeout,
  deep_merge_objects,
  get_express_request_url,
  milliseconds_utc_since_epoc,
  value_from_object_path,
  create_uuid,
  escape_regex,
  remove_path_folder_ender,
  encrypt_string,
  decrypt_string,
  to_base64,
  from_base64,
  filter_null,
  concat_url_args,
  StringEncryptor,
}

if (require.main == module) {
  console.log(concat_url_args('https://nope.com/lama?a=2', { b: 22 }))
  console.log(concat_url_args('lama?a=2', { b: 22 }))
}
