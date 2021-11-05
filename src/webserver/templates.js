const ejs = require('ejs')
const { assert, path_stat } = require('../common')

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
    /** @type {number} */
    this._last_file_change_ms = null

    this._compiled_ejs_template = null
  }

  /**
   * Compile the stratis template
   * @param {number} recompile_interval The interval in which to check changes in the file
   * and recompile if needed.
   */
  async compile(recompile_interval = 1000) {
    const elapsed_since_last_compiled =
      this._last_compiled == null ? Infinity : new Date() - this._last_compiled

    if (elapsed_since_last_compiled < recompile_interval) return

    const stats = await path_stat(this.template_filepath)
    assert(stats != null, `Template file ${this.template_filepath} not found.`)

    this._compiled_ejs_template = ejs.compile()
  }
}

module.exports = {
  StratisEJSOptions: STRATIS_EJS_DEFAULT_OPTIONS,
  StratisEJSTemplate,
}
