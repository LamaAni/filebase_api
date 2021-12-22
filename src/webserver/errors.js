/**
 * @typedef {import('express').Response} Response
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

module.exports = {
  StratisError,
  StratisNotFoundError,
  StratisTimeOutError,
  StratisNotAuthorizedError,
  StratisNotAuthorizedReloadError,
}
