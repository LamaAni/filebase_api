const { StratisCli } = require('./cli')
const path = require('path')

const WEBSITE_PATH = path.join(__dirname, '..', 'examples', 'basic_website')

const stratis = new StratisCli()

stratis.serve_path = path.join(WEBSITE_PATH, 'public')
stratis.init_script_path = path.join(__dirname, WEBSITE_PATH, 'startis_init.js')

stratis.run().catch((err) => {
  console.error(err)
  process.exit(err.code || 1)
})
