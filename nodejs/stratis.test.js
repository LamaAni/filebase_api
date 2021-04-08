const { Stratis } = require('./index')
const path = require('path')

const serve_path = path.join(__dirname, '..', 'examples', 'node', 'public')
const app = new Stratis({}).server(path.resolve(serve_path))

app.all('/test', (req, res, next) => {
  res.send('lama')
})

// redirect all.
app.use((req, res, next) => {
  res.redirect('/index.html')
})

const port = 8080

app.listen(3000, () => console.log('Listening for http://localhost:' + port))
