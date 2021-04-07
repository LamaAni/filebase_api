const { FileApi } = require('../../nodejs/index')
const path = require('path')

const serve_directory_fullpath = path.resolve(path.join(__dirname, 'public'))
const app = new FileApi({}).server(serve_directory_fullpath)

app.all('/test', (req, rsp, next) => {
  rsp.send('lama')
})

// redirect all.
app.use((req, rsp, next) => {
  rsp.redirect('/index.html')
})

app.listen(3000, () =>
  console.log('Listening for http://localhost:3000/index.html')
)
