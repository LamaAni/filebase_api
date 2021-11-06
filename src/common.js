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

module.exports = {
  assert: (condition, ...data) => {
    if (condition != true) throw newError(...data)
  },
  path_exists,
  path_stat,
  deep_merge_objects,
}
