const express = require('express')
const {
  Stratis,
  StratisOptions,
  StratisRequestInfo,
  StratisCodeObject,
  StratisRequestHandler,
  as_stratis_method,
  as_stratis_template_arg,
} = require('./stratis')
const websocket = require('./websocket')

module.exports = {
  websocket,
  Stratis,
  StratisOptions,
  StratisRequestInfo,
  StratisCodeObject,
  StratisRequestHandler,
  as_stratis_template_arg,
  as_stratis_method,
}
