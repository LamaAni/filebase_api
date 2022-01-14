const { StratisCli } = require('../../src/cli')
const path = require('path')

const serve_path = path.resolve(__dirname)
const stratis = new StratisCli()
stratis.serve_path = serve_path
stratis.init_script_path = path.join(serve_path, 'startis_init.js')
stratis.log_level = 'debug'

module.exports = {
  stratis,
}

if (require.main == module) {
  stratis.run().catch((err) => {
    console.error(err)
    process.exit(err.code || 1)
  })
}
