const fs = require('fs')

async function path_stat(path) {
  try {
    return await fs.promises.stat(path)
  } catch (err) {
    return null
  }
}

async function path_exists(
  path,
  { allow_directory = true, allow_file = true }
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

module.exports = {
  /**
   * @param {boolean} condition
   * @param  {...any} data The data or errors to throw.
   */
  assert: (condition, ...data) => {
    if (condition != true)
      throw data.length == 1 && data[0] instanceof Error
        ? data[0]
        : new Error(...data)
  },
  path_exists,
  path_stat,
  with_timeout,
  deep_merge_objects,
}
