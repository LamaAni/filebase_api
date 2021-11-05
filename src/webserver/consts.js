const path = require('path')
const fs = require('fs')

module.exports = {
  STRATIS_CLIENTSIDE_SOURCE: fs.readFileSync(
    path.join(__dirname, 'clientside.js'),
    'utf-8'
  ),
  DEFAULT_PAGE_FILE_EXT: ['.html', '.htm', '.css', '.json', '.yaml'],
}
