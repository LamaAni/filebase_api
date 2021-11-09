const { StratisCli } = require('./cli')
const path = require('path')

const WEBSITE_PATH = path.resolve(
  path.join(__dirname, '..', 'examples', 'advanced')
)

const stratis = new StratisCli()

stratis.serve_path = WEBSITE_PATH
stratis.init_script_path = path.join(__dirname, WEBSITE_PATH, 'startis_init.js')

stratis.run().catch((err) => {
  console.error(err)
  process.exit(err.code || 1)
})
