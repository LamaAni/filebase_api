const { Stratis } = require('../../src/index')
const path = require('path')

const serve_path = path.resolve(__dirname)

const app = new Stratis().server(path.resolve(serve_path))
const port = 8080

app.all('/test', (req, res, next) => {
  res.send('lama')
})

// redirect all.
app.use((req, res, next) => {
  res.redirect('/public/index.html')
})

app.listen(port, () => console.log('Listening for http://localhost:' + port))
