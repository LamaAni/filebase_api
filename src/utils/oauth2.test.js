const { StratisOAuth2Provider } = require('./oauth2.js')
const express = require('express')
const cookie_session = require('cookie-session')
const path = require('path')

const TEST_CLIENT_ID = process.env['TEST_OAUTH2_CLIENT_ID']
const TEST_CLIENT_SECRET = process.env['TEST_OAUTH2_CLIENT_SECRET']

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
  token_url: process.env['TEST_OAUTH2_TOKEN_URL'],
  authorize_url: process.env['TEST_OAUTH2_AUTH_URL'],
  token_info_url: process.env['TEST_OAUTH2_TOKEN_INFO_URL'],
  user_info_url: process.env['TEST_OAUTH2_USER_INFO_URL'],
  revoke_url: process.env['TEST_OAUTH2_REVOKE_URL'],
  client_id: TEST_CLIENT_ID,
  client_secret: TEST_CLIENT_SECRET,
  recheck_interval: 1,
  // access_validators: [{ regexp: 'zav', token_info_path: 'username' }],
  scope: ['okta.users.read.self'],
}).apply(app)

app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, 'oauth2.test.html'))
})

app.listen(8080, () => {
  console.log('listening on port 8080')
})
