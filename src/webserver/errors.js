/**
 * @typedef {import('./interfaces').StratisExpressRequest} StratisExpressRequest
 * @typedef {import('./interfaces').StratisExpressResponse} StratisExpressResponse
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
   * @param {StratisExpressRequest} req The express request
   * @param {StratisExpressResponse} res The express response
   * @param {NextFunction} next The express next function
   */
  handle_error(req, res, next) {}
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

class StratisParseError extends StratisError {
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
    req.stratis_request.logger.debug(`Parse error: ${this.message}. Source:  \n${this.source}`)
  }
}

module.exports = {
  StratisError,
  StratisNotFoundError,
  StratisTimeOutError,
  StratisNotAuthorizedError,
  StratisNotAuthorizedReloadError,
  StratisParseError,
}
