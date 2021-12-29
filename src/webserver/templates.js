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
   * @param {StratisEJSTemplate} template The rendering template.
   * @param {StratisEJSTemplateRenderContext} page_render_context The parent template of the original call
   * (In a page this would be the page template even for nested views)
   */
  constructor(data = {}, template = null, page_render_context = null) {
    this._template = template
    this._page_render_context = page_render_context
    this._data = data
  }

  /**
   * The active template.
   * @type {StratisEJSTemplate}
   */
  get template() {
    return this._template
  }

  /**
   * The page template.
   * @type {StratisEJSTemplate}
   */
  get page_template() {
    return this._page_render_context || this.template
  }

  /**
   * The page template.
   * @type {StratisEJSTemplate}
   */
  get page_context() {
    return this._page_render_context || this
  }

  /**
   * This is the main page (entry) template.
   */
  get is_page() {
    return this.page_context == this
  }

  /**
   * The added template data.
   */
  get data() {
    return this._data
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
   * @param {{}} data The template data to add.
   */
  async include(fpath, data = null) {
    assert(
      data == null || typeof data == 'object',
      'Template render data must be an object dictionary {}'
    )
    assert(typeof fpath == 'string', 'Include filepath must be a string')

    fpath = this.resolve_template_relative_path(fpath)

    const template = this.template_bank.load(fpath)
    const context = new StratisEJSTemplateRenderContext(
      Object.assign({}, this.data, data || {}),
      template,
      this.page_template || this
    )

    // render in the current context.
    const include_result = await template.render(
      await context.get_ejs_render_data()
    )

    // // reassign the calling template.
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
   * Template method. Renders the file api script tag.
   * @param {string} api_name The name of the api to use. Defaults
   * to name of the file.
   */
  render_stratis_script_tag(api_name = null) {
    const url_path = this.is_page
      ? path.basename(this.template.template_filepath)
      : path.relative(
          path.dirname(this.page_template.template_filepath),
          this.template.template_filepath
        )

    api_name =
      api_name || this.is_page
        ? 'stratis'
        : path
            .basename(this.template.template_filepath)
            .replace(/\.[^/.]+$/, '') // remove extension
            .replace(/[^\w]/g, '_') // replace api name

    const api_path = `${url_path}/render_stratis_browser_api_script`

    const api_query = Object.entries({
      api_name,
      websocket_path: url_path,
    })
      .map((e) => `${e[0]}=${encodeURIComponent(e[1])}`)
      .join('&')

    return `<script lang="javascript" src='${api_path}?${api_query}'></script>`
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

    const template_require = (...args) => this.template_require(...args)

    return Object.assign(
      {},
      this.data || {},
      {
        include: async (...args) => await this.include(...args),
        require: this.stratis.template_options.add_require
          ? template_require
          : null,
        __dirname: path.dirname(this.template.template_filepath),
        __filename: this.template.template_filepath,
        render_stratis_script_tag: (...args) =>
          this.render_stratis_script_tag(...args),
      },
      code_modules
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

    const render_options = Object.assign({}, this.stratis.template_options, {
      context: this,
      async: true,
    })

    this._render = ejs.compile(template_string, render_options)
  }

  /**
   * Renders the template. Will compile the template if needed.
   * @param {ejs.Data} context The active render context.
   * @returns
   */
  async render(data) {
    await this.compile()
    try {
      return await this._render(data || {})
    } catch (err) {
      const render_error = `Error rendering template @ ${this.template_filepath}`
      if (err.message != null) {
        err.message = `${render_error}: ${err.message}`
        throw err
      } else {
        throw new Error(`${render_error}: ${err}`)
      }
    }
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
    const template = await this.load(template_filepath)

    if (context == null) context = {}
    else if (context instanceof StratisEJSTemplateRenderContext)
      context = Object.assign({}, context.data)
    else
      assert(
        typeof context == 'object',
        'The context must be an object or StratisEJSTemplateRenderContext'
      )

    const render_context = new StratisEJSTemplateRenderContext(
      context,
      template
    )

    return template.render(await render_context.get_ejs_render_data())
  }
}

module.exports = {
  StratisEJSOptions: STRATIS_EJS_DEFAULT_OPTIONS,
  StratisEJSTemplateBankOptions: STRATIS_EJS_TEMPLATE_BANK_DEFAULT_OPTIONS,
  StratisEJSTemplateBank,
  StratisEJSTemplateRenderContext,
}
