const path = require('path')
const fs = require('fs')

module.exports = {
  STRATIS_CLIENTSIDE_SOURCE: fs.readFileSync(
    path.join(__dirname, 'clientside.js'),
    'utf-8'
  ),
}
