const { FileApi } = require('./index')
const path = require('path')

const app = new FileApi({}).server(path.resolve(path.join(__dirname, 'public')))

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
