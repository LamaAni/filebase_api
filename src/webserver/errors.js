/**
 * @typedef {import('express').Response} Response
 **/

class StratisError extends Error {
  get http_response_code() {
    return 500
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

class StratisTimeOutError extends StratisError {
  get http_response_code() {
    return 408
  }
}

module.exports = {
  StratisError,
  StratisNotFoundError,
  StratisTimeOutError,
}
