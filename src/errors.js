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
    return 401
  }
}

class StratisNotAuthorizedReloadError extends StratisNotAuthorizedError {
  get http_response_code() {
    return 401
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
 * @param {[Error|string]} errors
 */
function concat_errors(...errors) {
  if (errors.length == 0) throw new Error('Cannot concat less than one error')
  const first_error = errors.filter((e) => e instanceof Error)[0]

  errors = errors.map((err) => {
    if (err instanceof Error) return err
    else return new Error(`${err}`)
  })

  const stack = errors.map((err) => err.stack).join('\n')
  const message = errors.map((err) => err.message).join('\n')

  /** @type {Error} */
  const concatenated = new Error(first_error || errors[0])
  concatenated.stack = stack
  concatenated.message = message

  return concatenated
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
