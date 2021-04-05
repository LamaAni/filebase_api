const ws = require('ws')
const { Request, Response, NextFunction } = require('express/index')

/**
 * Check if this request is a websocket request
 * @param {Request} req
 */
function is_websocket_request(req) {
    return req.headers.upgrade != null && req.headers.upgrade.toLowerCase() == 'websocket'
}

/**
 * Creates a websocket middleware that catches websocket requests
 * @param {(ws:ws, req:Request)=>{}} handler The websocket handler
 * @param {{
 * handleProtocols: any,
 * perMessageDeflate: ws.PerMessageDeflateOptions,
 * maxPayload:number,
 * before_upgrade: (req:Request, server: ws.Server) => {}
 * error_if_not_websocket: boolean,
 * }} param1 options
 * @returns {(req:Request,res:Response,next:NextFunction)=>{}} Middleware
 */
function create_express_websocket_middleware(
    handler,
    {
        handleProtocols = null,
        perMessageDeflate = null,
        maxPayload = null,
        before_upgrade = null,
        error_if_not_websocket = false,
    } = {},
) {
    const server = new ws.Server({ noServer: true, handleProtocols, perMessageDeflate, maxPayload })

    /**
     * @param {Request} req
     * @param {Response} rsp
     * @param {NextFunction} next
     */
    function middleware(req, rsp, next) {
        if (!is_websocket_request(req)) {
            if (error_if_not_websocket) throw Error('Websocket received a non websocket request')
            return next()
        }

        if (before_upgrade) before_upgrade(req, server)

        server.handleUpgrade(req, req.socket, Buffer.from(''), handler)
    }

    return middleware
}

create_express_websocket_middleware.is_websocket_request = is_websocket_request

module.exports = create_express_websocket_middleware
