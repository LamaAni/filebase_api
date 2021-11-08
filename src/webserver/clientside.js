class StratisClient extends EventTarget {
  constructor() {
    this.protocol = window.location.protocol == 'https:' ? 'wss:' : 'ws:'
    this.timeout = parseInt('<%-stratis.client_api.timeout%>')

    this.websocket = new WebSocket(
      this.protocol + '//' + window.location.host + window.location.pathname
    )
  }

  make_request_id() {
    const S4 = function () {
      return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1)
    }
    return (
      S4() +
      S4() +
      '-' +
      S4() +
      '-' +
      S4() +
      '-' +
      S4() +
      '-' +
      S4() +
      S4() +
      S4()
    )
  }
}

const _stratis__websocket_invoke_listener = new EventTarget()

/**
 * @param {string} name The name of the browser side method to call.
 * @param {[any]} args The values to send as args.
 */
async function _stratis_invoke_event(name, args) {
  if (name == null) throw new Error('Event name was not defined on api invoke.')
  args = args || []

  const ev = new Event(name)
  ev.data = args

  _stratis__websocket_invoke_listener.dispatchEvent(ev)

  if (stratis[name] != null && typeof stratis[name] == 'function')
    await stratis[name](...args, _stratis__websocket)
}

_stratis__websocket.addEventListener('message', (ev) => {
  const data = JSON.parse(ev.data)
  try {
    _stratis_invoke_event(data.call, data.args)
  } catch (err) {
    stratis.error(err)
  }
})

/**
 * Makes a stratis request id
 * @param {int} length The number of letters in the id
 * @returns
 */
function _stratis_makeid(length = 15) {
  let result = ''
  for (var i = 0; i < length; i++) {
    result += _stratis_make_id_chars.charAt(
      Math.floor(Math.random() * _stratis_make_id_chars_length)
    )
  }
  return result
}

/**
 * Waits for the stratis websocket to be ready.
 */
async function wait_for_staratis_websocket() {
  if (_stratis__websocket.readyState == _stratis__websocket.OPEN) return true
  console.log('waiting for stratis to be ready..')
  await new Promise((resolve, reject) => {
    window.setTimeout(() => {
      reject('Timed out')
    }, _stratis_ws_request_response_timeout)

    let connected_event_listener = null

    connected_event_listener = () => {
      resolve()
      _stratis__websocket.removeEventListener('close', connected_event_listener)
    }

    _stratis__websocket.addEventListener('open', connected_event_listener)
  })
}

/**
 * Send a api server method query.
 * @param {string} call The name of the server method to call
 * @param {any} payload The file to upload.
 * @param  {...any} args The args to send to that method.
 * @returns The return value of the server method.
 */
async function _stratis_send_ws_request(call, payload, ...args) {
  await wait_for_staratis_websocket()

  const rid = _stratis_makeid(15)

  const call_info_json = JSON.stringify({
    call: call,
    args: args,
    rid,
  })

  if (payload == null) _stratis__websocket.send(call_info_json)
  else {
    throw new Error('Stream sending through websocket is not yet implemented.')
  }

  return await new Promise((resolve, reject) => {
    let callback = null
    function cleanup() {
      if (callback)
        _stratis__websocket_invoke_listener.removeEventListener(rid, callback)
    }

    const timeout_index = setTimeout(() => {
      reject(new Error('Timed out waiting for response on request: ' + rid))
      cleanup()
    }, _stratis_ws_request_response_timeout)

    callback = _stratis__websocket_invoke_listener.addEventListener(
      rid,
      (ev) => {
        try {
          resolve(ev.data[0])
        } catch (err) {
          reject(err)
        } finally {
          cleanup()
        }
      }
    )
  })
}

class stratis {
  // Auto generated api method calls <%-Stratis_methods%>

  /**
   * @param {string} name The name of the api method to catch.
   * @param {(...args, ws)} handler The method handler.
   */
  static on(name, handler) {
    return _stratis__websocket_invoke_listener.addEventListener(name, handler)
  }

  /**
   * @param {string} name The name of the api method to clear.
   * @param {any} callback The callback method.
   */
  static clear(name, callback) {
    _stratis__websocket_invoke_listener.removeEventListener(name, callback)
  }

  /**
   * On error from remote.
   * @param {Error} err
   */
  static error(err) {
    console.error(err)
  }

  static async upload(call, file, arg1, arg2) {
    throw new Error('Stream sending through websocket is not yet implemented.')
  }
}
