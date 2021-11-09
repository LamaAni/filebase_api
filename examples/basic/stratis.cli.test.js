const { StratisCli } = require('../../src/cli')
const path = require('path')

const serve_path = path.resolve(__dirname)

const stratis = new StratisCli()
stratis.default_redirect = '/index.html'
stratis.serve_path = serve_path
// stratis.redirect_all_unknown=true

stratis.run().catch((err) => {
  console.error(err)
  process.exit(err.code || 1)
})
