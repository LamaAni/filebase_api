const { Request, Response, NextFunction } = require('express/index')
const { assert, path_stat } = require('../common')
const { CacheDictionary } = require('./collections')

/**
 * @typedef {import('./interfaces').StratisApiMethod} StratisApiMethod
 * @typedef {import('./stratis').Stratis} Stratis
 * @typedef {import('./collections').CacheDictionaryOptions} CacheDictionaryOptions
 */

/**
 * The type of code object. See documentation in readme.
 * @typedef {"API_METHOD" | "PUSH_NOTIFICATION" | "TEMPLATE_ARG" | "REQUEST_HANDLER" | "IGNORE"} StratisCodeObjectTypeEnum
 */

class StratisCodeObject {
  /**
   * A code object to be used in the file api environment.
   * @param {Object} param0
   * @param {any} param0.val
   * @param {StratisCodeObjectTypeEnum } param0.type
   * @param {string} param0.name The name to use, (overrides module key)
   */
  constructor({ val, type = null, name = null } = {}) {
    this.name = name
    /**
     * The request object type
     * @type {StratisCodeObjectTypeEnum}
     */
    this.type = type || StratisCodeObject.auto_detect_type(val)
    this.val = val
  }

  /**
   * @param {any} val
   * @returns {"API_METHOD" | "TEMPLATE_ARG" | "IGNORE" }
   */
  static auto_detect_type(val) {
    return typeof val == 'function' ? 'API_METHOD' : 'TEMPLATE_ARG'
  }

  /**
   *
   * @param {[StratisCodeObject]} lst
   * @returns {Object<string,any>}
   */
  static to_key_value_object(lst) {
    const o = {}
    for (let v of lst) o[v.name] = v.val
    return o
  }
}

class StratisCodeModule {
  /**
   * @param {string} codefile
   */
  constructor(codefile) {
    this.codefile = codefile
    /** @type {Date} */
    this._last_loaded = null
    /** @type {number} */
    this._last_codefile_change_ms = null

    /**
     * @type {Object<string,StratisCodeObject>}
     */
    this._code_objects = {}

    /**
     * @type {Object}
     */
    this._module = {}
  }

  get code_objects() {
    return this._code_objects
  }

  get module() {
    return this.module
  }

  /**
   * @param {number} reload_interval The interval in which to reload the code module.
   * @returns {boolean} If true has been loaded. Otherwise cache was used.
   */
  async load(reload_interval = 1000) {
    // checking if needs loading.
    const elapsed_since_last_loaded =
      this._last_loaded == null ? Infinity : new Date() - this._last_loaded

    // check skip reload check.
    if (elapsed_since_last_loaded < reload_interval) return

    const stats = await path_stat(this.codefile)

    if (stats == null) {
      this.module = {}
      this._last_codefile_change_ms = null
    } else if (stats.mtime != this._last_codefile_change_ms) {
      this._last_codefile_change_ms = stats.mtime
      this._module = require(this.codefile)
    }

    code_objects = {}

    for (let key of this._module) {
      /** @type {StratisCodeObject} */
      let code_object = this._module[key]
      if (!code_object instanceof StratisCodeObject)
        code_object = new StratisCodeObject({ val: code_object, name: key })
      else {
        // assign the key as name if not defined.
        code_object.name = code_object.name || key
      }
      code_objects[this.code_objects.name] = code_object
    }

    this._code_objects = this.code_objects
    this._last_loaded = new Date()
  }
}

/**
 * @typedef {Object} StratisCodeModuleBankOptionsExtend
 * @property {number} reload_module_interval The interval in which to try and reload an existing module.
 * requires file system stats check.
 * @typedef {CacheDictionaryOptions & StratisCodeModuleBankOptionsExtend} StratisCodeModuleBankOptions
 */

class StratisCodeModuleBank extends CacheDictionary {
  /**
   * Holds code rendering and loading bank for code files.
   * Changes in the files cause reload of the file cache.
   * @param {Stratis} stratis
   * @param {StratisCodeModuleBankOptions} options
   */
  constructor(
    stratis,
    {
      interval = 1000,
      cache_clean_interval = 10000,
      reset_cache_timestamp_on_get = true,
      reload_module_interval = 1000,
    } = {}
  ) {
    super({
      interval,
      cleaning_interval,
      reset_cache_timestamp_on_get,
    })

    this.stratis = stratis
    this.reload_module_interval = reload_module_interval
  }

  get bank() {
    return this._bank
  }

  /**
   * Returns a code module from a codefile path.
   * @param {string} codefile
   */
  async load(codefile) {
    /**
     * @type {StratisCodeModule}
     */
    let code_module = this.get(codefile)
    if (code_module == null) {
      code_module = new StratisCodeModule(codefile)
      this.set(codefile, code_module)
    }

    await code_module.load(this.reload_module_interval)
    return code_module
  }
}

module.exports = {
  StratisCodeModule,
  StratisCodeModuleBank,
  StratisCodeObject,
  StratisCodeObjectTypeEnum,
}
