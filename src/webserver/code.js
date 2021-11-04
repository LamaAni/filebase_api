const { Request, Response, NextFunction } = require('express/index')

/**
 * The type of code object. See documentation in readme.
 * @typedef {"API_METHOD" | "PUSH_NOTIFICATION" | "TEMPLATE_ARG" | "REQUEST_HANDLER" | "IGNORE"} StratisCodeObjectTypeEnum
 */

class StratisCodeObject {
  /**
   * A code object to be used in the file api environment.
   * @param {any} val
   * @param {StratisCodeObjectTypeEnum } type
   * @param {string} name The name to use, (overrides)
   */
  constructor(val, type = null, name = null) {
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

/**
 * Creates a file api function to expose, which will appear on the client side.
 * @param {string} name The name of the Stratis method to expose
 * @param {(...args, req:Request, res: Response, next:NextFunction)} func The exposed function.
 * @returns The file api function
 */
function as_stratis_method(name, func) {
  return new StratisCodeObject(func, 'API_METHOD', name)
}

/**
 * Creates a file api template argument that will appear while rendering.
 * @param {string} name The name of the argument in the template.
 * @param {any} val The value of the argument. Can be a function as well.
 * @returns The Stratis template argument that appears in rendering.
 */
function as_stratis_template_arg(name, val) {
  return new StratisCodeObject(val, 'TEMPLATE_ARG', name)
}

module.exports = {
  StratisCodeObject,
  StratisCodeObjectTypeEnum,
  as_stratis_method,
  as_stratis_template_arg,
}
