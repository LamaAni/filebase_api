const fs = require('fs')
const path = require('path')

/**
 * @typedef {import('../../../src/index').StratisApiHandler} StratisApiHandler
 */
module.exports = {
  /** @type {StratisApiHandler} */
  print_something: async ({ to_print = '[undefined]' }, context) => {
    return `something ${to_print}`
  },
  /** @type {StratisApiHandler} */
  get_page: async ({ url = 'https://google.com' }, context) => {
    const get_string = context.request('GET', 'string')
    context.stratis.logger.info('Sending request to ' + url)
    const rslt = await get_string(url)
    context.stratis.logger.info('Got response from ' + url)
    return rslt
  },
  /** @type {StratisApiHandler} */
  a_value: {
    some: 'value',
  },
  /**
   * Example for uploading a file.
   * This command should be sent with PUT request.
   * @type {StratisApiHandler}
   * */
  async upload_file({ fname = null }, context) {
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
  },
}
