const ejs = require('ejs')

/**
 * @typedef {Object} StratisEJSOptionsExtension
 * @property {bool} require If true, add stratis (special) require to the ejs rendering
 * @property {bool} environment A dictionary of key/value pairs to add to the ejs environment.
 * Will overwrite any api_method!
 *
 * @typedef {ejs.Options & StratisEJSOptionsExtension} StratisEJSOptions
 */

/**
 * @type {StratisEJSOptions}
 */
const STRATIS_EJS_DEFAULT_OPTIONS = {
  require: true,
  environment: {},
  cache: false,
}

class StratisEJSTemplate {
  /**
   * Represents a stratis template file
   * @param {string} template_filepath
   */
  constructor(template_filepath) {
    this.template_filepath = template_filepath
    /** @type {Date} */
    this._last_compiled = null
  }

  /**
   * Compile the stratis template.
   * @param {number} recompile_interval
   */
  async compile(recompile_interval) {}
}

module.exports = {
  StratisEJSOptions: STRATIS_EJS_DEFAULT_OPTIONS,
  StratisEJSTemplate,
}
