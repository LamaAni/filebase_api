const ejs = require('ejs')
const { assert, path_stat, deep_merge_objects } = require('../common')
const { CacheDictionary } = require('./collections')
const { StratisNotFoundError } = require('./errors')
const fs = require('fs')
const path = require('path')

// adding string functions
require('./templates.strings.js')

/**
 * @typedef {import('./stratis').Stratis} Stratis
 * @typedef {import('./collections').CacheDictionaryOptions} CacheDictionaryOptions
 */

/**
 * @typedef {Object} StratisEJSOptionsExtension
 * @property {bool} add_require If true, add stratis (special) require to the ejs rendering
 * @property {{}} environment A dictionary of key/value pairs to add to the ejs environment.
 * Will overwrite any api_method!
 *
 * @typedef {ejs.Options & StratisEJSOptionsExtension} StratisEJSOptions
 */

/**
 * @type {StratisEJSOptions}
 */
const STRATIS_EJS_DEFAULT_OPTIONS = {
  add_require: true,
  environment: {},
  cache: false,
}

class StratisEJSTemplateRenderContext {
  /**
   * Holds the the render context data and methods.
   * @param {ejs.Data} data The template data (as dictionary)
   * @param {ejs.Data} overridable_data A data object to serve as a base for the
   * merge of all data. Will be override by any method or data value.
   */
  constructor(data = {}, overridable_data = {}) {
    this._template = null
    this._data = data
    this._overridable_data = overridable_data
  }

  /**
   * The active template.
   * @type {StratisEJSTemplate}
   */
  get template() {
    return this._template
  }

  /**
   * The added template data.
   */
  get data() {
    return this._data
  }

  get overridable_data() {
    return this._overridable_data
  }

  /**
   * The template bank.
   */
  get template_bank() {
    return this.template.bank
  }

  /**
   * The stratis api.
   */
  get stratis() {
    return this.template.stratis
  }

  /**
   * @param {string} rpath
   * @returns The template relative path
   */
  resolve_template_relative_path(rpath) {
    rpath = rpath.trim()
    if (!path.isAbsolute(rpath)) {
      const current_template_path = path.dirname(
        this.template.template_filepath
      )
      rpath = path.resolve(path.join(current_template_path, rpath))
    }
    return rpath
  }

  /**
   * Includes another template for the current template filepath.
   * @param {string} fpath The path to include
   */
  async include(fpath) {
    assert(typeof fpath == 'string', 'Include filepath must be a string')
    fpath = this.resolve_template_relative_path(fpath)

    const calling_template = this.template
    const include_result = await this.template_bank.render(fpath, this)
    this.assign_template(calling_template)
    return include_result
  }

  /**
   * @param {string} pkg The package to require
   */
  template_require(pkg) {
    const pkg_path =
      pkg.startsWith('.') || pkg.startsWith('/')
        ? this.resolve_template_relative_path(pkg)
        : pkg
    return require(pkg_path)
  }

  /**
   * Assign the current executing template.
   * @param {StratisEJSTemplate} template The template to prepare.
   */
  assign_template(template) {
    this._template = template
  }

  /**
   * Prepares and returns the EJS data objects
   * @returns {ejs.Data} The data to include in the template render.
   */
  async get_ejs_render_data() {
    let code_modules = {}
    if (this.template.stratis != null)
      code_modules = (
        await this.template.stratis.code_module_bank.load(
          this.template.stratis.compose_codefile_path(
            this.template.template_filepath
          )
        )
      ).as_render_objects()

    const include = async (...args) => await this.include(...args)
    const template_require = (...args) => this.template_require(...args)

    return Object.assign(
      {},
      this.overridable_data || {},
      {
        include,
        require: this.stratis.ejs_options.add_require ? template_require : null,
        __dirname: path.dirname(this.template.template_filepath),
        __filename: this.template.template_filepath,
      },
      code_modules,
      this.data || {}
    )
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
   * The stratis api reference.
   */
  get stratis() {
    return this.bank.stratis
  }

  /**
   * @type {number} The template recompile interval.
   */
  get recompile_interval() {
    return this.bank == null
      ? Infinity
      : this.bank.recompile_template_interval || Infinity
  }

  /**
   * Compile the stratis template if needed.
   */
  async compile() {
    const elapsed_since_last_compiled =
      this._last_compiled == null ? Infinity : new Date() - this._last_compiled

    if (elapsed_since_last_compiled < this.recompile_interval) return

    const stats = await path_stat(this.template_filepath)
    assert(
      stats != null,
      new StratisNotFoundError(
        `Template file ${this.template_filepath} not found`
      )
    )

    const template_string = await fs.promises.readFile(
      this.template_filepath,
      'utf-8'
    )

    this._render = ejs.compile(template_string, {
      context: this,
      async: true,
    })
  }

  /**
   * Renders the template. Will compile the template if needed.
   * @param {ejs.Data | StratisEJSTemplateRenderContext} context The active render context.
   * and recompile if needed.
   * @returns
   */
  async render(context = null) {
    await this.compile()

    context =
      context instanceof StratisEJSTemplateRenderContext
        ? context
        : new StratisEJSTemplateRenderContext(context)

    context.assign_template(this)

    const render_data = await context.get_ejs_render_data()
    return await this._render(render_data)
  }
}

/**
 * @typedef {Object} StratisEJSTemplateBankOptionsExtend
 * @property {number} recompile_template_interval The interval in which to try and reload an existing module.
 * requires file system stats check.
 * @typedef {CacheDictionaryOptions & StratisEJSTemplateBankOptionsExtend} StratisEJSTemplateBankOptions
 */

const STRATIS_EJS_TEMPLATE_BANK_DEFAULT_OPTIONS = {
  cleaning_interval: 10000,
  interval: 1000,
  recompile_template_interval: 1000,
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
      recompile_template_interval = 1000,
      reset_cache_timestamp_on_get = true,
    } = {}
  ) {
    this._stratis = stratis
    this.recompile_template_interval = recompile_template_interval
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
   * Render the stratis template from the template objects.
   * @param {string} template_filepath The path to the template to render.
   * @param {ejs.Data | StratisEJSTemplateRenderContext} context Render context. If null then created.
   * @returns
   */
  async render(template_filepath, context = null) {
    return await this.load(template_filepath).render(context)
  }
}

module.exports = {
  StratisEJSOptions: STRATIS_EJS_DEFAULT_OPTIONS,
  StratisEJSTemplateBankOptions: STRATIS_EJS_TEMPLATE_BANK_DEFAULT_OPTIONS,
  StratisEJSTemplateBank,
  StratisEJSTemplateRenderContext,
}
