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

module.exports = {
  assert: (condition, ...data) => {
    if (condition != true) throw Error(...data)
  },
  path_exists,
  path_stat,
}
