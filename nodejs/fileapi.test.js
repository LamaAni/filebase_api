const path = require('path')
const http = require('http')
const { log } = require('../common')
const { app } = require('../consts')
const websocket = require('./websocket')
const { FileApi } = require('./fileapi')

let port = 3000
const httpServer = http.createServer(app)
const fapi = new FileApi({
    ejs_environment: require('../consts'),
})

app.set('etag', false)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
})

app.all('/', (req, rsp, next) => {
    rsp.redirect('/index.html')
})

app.use(fapi.middleware(path.resolve(path.join(__dirname, '..', 'www'))))

httpServer.listen(port)
log.info(`Listening @ http://localhost:${port}`)
