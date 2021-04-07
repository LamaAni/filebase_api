async function test_remote_call(value) {
  return `remote: ${value}`
}

const template_argument = `My argument ${new Date()}`

module.exports = {
  test_remote_call,
  template_argument,
}
