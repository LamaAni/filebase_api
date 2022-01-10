const fs = require('fs')
const path = require('path')

/**F
 * @typedef {import('@lamaani/stratis').StratisApiHandler} StratisApiHandler
 */

/** @type {StratisApiHandler} */
async function print_something({ to_print = '[undefined]' }, context) {
  return `something ${to_print}`
}

/**
 * Executes a request to another server on serverside.
 * @type {StratisApiHandler}
 * */
async function get_page({ url = 'https://www.google.com' }, context) {
  return await (await context.requests.get(url)).to_string()
}

/**
 * Example for uploading a file. The command should be sent with content-type='binary'.
 * @type {StratisApiHandler}
 * */
async function upload_file({ fname = null }, context) {
  fname = fname || 'test_write_upload.txt'
  const fpath = path.join('/tmp', fname)
  const encoding = context.req.headers['content-encoding'] || 'utf-8'

  const ws = fs.createWriteStream(fpath, encoding)

  context.req.pipe(ws)

  await new Promise((res, rej) => {
    context.req.on('end', () => {
      res()
    })
    context.req.on('error', (err) => {
      rej(err)
    })
  })

  return await fs.promises.readFile(fpath, encoding)
}

module.exports = {
  a_value: {
    some: 'value',
  },
  print_something,
  get_page,
  upload_file,
}
