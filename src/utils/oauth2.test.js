const { StratisOAuth2Provider } = require('./oauth2/provider')

const provider = new StratisOAuth2Provider({
  client_id: 'test-id',
  client_secret: 'not-a-secret',
  service_url: 'http://not-a-service',
})

if (require.main == module) {
  const val = 'asdasd023101321ad'
  const decrypted = provider.decrypt(provider.encrypt(val, -1))
  console.log(val)
  console.log(decrypted)
  console.log(val == decrypted)
}
