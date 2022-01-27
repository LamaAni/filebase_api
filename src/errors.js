/**
 * @typedef {import('./webserver/interfaces').StratisExpressRequest} StratisExpressRequest
 * @typedef {import('./webserver/interfaces').StratisExpressResponse} StratisExpressResponse
 * @typedef {import('express').NextFunction} NextFunction
 **/

class StratisError extends Error {
  constructor(...args) {
    super(...args)
  }

  get http_response_code() {
    return 500
  }

  get requires_reload() {
    return false
  }

  /**
   * If true then emit error event
   */
  get emit_error() {
    return this.http_response_code == 500
  }

  /**
   * @param {StratisExpressRequest} req The express request
   * @param {StratisExpressResponse} res The express response
   * @param {NextFunction} next The express next function
   */
  handle_error(req, res, next) {}
}

class StratisNoEmitError extends StratisError {
  /**
   * If true then emit error event
   */
  get emit_error() {
    return false
  }
}

class StratisNotFoundError extends StratisError {
  get http_response_code() {
    return 404
  }
}

class StratisNotAuthorizedError extends StratisError {
  get http_response_code() {
    return 403
  }
}

class StratisNotAuthorizedReloadError extends StratisNotAuthorizedError {
  get http_response_code() {
    return 403
  }

  get requires_reload() {
    return true
  }
}

class StratisTimeOutError extends StratisError {
  get http_response_code() {
    return 408
  }
}

class StratisParseError extends StratisNoEmitError {
  constructor(source, ...args) {
    super(...args)
    this.source = source
  }

  /**
   * @param {StratisExpressRequest} req The express request
   * @param {StratisExpressResponse} res The express response
   * @param {NextFunction} next The express next function
   */
  handle_error(req, res, next) {
    req.stratis_request.logger.debug(
      `Parse error: ${this.message}. Source:  \n${this.source}`
    )
  }
}

class StratisNotImplementedError extends StratisError {}

/**
 * @param {Error|string} exception
 * @param {Error} inner_exception
 * @param {string} sep
 */
function concat_errors(exception, inner_exception, sep = '. ') {
  if (!(exception instanceof Error)) exception = new StratisError(exception)

  if (!(inner_exception instanceof Error))
    inner_exception = new Error(inner_exception)

  exception.stack =
    (exception.stack || '') + '\n' + (inner_exception.stack || '')
  exception.message =
    (exception.message || '') + sep + (inner_exception.message || '')
  return exception
}

module.exports = {
  concat_errors,
  StratisError,
  StratisNoEmitError,
  StratisNotFoundError,
  StratisTimeOutError,
  StratisNotImplementedError,
  StratisNotAuthorizedError,
  StratisNotAuthorizedReloadError,
  StratisParseError,
}
