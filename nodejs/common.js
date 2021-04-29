module.exports = {
  assert: (condition, ...data) => {
    if (condition != true) throw Error(...data)
  },
}
