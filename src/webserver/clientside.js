if (document.stratis_client_constructor == null) {
  class StratisClient extends EventTarget {
    /**
     * @param {number} timeout The request timeout
     * @param {string} websocket_path The url for the api websocket.
     */
    constructor(timeout = 1000 * 60, websocket_path = null) {
      super()
      this.protocol = window.location.protocol == 'https:' ? 'wss:' : 'ws:'
      this.timeout = StratisClient.try_parse_number(timeout, 1000 * 60)

      /** @type {WebSocket} */
      this.websocket = null
      this.websocket_path = websocket_path
      this._request_timeout_id_by_rid = {}
      this.validate_websocket()
    }

    static try_parse_number(num, default_value = null) {
      try {
        if (typeof num == 'number') return num
        return parseInt(num)
      } catch (err) {
        return default_value
      }
    }

    static get api_even_name() {
      return '__stratis_api_websocket_invoke'
    }

    /**
     * @param {string} name The name of the api method to catch.
     * @param {(...args, ws)} handler The method handler.
     */
    static on(name, handler) {
      return this.addEventListener(name, handler)
    }

    /**
     * @param {string} name The name of the api method to clear.
     * @param {any} callback The callback method.
     */
    static clear(name, callback) {
      this.removeEventListener(name, callback)
    }

    assert(condition, ...data) {
      if (condition != true)
        throw data.length == 1 && data[0] instanceof Error
          ? data[0]
          : data.join('\n')
    }

    set_request_timeout(rid, callback, timeout = null) {
      this._request_timeout_id_by_rid[rid] = setTimeout(callback, this.timeout)
    }

    clear_request_timeout(rid) {
      if (
        this._request_timeout_id_by_rid != null &&
        this._request_timeout_id_by_rid[rid] != null
      ) {
        let timeout_id = this._request_timeout_id_by_rid[rid]
        delete this._request_timeout_id_by_rid[rid]
        window.clearTimeout(timeout_id)
      }
    }

    /**
     * Call a method with timeout.
     * @param {()=>any} method The method to invoke (can be async)
     * @param {string} rid The request id
     * @param {Error} timeout_error The timeout error.
     * @param {number} timeout The timeout
     */
    async with_timeout(method, timeout_error, rid = null, timeout = null) {
      rid = rid || this.make_request_id()

      timeout = timeout || this.timeout
      assert(
        typeof timeout == 'number' && timeout > 0,
        'timeout muse be a number larger than zero'
      )

      return await new Promise((resolve, reject) => {
        this.set_request_timeout(
          rid,
          () => {
            reject(timeout_error || 'timeout ' + timeout)
          },
          Math.ceil(timeout)
        )

        // calling the inner method.
        ;(async () => {
          try {
            const rslt = await method()
            this.clear_request_timeout(rid)
            resolve(rslt)
          } catch (err) {
            this.clear_request_timeout(rid)
            reject(err)
          }
        })()
      })
    }

    resolve_websocket_path(websocket_path) {
      websocket_path = websocket_path || this.websocket_path
      if (websocket_path == null) return window.location.pathname

      if (websocket_path.startsWith('/')) return websocket_path

      if (websocket_path.startsWith('./'))
        websocket_path = websocket_path.substring(2)

      // include the current location.
      let resolved_path = window.location.pathname + '/../' + websocket_path

      // calculating relative paths.
      const path_parts = resolved_path.split('/')
      const resolved_path_parts = []
      for (let i = 0; i < path_parts.length; i++) {
        const part = path_parts[i]
        if (part == '..') {
          // skip next
          resolved_path_parts.pop()
          continue
        }
        resolved_path_parts.push(part)
      }

      resolved_path = resolved_path_parts.join('/')
      if (!resolved_path.startsWith('/')) resolved_path = '/' + resolved_path

      // reversing and joining
      return resolved_path
    }

    validate_websocket() {
      if (this.websocket != null) return

      this.websocket = new WebSocket(
        this.protocol +
          '//' +
          window.location.host +
          this.resolve_websocket_path()
      )

      console.log(
        'Created stratis websocket connection @ ' + this.websocket.url
      )

      this.websocket.addEventListener('message', (ev) => {
        this.process_websocket_message(ev)
      })
      this.websocket.addEventListener('open', (ev) => {
        console.log('Stratis websocket connection open @ ' + this.websocket.url)
      })
    }

    async wait_for_websocket_ready() {
      this.validate_websocket()
      if (this.websocket.readyState == this.websocket.OPEN) return true
      console.log('waiting for stratis websocket to be ready..')

      await new Promise((resolve, reject) => {
        let connected_event_listener = null

        connected_event_listener = () => {
          resolve()
          this.websocket.removeEventListener('open', connected_event_listener)
        }

        this.websocket.addEventListener('open', connected_event_listener)
      })
    }

    process_websocket_message(ev) {
      const data = JSON.parse(ev.data)
      try {
        this.invoke_event(data.rid, data.response, data.error)
      } catch (err) {
        console.error(err)
      }
      // check if to reload.
      if (data.reload == true) window.location.reload()
    }

    async invoke_event(rid, response, error) {
      response = response || {}

      const ev = new Event(name)
      ev.rid = rid
      ev.args = response
      ev.error = error
      this.dispatchEvent(ev)

      const invoke_event = new Event(StratisClient.api_even_name)
      invoke_event.rid = rid
      invoke_event.args = response
      invoke_event.error = error
      this.dispatchEvent(invoke_event)
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

    /**
     * @param {string} name Name of the api function to call
     * @param {{}} args The function arguments (first argument)
     * @param {number} timeout The timeout in ms
     * @returns {any} The request response.
     */
    async api_call(name, args, timeout = null) {
      this.assert(
        typeof name == 'string' && name.length > 0,
        'name must be a non empty string'
      )

      const rid = this.make_request_id()

      // validating websocket is connected.
      await this.wait_for_websocket_ready()

      this.websocket.send(
        JSON.stringify({
          rid,
          name,
          args,
        })
      )

      timeout = timeout || this.timeout
      return await new Promise((resolve, reject) => {
        let response_listenter = null
        const cleanup = () => {
          if (response_listenter != null)
            this.removeEventListener(
              StratisClient.api_even_name,
              response_listenter
            )
          this.clear_request_timeout(rid)
        }

        this.set_request_timeout(
          rid,
          () => {
            cleanup()
            reject(
              `Client request for api object '${name}'' timed out (${rid})`
            )
          },
          Math.ceil(timeout)
        )

        response_listenter = async (ev) => {
          if (ev.rid == rid) {
            cleanup()
            if (ev.error != null) reject(ev.error)
            else resolve(ev.args)
          }
        }

        this.addEventListener(StratisClient.api_even_name, response_listenter)
      })
    }
  }

  document.stratis_client_constructor = StratisClient
}

const <%- api_name %>_client = new document.stratis_client_constructor(
  '<%- stratis.client_api_options.timeout %>',
  <%- websocket_path? `'${websocket_path}'` : 'null' %>,
)

class <%- api_name %> {
  // Auto generated api object get methods
  // <% for (const api_object_name of Object.keys(code_module)) {%>
  static async <%- api_object_name %>(...args){
    return await <%- api_name %>_client.api_call('<%-api_object_name%>',...args)
  }
  // <% } %>
}
