const { StratisOAuth2Provider } = require('./oauth2.js')
const express = require('express')
const cookie_session = require('cookie-session')
const path = require('path')

const TEST_AUTH_URL = 'https://authorization-server.com/authorize'
const TEST_TOKEN_URL = 'https://authorization-server.com/authorize'
const TEST_CLIENT_ID = 'bMwdMwZSO-ad4WFSQmcSsmVI'
const TEST_CLIENT_SECRET = 'z3lUp162ulA4_aGBW0KJh4i3qcvH21syetepVbYCeVzZsRw9'
const TEST_CLIENT_USERNAME = 'ill-lion@example.com'
const TEST_CLIENT_PASSWORD = 'Jealous-Quelea-15'

const app = express()

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  console.log(req.url)
  return next()
})

app.use(
  cookie_session({
    secure: false,
    name: path.basename(__filename),
    keys: [path.basename(__filename)],
  })
)

new StratisOAuth2Provider({
  token_url: TEST_TOKEN_URL,
  authorize_url: TEST_AUTH_URL,
  client_id: TEST_CLIENT_ID,
  client_secret: TEST_CLIENT_SECRET,
}).apply(app)

app.use((req, res, next) => {
  res.send('OK!')
})

app.listen(8080, () => {
  console.log('listening on port 8080')
})
