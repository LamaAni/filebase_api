const {
  milliseconds_utc_since_epoc,
  value_from_object_path,
} = require('../../common')

const { parse_barer_token } = require('./common')

/**
 * @typedef {import('./provider').StratisOAuth2Provider} StratisOAuth2Provider
 * @typedef {import('./interfaces').StratisOAuth2ProviderSessionParams} StratisOAuth2ProviderSessionParams
 */

class StratisOAuth2ProviderSession {
  /**
   * The current session for the stratis authentication provider.
   * @param {StratisOAuth2Provider} provider
   * @param {Request} req the http request
   * @param {StratisOAuth2ProviderSessionParams} session_params
   */
  constructor(provider, req, session_params = null) {
    this._provider = provider
    /** @type {StratisOAuth2ProviderSessionParams} */
    this.params = session_params || {}
    this._req = req
    this.is_bearer_token = false
    this.is_session_state = false
  }

  get req() {
    return this._req
  }

  get provider() {
    return this._provider
  }

  /**
   * Short id for the token, if any.
   */
  get token_id() {
    return this.access_token == null
      ? '??????'
      : this.access_token.substring(0, 6)
  }

  get token_info() {
    return this.params.token_info || {}
  }

  /**
   * @type {string}
   */
  get access_token() {
    /** @type {StratisOAuth2ProviderSessionParams} */
    const params = this.params || {}
    return params.access_token
  }

  /**
   * @type {string} The refresh token
   */
  get refresh_token() {
    return (this.params || {}).refresh_token
  }

  /**
   * @type {string}
   */
  get username() {
    if (this.params == null || this.params.token_info == null)
      return 'Anonymous'
    if (this.params.token_info._username == null) {
      this.token_info._username =
        this.provider.username_from_token_info_path
          .map((p) => value_from_object_path(this.params.token_info, p))
          .filter((v) => v != null)[0] || 'Anonymous'
    }
    return this.params.token_info._username
  }

  get has_token_info() {
    return this.params.token_info != null
  }

  get is_authenticated() {
    return this.params.access_token != null && this.params.authenticated != null
  }

  get is_elapsed() {
    // barer tokens cannot be elapsed, since the timeout they have
    // is dependent on the backend Oauth2 provider.
    if (this.is_bearer_token) return false

    return (
      milliseconds_utc_since_epoc() - (this.params.authenticated || 0) >=
      (this.provider.expires_in || Infinity)
    )
  }

  get is_active() {
    return this.token_info.active == true
  }

  get is_access_granted() {
    if (!this.is_authenticated) return false
    if (!this.is_active) return false
    if (this.is_elapsed) return false
    return true
  }

  needs_access_token_validation() {
    if (this.is_elapsed) return false

    // if no token info needs validation.
    if (!this.has_token_info || this.params.authenticated == null) return true

    const elapsed_since_last_recheck =
      milliseconds_utc_since_epoc() - (this.params.authenticated || 0)

    return (
      elapsed_since_last_recheck >= (this.provider.recheck_interval || Infinity)
    )
  }

  /**
   * Authenticate the current access token, and mark the authenticated timestamp.
   * @param {Object} token_response The authenticated access token
   */
  async authenticate(
    {
      access_token,
      scope = null,
      refresh_token = null,
      id_token = null,
      token_type = null,
    },
    save = true
  ) {
    Object.entries({
      access_token,
      scope,
      refresh_token,
      token_type,
      id_token,
    })
      .filter((e) => e[1] != null)
      .forEach((e) => {
        this.params[e[0]] = e[1]
      })

    this.params.authenticated = milliseconds_utc_since_epoc()

    if (save) await this.save()
  }

  /**
   * Save the current state if needed.
   */
  async save() {
    this.params.updated = milliseconds_utc_since_epoc()
    if (this.is_session_state)
      this.req.session[this.provider.session_key] = this.params
    if (this.is_bearer_token && this.access_token != null)
      this.provider.token_cache_bank.set(this.access_token, this.params)
  }

  /**
   * Loads the OAuth provider session from the request.
   * @param {StratisOAuth2Provider} provider The provider
   * @param {Request} req The request object.
   * @param {string} barer_token The bearer token to load from
   */
  static async load(provider, req, barer_token = null) {
    const session_value = (req.session || {})[provider.session_key] || {}
    barer_token = barer_token || parse_barer_token(req)
    const oauth_session = new StratisOAuth2ProviderSession(provider, req)

    // assume that if there is a bearer token then use it.
    if (barer_token != null) {
      // Loading the barer token params from the cache bank if needed.
      oauth_session.params = provider.token_cache_bank.get(barer_token) || {
        access_token: barer_token,
      }
      oauth_session.is_bearer_token = true
    } else if (req.session != null)
      try {
        oauth_session.params =
          typeof session_value == 'string'
            ? JSON.parse(session_value)
            : session_value
        oauth_session.is_session_state = true
      } catch (err) {
        throw new Error('Could not parse stratis oauth2 session value')
      }

    return oauth_session
  }

  /**
   * Sends a request to the service for updating the token info.
   */
  async update() {
    // nothing to do. No access token.
    if (this.access_token == null) return false
    // If an introspect url was not provided here, we cannot update the token (ever)
    if (this.provider.requests.introspect_url == null) return false

    if (this.needs_access_token_validation()) {
      this.params.token_info = await this.provider.requests.introspect(
        this.access_token
      )

      if (!this.is_active && this.refresh_token != null) {
        // attempting to re authenticate
        let refresh_token_info = null
        try {
          refresh_token_info =
            await this.provider.requests.get_token_from_refresh_token(
              this.refresh_token
            )
        } catch (err) {}

        if (refresh_token_info) {
          await this.authenticate(refresh_token_info, false)
          return await this.update()
        }
      }

      await this.authenticate(
        Object.assign({}, this.params.token_response, {
          access_token: this.access_token,
        }),
        false
      )

      // save the changes.
      await this.save()

      this.provider.logger.debug(
        `Authentication info updated for ${this.username}. (TID: ${
          this.token_id
        }, Access ${this.is_access_granted ? 'GRANTED' : 'DENIED'})`
      )

      return true
    } else return false
  }

  /**
   * Clear the current authentication.
   */
  async clear() {
    this.params = {}
    await this.save()
  }
}

module.exports = {
  StratisOAuth2ProviderSession,
}
