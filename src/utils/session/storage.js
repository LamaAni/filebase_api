const { StratisSessionStorageProvider } = require('./storage/core')
/**
 * Create a new cookie session middleware.
 * @typedef {import('./storage/core').StratisSessionStorageProviderOptions} StratisSessionStorageProviderOptions
 * @typedef {'etcd'|'cookie'} StratisSessionStorageProviderType
 */

/** @type {Object.<string, typeof StratisSessionStorageProvider>} */
const StratisSessionStorageProvidersByType = {
  cookie: require('./storage/cookie').StratisSessionCookieStorageProvider,
  etcd: require('./storage/etcd').StratisSessionEtcdStorageProvider,
}

/**
 * @param {StratisSessionStorageProviderType} type_name
 */
function from_storage_type_name(type_name) {
  if (StratisSessionStorageProvidersByType[type_name] == null)
    throw new Error('Could not find storage provider of type ' + type_name)

  return StratisSessionStorageProvidersByType[type_name]
}

module.exports = {
  StratisSessionStorageProvidersByType,
  from_storage_type_name,
  ...require('./storage/core'),
  ...require('./storage/cookie'),
  ...require('./storage/etcd'),
}
