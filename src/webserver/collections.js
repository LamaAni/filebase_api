/**
 * @typedef {Object} CacheDictionaryOptions
 * @property {number} interval The interval for cache cleaning [ms]
 * @property {number} cleaning_interval The interval for which to invoke the cache cleaning for all keys.
 * if zero or less invokes on every get call.
 * @property {bool} reset_cache_timestamp_on_get If true, when call call to get is made then
 * will reset the item cache stamp. Extends the cache keep time.
 */

class CachedDictionaryItem {
  constructor(key, value) {
    this.key = key
    this.value = value
    this.reset_cache_timestamp()
  }

  /**
   * The elapsed time in ms.
   */
  get elapsed() {
    if (this.timestamp == null) this.reset_cache_timestamp()
    return new Date() - this.timestamp
  }

  reset_cache_timestamp() {
    this.timestamp = new Date()
  }
}

class CacheDictionary {
  /**
   * Creates a cached key dictionary.
   * @param {CacheDictionaryOptions} param0
   */
  constructor({
    interval = 10000,
    cleaning_interval = 60000,
    reset_cache_timestamp_on_get = true,
  } = {}) {
    this.interval = interval
    this.cleaning_interval = cleaning_interval
    this.reset_cache_timestamp_on_get = reset_cache_timestamp_on_get

    /**
     * @type {Object<any, CachedDictionaryItem>}
     */
    this._dict = {}
  }

  /**
   * @param {any} key
   * @returns {CachedDictionaryItem}
   */
  _get_item(key) {
    return this._dict[key]
  }

  /**
   * @param {any} key
   * @returns {CachedDictionaryItem}
   */
  get_item(key) {
    this.clean_cache()
    return this.get_item(key)
  }

  /**
   * Get a value for a key. If cache interval elapsed would return null.
   * @param {any} key
   * @returns {any} The value.
   */
  get(key) {
    this.clean_cache()
    const item = this._get_item(key)
    if (item == null) return null
    if (this.reset_cache_timestamp_on_get) item.reset_cache_timestamp()
    return item.value
  }

  /**
   * Sets the key/value pair.
   * @param {any} key
   * @param {*} value
   */
  set(key, value) {
    this._dict[key] = new CachedDictionaryItem(key, value)
  }

  /**
   * Delete a key and value.
   * @param {any} key
   */
  delete(key) {
    delete this._dict[key]
  }

  clean_cache() {
    const elapsed_since_last_clean =
      this.__last_cache_clean == null
        ? Infinity
        : new Date() - this.__last_cache_clean

    if (elapsed_since_last_clean < this.cleaning_interval) return

    this.__last_cache_clean = new Date()

    for (let key of Object.keys(this._dict)) {
      const item = this._get_item(key)
      if (item == null) continue
      if (item.elapsed > this.interval) delete this._dict[key]
    }
  }
}

module.exports = {
  CacheDictionary,
  CachedDictionaryItem,
  /** @type {CacheDictionaryOptions} */
  CacheDictionaryOptions: {},
}
