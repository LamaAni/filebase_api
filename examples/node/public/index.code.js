async function test_remote_call(value) {
  return `remote: ${value}`
}

const template_argument = `My argument ${new Date()}`

class CodeClass {
  constructor() {
    this.val = 'lama'
  }
}

module.exports = {
  helpers: { CodeClass },
  test_remote_call,
  template_argument,
}
