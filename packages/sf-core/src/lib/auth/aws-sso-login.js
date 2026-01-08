import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import {
  SSOOIDCClient,
  RegisterClientCommand,
  CreateTokenCommand,
} from '@aws-sdk/client-sso-oidc'
import configWriter from './aws-config-writer.js'
import { AwsLoginBase } from './aws-login-base.js'
import { log, progress, ServerlessError } from '@serverless/util'

const AUTH_GRANT_TYPES = ['authorization_code', 'refresh_token']
const DEFAULT_SCOPE = 'sso:account:access'

/**
 * AWS SSO Login implementation using Authorization Code + PKCE flow.
 * Produces tokens compatible with AWS CLI's ~/.aws/sso/cache format.
 */
export class AwsSsoLogin extends AwsLoginBase {
  constructor(options = {}) {
    super(options)
    this.logger = options.logger || log.get('core-runner:login-aws-sso')
  }

  async login() {
    if (!this.logger.isInteractive()) {
      throw new ServerlessError(
        'The `login aws sso` command requires an interactive environment (TTY) to authenticate.',
        'AWS_SSO_LOGIN_NON_INTERACTIVE',
        { stack: false },
      )
    }

    // 1. Read SSO configuration
    const ssoConfig = this.getSsoConfig()
    const { startUrl, ssoRegion, sessionName, scopes } = ssoConfig

    this.logger.info(`Starting SSO login for ${sessionName || startUrl}`)

    // 2. Generate PKCE
    const { codeVerifier, codeChallenge } = this.generatePKCE()
    const state = crypto.randomUUID()

    // 3. Start local server for OAuth callback
    const { server, port, codePromise } = await this.startLocalServer(state, {
      successTitle: 'SSO Login Successful',
      successContent:
        '<p>You have successfully authenticated with AWS SSO.</p><p>You can close this window and return to the CLI.</p>',
      errorPrefix: 'AWS_SSO',
    })
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`

    // 4. Get or reuse cached client registration
    const registration = await this.getOrRegisterClient(
      ssoRegion,
      startUrl,
      sessionName,
      scopes,
      redirectUri,
    )

    // 5. Build authorization URL
    const authUrl = this.buildAuthorizationUrl(
      ssoRegion,
      registration.clientId,
      redirectUri,
      state,
      codeChallenge,
      scopes,
    )

    // 6. Open browser
    await this.openBrowser(authUrl)

    // 7. Wait for authorization code
    let authCode
    const progressLog = progress.get('aws-sso-login')
    try {
      progressLog.notice('Waiting for SSO login in browser')
      authCode = await codePromise
    } finally {
      progressLog.remove()
      if (server && server.listening) server.close()
    }

    if (!authCode) {
      throw new ServerlessError(
        'Failed to get authorization code',
        'AWS_SSO_LOGIN_NO_CODE',
        { stack: false },
      )
    }

    // 8. Exchange authorization code for token
    const token = await this.createToken(
      ssoRegion,
      registration,
      authCode,
      codeVerifier,
      redirectUri,
    )

    // 9. Save token to cache (AWS CLI compatible format)
    this.saveToken(startUrl, ssoRegion, sessionName, registration, token)

    this.logger.success(
      `Successfully logged in to AWS SSO${sessionName ? ` (session: ${sessionName})` : ''}.`,
    )
  }

  /**
   * Read SSO configuration from ~/.aws/config
   */
  getSsoConfig() {
    const options = this.options
    const profile = options['aws-profile'] || 'default'
    const ssoSessionOption = options['sso-session']
    const configPath = this.getConfigPath()

    const profileSectionName =
      profile === 'default' ? 'default' : `profile ${profile}`

    // Check for sso_session reference in profile
    let ssoSession =
      ssoSessionOption ||
      configWriter.getValue(profileSectionName, 'sso_session', configPath)
    let startUrl, ssoRegion, scopes

    if (ssoSession) {
      // Modern format: [sso-session <name>]
      const sessionSectionName = `sso-session ${ssoSession}`
      startUrl = configWriter.getValue(
        sessionSectionName,
        'sso_start_url',
        configPath,
      )
      ssoRegion = configWriter.getValue(
        sessionSectionName,
        'sso_region',
        configPath,
      )
      const scopesRaw = configWriter.getValue(
        sessionSectionName,
        'sso_registration_scopes',
        configPath,
      )
      if (scopesRaw) {
        scopes = scopesRaw.split(',').map((s) => s.trim())
      }
    } else {
      // Legacy format: sso_start_url and sso_region directly in profile
      startUrl = configWriter.getValue(
        profileSectionName,
        'sso_start_url',
        configPath,
      )
      ssoRegion = configWriter.getValue(
        profileSectionName,
        'sso_region',
        configPath,
      )
    }

    if (!startUrl) {
      throw new ServerlessError(
        `No SSO configuration found. Please run 'aws configure sso' first to set up SSO for ${ssoSession ? `session "${ssoSession}"` : `profile "${profile}"`}.`,
        'AWS_SSO_NOT_CONFIGURED',
        { stack: false },
      )
    }

    if (!ssoRegion) {
      throw new ServerlessError(
        `Missing sso_region in SSO configuration. Please run 'aws configure sso' to complete setup.`,
        'AWS_SSO_MISSING_REGION',
        { stack: false },
      )
    }

    return {
      startUrl,
      ssoRegion,
      sessionName: ssoSession || null,
      scopes: scopes || [DEFAULT_SCOPE],
      profile,
    }
  }

  /**
   * Register client with SSO OIDC service
   */
  async registerClient(ssoRegion, startUrl, sessionName, scopes, redirectUri) {
    const client = new SSOOIDCClient({ region: ssoRegion })

    const clientName = this.generateClientName(sessionName)

    const command = new RegisterClientCommand({
      clientName,
      clientType: 'public',
      grantTypes: AUTH_GRANT_TYPES,
      redirectUris: [this.redirectUriWithoutPort(redirectUri)],
      issuerUrl: startUrl,
      scopes: scopes || [DEFAULT_SCOPE],
    })

    try {
      const response = await client.send(command)

      return {
        clientId: response.clientId,
        clientSecret: response.clientSecret,
        expiresAt: new Date(
          response.clientSecretExpiresAt * 1000,
        ).toISOString(),
        scopes: scopes || [DEFAULT_SCOPE],
        grantTypes: AUTH_GRANT_TYPES,
      }
    } catch (err) {
      throw new ServerlessError(
        `Failed to register SSO client: ${err.message}`,
        'AWS_SSO_REGISTER_CLIENT_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * Get existing registration from cache or register a new client
   */
  async getOrRegisterClient(
    ssoRegion,
    startUrl,
    sessionName,
    scopes,
    redirectUri,
  ) {
    // Try to load cached registration
    const cachedRegistration = this.loadCachedRegistration(
      startUrl,
      ssoRegion,
      sessionName,
      scopes,
    )

    if (
      cachedRegistration &&
      this.isValidAuthCodeRegistration(cachedRegistration)
    ) {
      this.logger.info('Using cached client registration')
      return cachedRegistration
    }

    // Register new client
    this.logger.info('Registering new SSO OIDC client')
    const registration = await this.registerClient(
      ssoRegion,
      startUrl,
      sessionName,
      scopes,
      redirectUri,
    )

    // Save to cache
    this.saveRegistration(
      startUrl,
      ssoRegion,
      sessionName,
      scopes,
      registration,
    )
    return registration
  }

  /**
   * Load cached client registration
   */
  loadCachedRegistration(startUrl, ssoRegion, sessionName, scopes) {
    try {
      const cacheDir = this.getCacheDir()
      const cacheKey = this.registrationCacheKey(
        startUrl,
        ssoRegion,
        sessionName,
        scopes,
      )
      const cacheFile = path.join(cacheDir, `${cacheKey}.json`)

      if (!fs.existsSync(cacheFile)) {
        return null
      }

      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      return data
    } catch (err) {
      this.logger.debug(`Failed to load cached registration: ${err.message}`)
      return null
    }
  }

  /**
   * Check if registration is valid for auth code flow and not expired
   */
  isValidAuthCodeRegistration(registration) {
    if (!registration) return false

    // Check if it has the authorization_code grant type
    const hasAuthCodeGrant =
      registration.grantTypes &&
      Array.isArray(registration.grantTypes) &&
      registration.grantTypes.includes('authorization_code')

    if (!hasAuthCodeGrant) {
      this.logger.debug(
        'Cached registration does not have authorization_code grant',
      )
      return false
    }

    // Check if expired
    if (!registration.expiresAt) {
      return false
    }

    const expiresAt = new Date(registration.expiresAt)
    const now = new Date()

    if (expiresAt <= now) {
      this.logger.debug('Cached registration is expired')
      return false
    }

    return true
  }

  /**
   * Build the SSO OIDC authorization URL
   */
  buildAuthorizationUrl(
    ssoRegion,
    clientId,
    redirectUri,
    state,
    codeChallenge,
    scopes,
  ) {
    const baseEndpoint = `https://oidc.${ssoRegion}.amazonaws.com`

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state,
      code_challenge_method: 'S256',
      scopes: (scopes || [DEFAULT_SCOPE]).join(' '),
    })

    // Append code_challenge without the trailing '=' padding
    const codeChallengeParam = codeChallenge.replace(/=+$/, '')

    return `${baseEndpoint}/authorize?${params.toString()}&code_challenge=${codeChallengeParam}`
  }

  /**
   * Exchange authorization code for token
   */
  async createToken(
    ssoRegion,
    registration,
    authCode,
    codeVerifier,
    redirectUri,
  ) {
    const client = new SSOOIDCClient({ region: ssoRegion })

    const command = new CreateTokenCommand({
      grantType: 'authorization_code',
      clientId: registration.clientId,
      clientSecret: registration.clientSecret,
      redirectUri: redirectUri,
      codeVerifier: codeVerifier,
      code: authCode,
    })

    try {
      const response = await client.send(command)

      return {
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        refreshToken: response.refreshToken,
        tokenType: response.tokenType,
      }
    } catch (err) {
      throw new ServerlessError(
        `Failed to get SSO token: ${err.message}`,
        'AWS_SSO_CREATE_TOKEN_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * Save registration to cache (AWS CLI compatible)
   */
  saveRegistration(startUrl, ssoRegion, sessionName, scopes, registration) {
    const cacheDir = this.getCacheDir()
    const cacheKey = this.registrationCacheKey(
      startUrl,
      ssoRegion,
      sessionName,
      scopes,
    )
    const cacheFile = path.join(cacheDir, `${cacheKey}.json`)

    const data = {
      clientId: registration.clientId,
      clientSecret: registration.clientSecret,
      expiresAt: registration.expiresAt,
      scopes: registration.scopes,
      grantTypes: registration.grantTypes,
    }

    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2))
    fs.chmodSync(cacheFile, 0o600)
  }

  /**
   * Save token to cache (AWS CLI compatible format)
   */
  saveToken(startUrl, ssoRegion, sessionName, registration, token) {
    const cacheDir = this.getCacheDir()
    const cacheKey = this.tokenCacheKey(startUrl, sessionName)
    const cacheFile = path.join(cacheDir, `${cacheKey}.json`)

    const expiresAt = new Date(Date.now() + token.expiresIn * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z')

    const data = {
      startUrl,
      region: ssoRegion,
      accessToken: token.accessToken,
      expiresAt,
      clientId: registration.clientId,
      clientSecret: registration.clientSecret,
      registrationExpiresAt: registration.expiresAt,
    }

    if (token.refreshToken) {
      data.refreshToken = token.refreshToken
    }

    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2))
    fs.chmodSync(cacheFile, 0o600)
  }

  /**
   * Get SSO cache directory
   */
  getCacheDir() {
    const homeDir = os.homedir()
    const cacheDir = path.join(homeDir, '.aws', 'sso', 'cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    return cacheDir
  }

  /**
   * Generate registration cache key (AWS CLI compatible)
   * Keys must be sorted alphabetically to match Python's json.dumps(sort_keys=True)
   * JSON must use Python's default separators (', ' and ': ') not JavaScript's (',' and ':')
   */
  registrationCacheKey(startUrl, ssoRegion, sessionName, scopes) {
    const args = {
      region: ssoRegion,
      scopes: scopes,
      session_name: sessionName,
      startUrl: startUrl,
      tool: 'botocore',
    }
    // Sort keys alphabetically to match Python's json.dumps(sort_keys=True)
    const sortedArgs = Object.fromEntries(
      Object.entries(args).sort(([a], [b]) => a.localeCompare(b)),
    )
    // Python's json.dumps uses ': ' (colon + space) as separator, not ':' alone
    const cacheArgs = this.jsonStringifyPythonCompat(sortedArgs)
    return crypto.createHash('sha1').update(cacheArgs).digest('hex')
  }

  /**
   * Serialize object to JSON matching Python's json.dumps() format
   * Python uses ': ' (with space) after keys and ', ' (with space) between elements
   * Must not modify colons/commas inside string values
   */
  jsonStringifyPythonCompat(obj) {
    return JSON.stringify(obj)
      .replace(/":("|[\[{])/g, '": $1') // Add space after colon before value
      .replace(/("|[\]}]),/g, '$1, ') // Add space after comma before next element
  }

  /**
   * Generate token cache key (AWS CLI compatible)
   */
  tokenCacheKey(startUrl, sessionName) {
    const inputStr = sessionName || startUrl
    return crypto.createHash('sha1').update(inputStr).digest('hex')
  }

  /**
   * Generate unique client name
   */
  generateClientName(sessionName) {
    if (sessionName) {
      return `botocore-client-${sessionName}`
    }
    const timestamp = Math.floor(Date.now() / 1000)
    return `botocore-client-${timestamp}`
  }

  /**
   * Get redirect URI without port (for registration)
   */
  redirectUriWithoutPort(redirectUri) {
    const url = new URL(redirectUri)
    return `${url.protocol}//${url.hostname}${url.pathname}`
  }
}
