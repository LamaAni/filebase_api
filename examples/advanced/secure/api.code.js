module.exports = {
  async print_something({}, context) {
    return `api called @ ${new Date()}`
  },
}
