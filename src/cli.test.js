const { StratisCli } = require('./cli')
const path = require('path')

const stratis = new StratisCli()
stratis.serve_path = path.join(
  __dirname,
  '..',
  'examples',
  'basic_website',
  'public'
)

stratis.run().catch((err) => {
  console.error(err)
  process.exit(err.code || 1)
})
