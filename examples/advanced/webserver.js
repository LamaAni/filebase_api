const { Stratis } = require('../../src/index')
const path = require('path')

const serve_directory_fullpath = path.resolve(path.join(__dirname, 'public'))
const app = new Stratis({}).server(serve_directory_fullpath)
const port = 8080

app.all('/test', (req, rsp, next) => {
  rsp.send('lama')
})

// redirect all.
app.use((req, rsp, next) => {
  rsp.redirect('/public/index.html')
})

app.listen(port, () =>
  console.log(`Listening for http://localhost:${port}/index.html`)
)
