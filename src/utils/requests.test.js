const { StratisRequests } = require('./requests')
const client = new StratisRequests()

async function main() {
  console.log(
    await (await client.request('https://www.google.com')).to_string()
  )
}

main().catch((err) => {
  console.error(err)
  return err.code || 1
})
