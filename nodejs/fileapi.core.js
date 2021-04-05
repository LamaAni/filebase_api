const _file_api_ws_protocol = window.location.protocol == 'https:' ? 'wss:' : 'ws:'
let _file_api__websocket = new WebSocket(
    _file_api_ws_protocol + '//' + window.location.host + window.location.pathname,
)

const _file_api__websocket_invoke_listener = new EventTarget()

async function _file_api_invoke_event(name, args) {
    if (name == null) throw new Error('Event name was not defined on api invoke.')
    args = args || []

    const ev = new Event(name)
    ev.data = args

    _file_api__websocket_invoke_listener.dispatchEvent(ev)

    if (file_api[name] != null && typeof file_api[name] == 'function')
        await file_api[name](...args, _file_api__websocket)
}

_file_api__websocket.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data)
    try {
        _file_api_invoke_event(data.name, data.args)
    } catch (err) {
        file_api.error(err)
    }
})

const _file_api_make_id_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const _file_api_make_id_chars_length = _file_api_make_id_chars.length
const _file_api_ws_request_response_timeout = parseInt('<%-file_api.client_request_timeout%>')

function _file_api_makeid(length) {
    let result = ''
    for (var i = 0; i < length; i++) {
        result += _file_api_make_id_chars.charAt(
            Math.floor(Math.random() * _file_api_make_id_chars_length),
        )
    }
    return result
}

async function _file_api_send_ws_request(name, ...args) {
    const rid = _file_api_makeid(15)
    _file_api__websocket.send(
        JSON.stringify({
            name: name,
            args: args,
            rid,
        }),
    )
    return await new Promise((resolve, reject) => {
        let callback = null
        function cleanup() {
            if (callback) _file_api__websocket_invoke_listener.removeEventListener(rid, callback)
        }

        const timeout_index = setTimeout(() => {
            reject(new Error('Timed out waiting for response on request: ' + rid))
            cleanup()
        }, _file_api_ws_request_response_timeout)

        callback = _file_api__websocket_invoke_listener.addEventListener(rid, (ev) => {
            try {
                resolve(ev.data[0])
            } catch (err) {
                reject(err)
            } finally {
                cleanup()
            }
        })
    })
}

class file_api {
    // Auto generated api method calls <%-fileapi_methods%>

    /**
     * @param {string} name The name of the api method to catch.
     * @param {(...args, ws)} handler The method handler.
     */
    static on(name, handler) {
        return _file_api__websocket_invoke_listener.addEventListener(name, handler)
    }

    /**
     * @param {string} name The name of the api method to clear.
     * @param {any} callback The callback method.
     */
    static clear(name, callback) {
        _file_api__websocket_invoke_listener.removeEventListener(name, callback)
    }

    /**
     * On error from remote.
     * @param {Error} err
     */
    static error(err) {
        console.error(err)
    }
}
