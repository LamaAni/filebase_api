/**
 * @typedef {import('./requests').StratisRequest} StratisRequest
 */

/**
 * @typedef {Object} StratisSessionOptions
 * @property {string} session_name
 * @property {string} secure_key
 */

class StratisSession {
  /**
   * @param {StratisRequest} stratis_request
   */
  constructor(stratis_request) {
    this._stratis_request = stratis_request
    this._session_data = {}
    this._changed = false
  }

  get stratis_request() {
    return this._stratis_request
  }

  get changed() {
    return this._changed
  }

  get handler() {
    if (this._handler == null) this._handler = this.create_handler()
    return this._handler
  }

  /**
   * Call to load the session information.
   */
  async load() {}

  create_handler() {
    const session = this
    const proxy = new Proxy(this._session_data, {
      get: function (obj, prop) {
        return obj[prop]
      },
      set: function (obj, prop, value) {
        const cur_value = obj[prop]
        if (cur_value == value) return false
        session._changed = true
        obj[prop] = value
        return true
      },
    })
    return proxy
  }

  to_base64() {}
}

if (require.main == module) {
  const sess = new StratisSession()
  sess.handler['asd'] = 'lasdsad'
  console.log(sess)
}
