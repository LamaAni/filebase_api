const path = require('path')

/**
 * @type {import('./stratis').StratisLoggingOptions} The page options
 */
const DEFAULT_LOGGING_OPTIONS = {
  logger: console,
}

/**
 * @type {import('./stratis').StratisPageOptions} The page options
 */
const DEFAULT_PAGE_OPTIONS = {
  page_extensions: ['.html', '.htm', '.css', '.json', '.yaml'],
  timeout: 1000 * 60,
}

/**
 * @type {import('./stratis').StratisSessionOptions} The page options
 */
const DEFAULT_SESSION_OPTIONS = {}

/**
 * @type {import('./stratis').StratisTemplateOptions} The page options
 */
const DEFAULT_TEMPLATE_OPTIONS = {
  add_require: true,
  codefile_extension: '.code.js',
}

/**
 * @type {import('./stratis').StratisEJSTemplateBankOptions} The page options
 */
const DEFAULT_TEMPLATE_BANK_OPTIONS = {}

/**
 * @type {import('./stratis').StratisMiddlewareOptions} The page options
 */
const DEFAULT_MIDDLEWARE_OPTIONS = {}

/**
 * @type {import('./stratis').StratisClientSideApiOptions} The page options
 */
const DEFAULT_CLIENT_API_OPTIONS = {
  api_code_path: path.join(__dirname, 'clientside.js'),
  timeout: 1000 * 60,
}

/**
 * @type {import('./stratis').StratisCodeModuleBankOptions} The page options
 */
const DEFAULT_CODE_MODULE_BANK_OPTIONS = {}

module.exports = {
  DEFAULT_PAGE_OPTIONS,
  DEFAULT_LOGGING_OPTIONS,
  DEFAULT_SESSION_OPTIONS,
  DEFAULT_MIDDLEWARE_OPTIONS,
  DEFAULT_TEMPLATE_OPTIONS,
  DEFAULT_TEMPLATE_BANK_OPTIONS,
  DEFAULT_CODE_MODULE_BANK_OPTIONS,
  DEFAULT_CLIENT_API_OPTIONS,
}
