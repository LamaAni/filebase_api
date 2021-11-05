const ejs = require('ejs')
const { assert, path_stat, deep_merge_objects } = require('../common')
const { CacheDictionary } = require('./collections')
const fs = require('fs')

/**
 * @typedef {import('./stratis').Stratis} Stratis
 * @typedef {import('./collections').CacheDictionaryOptions} CacheDictionaryOptions
 */

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

class StratisEJSTemplateRenderContext {
  constructor(data = {}) {
    this.invoked_templates = new Set()
    this.data_overrides = {}
    this.data = data
  }
}

class StratisEJSTemplate {
  /**
   * Represents a stratis template file
   * @param {StratisEJSTemplateBank} bank
   * @param {string} template_filepath
   */
  constructor(bank, template_filepath) {
    this.template_filepath = template_filepath
    this._bank = bank

    /** @type {Date} */
    this._last_compiled = null
    /** @type {number} */
    this._last_file_change_ms = null

    this._render = null
  }

  /**
   * Holds the cache bank for stratis ejs templates.
   */
  get bank() {
    return this._bank
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

    const template_string = await fs.promises.readFile(
      this.template_filepath,
      'utf-8'
    )
    this._render = ejs.compile(template_string, {
      context: this,
    })
  }

  /**
   * Renders the template. Will compile the template if needed.
   * @param {ejs.Data} data The ejs render data to add as template parameters.
   * @param {number} recompile_interval The interval in which to check changes in the file
   * @param {StratisEJSTemplateRenderContext} context The active render context.
   * and recompile if needed.
   * @returns
   */
  async render(data = {}, recompile_interval = 1000, context = null) {
    context = context || this.bank.create_render_context(data)
    await this.compile(recompile_interval)

    let code_module_data = {}

    if (this.bank.stratis != null) {
      let code_module = await this.bank.stratis.code_module_bank.load(
        this.bank.stratis.compose_codefile_path(this.template_filepath)
      )
      code_module_data = code_module.as_ejs_render_data()
    }

    const render_data = deep_merge_objects(
      {},
      code_module_data,
      context.data,
      data,
      context.data_overrides
    )

    return await this._render(render_data)
  }
}

/**
 * @typedef {Object} StratisEJSTemplateBankOptionsExtend
 * @property {number} reload_template_interval The interval in which to try and reload an existing module.
 * requires file system stats check.
 * @typedef {CacheDictionaryOptions & StratisEJSTemplateBankOptionsExtend} StratisEJSTemplateBankOptions
 */

const STRATIS_EJS_TEMPLATE_BANK_DEFAULT_OPTIONS = {
  cleaning_interval: 10000,
  interval: 1000,
  reload_template_interval: 1000,
  reset_cache_timestamp_on_get: true,
}

class StratisEJSTemplateBank {
  /**
   * Defines an ejs template bank to load templates from.
   * @param {Stratis} stratis
   * @param {StratisEJSTemplateBankOptions} options
   */
  constructor(
    stratis,
    {
      cleaning_interval = 10000,
      interval = 1000,
      reload_template_interval = 1000,
      reset_cache_timestamp_on_get = true,
    } = {}
  ) {
    this._stratis = stratis
    this.reload_template_interval = reload_template_interval
    this._cache = new CacheDictionary({
      interval,
      cleaning_interval,
      reset_cache_timestamp_on_get,
    })
  }

  get cache() {
    return this._cache
  }

  get stratis() {
    return this._stratis
  }

  create_render_context(data = {}) {
    const render_context = new StratisEJSTemplateRenderContext(data)

    render_context.data_overrides['include'] = (template_filepath) => {
      return this.load(template_filepath).render(
        render_context.data,
        this.recompile_interval,
        render_context
      )
    }

    return render_context
  }

  /**
   * Loads the stratis ejs template and returns it. Will use cache if possible.
   * @param {string} template_filepath The path to the template file
   * @param {boolean} no_cache Do not use cache.
   * @returns {StratisEJSTemplate} The template
   */
  load(template_filepath, no_cache = false) {
    /**
     * @type {StratisEJSTemplate}
     */
    let template = no_cache ? null : this.cache.get(template_filepath)
    if (template == null) {
      template = new StratisEJSTemplate(this, template_filepath)
      this.cache.set(template_filepath, template)
    }

    return template
  }

  /**
   *
   * @param {string} template_filepath The path to the template to render.
   * @param {ejs.Data} data The template render data
   * @returns
   */
  async render(template_filepath, data = {}) {
    return await this.load(template_filepath).render(data)
  }
}

module.exports = {
  StratisEJSOptions: STRATIS_EJS_DEFAULT_OPTIONS,
  StratisEJSTemplateBankOptions: STRATIS_EJS_TEMPLATE_BANK_DEFAULT_OPTIONS,
  StratisEJSTemplateBank,
  StratisEJSTemplateRenderContext,
}
