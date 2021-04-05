class Emitter extends EventTarget {
    constructor() {
        super()
        this.sticky = Symbol()

        // store listeners (by callback)
        this.listeners = {
            '*': [], // pre alocate for all (wildcard)
        }
        // l = listener, c = callback, e = event
        this[this.sticky] = (l, c, e) => {
            // dispatch for same "callback" listed (k)
            l in this.listeners
                ? this.listeners[l].forEach((k) =>
                      k === c ? k(e, e.detail) : null
                  )
                : null
        }
    }
    on(e, cb, once = false) {
        // store one-by-one registered listeners
        !this.listeners[e]
            ? (this.listeners[e] = [cb])
            : this.listeners[e].push(cb)
        // check `.once()` ... callback `CustomEvent`
        once
            ? this.addEventListener(e, this[this.sticky].bind(this, e, cb), {
                  once: true,
              })
            : this.addEventListener(e, this[this.sticky].bind(this, e, cb))
    }
    off(e, Fn = false) {
        if (this.listeners[e]) {
            // remove listener (include ".once()")
            let removeListener = (target) => {
                this.removeEventListener(e, target)
            }
            // use `.filter()` to remove expecific event(s) associated to this callback
            const filter = () => {
                this.listeners[e] = this.listeners[e].filter((val) =>
                    val === Fn ? removeListener(val) : val
                )
                // check number of listeners for this target ... remove target if empty
                this.listeners[e].length === 0
                    ? e !== '*'
                        ? delete this.listeners[e]
                        : null
                    : null
            }
            // use `while()` to iterate all listeners for this target
            const iterate = () => {
                let len = this.listeners[e].length
                while (len--) {
                    removeListener(this.listeners[e][len])
                }
                // remove all listeners references (callbacks) for this target (by target object)
                e !== '*' ? delete this.listeners[e] : (this.listeners[e] = [])
            }
            Fn && typeof Fn === 'function' ? filter() : iterate()
        }
    }
    clear(e, Fn = false) {
        return this.off(e, Fn)
    }
    emit(e, d) {
        this.listeners['*'].length > 0
            ? this.dispatchEvent(new CustomEvent('*', { detail: d }))
            : null
        this.dispatchEvent(new CustomEvent(e, { detail: d }))
    }
    async emit_async(e, d) {
        return this.emit(name, d)
    }
    once(e, cb) {
        this.on(e, cb, true)
    }
}

class FilebaseApi extends Emitter {
    constructor(websocket_url = null) {
        super()

        this.FILEBASE_API_WEBSOCKET_MARKER =
            '{!%FILEBASE_API_WEBSOCKET_MARKER%!}'
        this.FILEBASE_API_CORE_ROUTES_MARKER =
            '{!%FILEBASE_API_CORE_ROUTES_MARKER%!}'
        this.FILEBASE_API_REMOTE_METHODS_COLLECTION_MARKER =
            '{!%FILEBASE_API_REMOTE_METHODS_COLLECTION_MARKER%!}'
        this.FILEBASE_API_PAGE_TYPE_MARKER =
            '{!%FILEBASE_API_PAGE_TYPE_MARKER%!}'

        this.pending_command_ids = new Set()
        this.websocket_url =
            websocket_url ||
            `ws://${window.location.host}/${this.FILEBASE_API_WEBSOCKET_MARKER}?${this.FILEBASE_API_PAGE_TYPE_MARKER}=${window.location.pathname}}`

        this.websocket_methods_url = `/${this.FILEBASE_API_CORE_ROUTES_MARKER}/${this.FILEBASE_API_REMOTE_METHODS_COLLECTION_MARKER}?${this.FILEBASE_API_PAGE_TYPE_MARKER}=${window.location.pathname}`

        this.waiting_for_initialization = true
    }

    get status() {
        let status_list = new Set()
        if (this.pending_command_ids.size > 0) {
            status_list.add('waiting_on_commands')
        }

        if (this.waiting_for_initialization) {
            status_list.add('initializing')
        }

        if (status_list.size == 0) return 'ready'
        return Array.from(status_list).join('|')
    }

    next_command_id() {
        if (this.cur_command_id == null) this.cur_command_id = 0
        else this.cur_command_id += 1
        return this.cur_command_id
    }

    process_common_command_rsp(rsp) {
        if (rsp.__error != null) throw Error(rsp.__error)
        if (rsp.__warning != null) console.warn(rsp.__warning)
    }

    parse_json_with_datetime(str) {
        return JSON.parse(str, (k, v) => {
            if (typeof v === 'string' && v.startsWith('DT::'))
                return new Date(Date.parse(v.substr(4)))

            return v
        })
    }

    /**
     * Execute a command on the server.
     * @param {object} command
     * @param {number} timeout
     */
    async exec_command(command, timeout = 1000 * 30) {
        let command_id = this.next_command_id()
        command['__command_id'] = command_id

        let rsp = null
        let handler = null

        this.pending_command_ids.add(command_id)
        this.emit_async('status_changed').catch(() => {})
        await new Promise((resolve, reject) => {
            handler = this.on('command', (ev, data) => {
                if (command.__command_id != data.__command_id) return
                rsp = data
                resolve()
            })
            this.ws.send(JSON.stringify(command))
            if (timeout > 0) {
                window.setTimeout(
                    () => reject(new Error('command timedout')),
                    timeout
                )
            }
        }).finally(() => {
            this.clear(handler)
            this.pending_command_ids.delete(command_id)
            this.emit_async('status_changed').catch(() => {})
        })

        this.process_common_command_rsp(rsp)
        return rsp
    }

    async exec(...args) {
        if (typeof args[0] == 'string') {
            let name = args[0]
            args = args.slice(1)
            cmnd = {}
            cmnd[name] = args
            return (await filebase_api.exec_command(cmnd))[name]
        }
        return await filebase_api.exec_command(...args)
    }

    ready(action) {
        this.on('ready', action)
    }

    check_ready() {
        if (this.websocket_open && this.scripts_loaded) {
            this.emit('ready')
            this.emit('status_changed')
        }
    }

    create_exposed_module_scripts_source() {
        let script = document.createElement('script')
        let commander = this
        script.lang = 'javascript'
        script.src = this.websocket_methods_url
        script.onload = function () {
            commander.scripts_loaded = true
            commander.check_ready()
        }
        document.head.appendChild(script)
    }

    register_websocket() {
        // Need to check if its also open?
        if (this.ws != null) return

        // Let us open a web socket
        try {
            this.create_exposed_module_scripts_source()

            let ws = new WebSocket(this.websocket_url)
            let commander = this
            commander.ws = ws

            ws.onopen = function () {
                console.log('Filebase api command websocket open')
                commander.waiting_for_initialization = false
                commander.emit('open')
                commander.websocket_open = true
                commander.check_ready()
            }
            ws.onmessage = function (ev) {
                try {
                    let data = commander.parse_json_with_datetime(ev.data)
                    if (data.__command_id != null)
                        commander.emit('command', data)
                    else if (data.__event_name != null) {
                        commander.emit(
                            data.__event_name,
                            ...(data.args || []),
                            data.kwargs || {}
                        )
                    } else commander.process_common_command_rsp(data)
                } catch (ex) {
                    console.error(ex)
                }
            }
            ws.onclose = function () {
                console.log('Command websocket closed')
                commander.emit('close')
            }
            console.log(`Registered command websocket @ ${this.websocket_url}`)
        } catch (ex) {
            console.error(
                `Could not register commands websocket @ ${this.websocket_url}, commands unavailabale.`
            )
        }
    }
}

if (window.filebase_api == null) {
    window.filebase_api = new FilebaseApi()
    window.addEventListener('load', (event) => {
        filebase_api.register_websocket()
    })
}

const fapi = window.filebase_api
