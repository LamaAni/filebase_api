const _stratis_ws_protocol =
  window.location.protocol == 'https:' ? 'wss:' : 'ws:'
let _stratis__websocket = new WebSocket(
  _stratis_ws_protocol + '//' + window.location.host + window.location.pathname
)

const _stratis__websocket_invoke_listener = new EventTarget()

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
    _stratis_invoke_event(data.name, data.args)
  } catch (err) {
    stratis.error(err)
  }
})

const _stratis_make_id_chars =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const _stratis_make_id_chars_length = _stratis_make_id_chars.length
const _stratis_ws_request_response_timeout = parseInt(
  '<%-stratis.client_request_timeout%>'
)

function _stratis_makeid(length) {
  let result = ''
  for (var i = 0; i < length; i++) {
    result += _stratis_make_id_chars.charAt(
      Math.floor(Math.random() * _stratis_make_id_chars_length)
    )
  }
  return result
}

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

async function _stratis_send_ws_request(name, ...args) {
  await wait_for_staratis_websocket()
  const rid = _stratis_makeid(15)
  _stratis__websocket.send(
    JSON.stringify({
      name: name,
      args: args,
      rid,
    })
  )
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
}
