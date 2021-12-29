const { Stratis } = require('./stratis')
const path = require('path')

const repo_path = path.resolve(path.join(__dirname, '../../'))
const serve_path = path.join(repo_path, 'examples', 'basic')

const app = new Stratis().server({ serve_path: path.resolve(serve_path) })
const port = 8080

app.all('/test', (req, res, next) => {
  res.send('lama')
})

// redirect all.
app.use((req, res, next) => {
  res.redirect('/index.html')
})

app.listen(port, () => console.log('Listening for http://localhost:' + port))
