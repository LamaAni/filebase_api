// augmentation for template strings

/**
 * @param {string} str The string
 * @param {integer} count The number of chars to indent.
 * @param {boolean} include_first_line If to include the first line
 * @param {boolean} include_empty_lines If to include empty lines
 * @param {string} spacer The spacer to use
 */
function indent_string(
  str,
  count,
  include_first_line = false,
  include_empty_lines = true,
  spacer = ' '
) {
  const indent_string = spacer.repeat(count)
  const regex = include_empty_lines ? /^/gm : /^(?!\s*$)/gm
  if (include_first_line) return str.replace(regex, indent_string)
  else {
    const line_seperator = '\r\n' in str ? '\r\n' : '\n'
    const lines = str.split(line_seperator)
    const first_line = lines[0]
    const to_indent = lines.slice(1).join(line_seperator)
    return first_line + line_seperator + to_indent.replace(regex, indent_string)
  }
}

String.prototype.indent = function (
  count,
  include_first_line = false,
  include_empty_lines = true,
  spacer = ' '
) {
  return indent_string(
    this,
    count,
    include_first_line,
    include_empty_lines,
    spacer
  )
}

if (require.main == module) {
  console.log('abcd\nef'.indent(3))
}
