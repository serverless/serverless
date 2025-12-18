import os from 'os'
import path from 'path'
import crypto from 'crypto'
import http from 'http'
import fs from 'fs'
import open from 'open'
import configWriter from './aws-config-writer.js'
import { SERVERLESS_LOGO_BASE64 } from './serverless-logo.js'
import { log, progress, ServerlessError } from '@serverless/util'

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const LOGIN_TIMEOUT_MS = 300000 // 5 minutes
const DEFAULT_EXPIRATION_SECONDS = 900 // 15 minutes

export class AwsLogin {
  constructor(options = {}) {
    this.options = options
    this.logger = options.logger || log.get('core-runner:login-aws')
  }

  async login() {
    if (!this.logger.isInteractive()) {
      throw new ServerlessError(
        'The `login aws` command requires an interactive environment (TTY) to authenticate.',
        'AWS_LOGIN_NON_INTERACTIVE',
        { stack: false },
      )
    }
    const options = this.options
    const profile = options['aws-profile'] || 'default'
    const region = options.region || process.env.AWS_REGION || 'us-east-1'
    let configRegion = options.region // Region to save in config

    if (!configRegion) {
      const existingRegion = this.getExistingRegion(profile)
      if (!existingRegion) {
        configRegion = region
      }
    }

    // 1. Generate PKCE
    const { codeVerifier, codeChallenge } = this.generatePKCE()
    const state = crypto.randomUUID()

    // 2. Start Local Server
    // same-device flow is the only one supported for now.
    const { server, port, codePromise } = await this.startLocalServer(state)
    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`

    // 3. Construct Authorization URL
    const authUrl = new URL(
      `https://${region}.signin.aws.amazon.com/v1/authorize`,
    )
    authUrl.searchParams.append(
      'client_id',
      'arn:aws:signin:::devtools/same-device',
    )
    authUrl.searchParams.append('response_type', 'code')
    authUrl.searchParams.append('code_challenge', codeChallenge)
    authUrl.searchParams.append('code_challenge_method', 'SHA-256')
    authUrl.searchParams.append('scope', 'openid')
    authUrl.searchParams.append('redirect_uri', redirectUri)
    authUrl.searchParams.append('state', state)

    this.logger.info(`Opening browser to: ${authUrl.toString()}`)
    try {
      await open(authUrl.toString())
    } catch (err) {
      this.logger.error(
        `Failed to open browser automatically: ${err.message || err}.`,
      )
      this.logger.error(
        `Please copy and paste the following URL into your browser to continue login:\n${authUrl.toString()}`,
      )
    }

    let authCode
    const progressLog = progress.get('aws-login')
    try {
      progressLog.notice('Waiting for login in browser')
      authCode = await codePromise
    } finally {
      progressLog.remove()
      if (server && server.listening) server.close()
    }

    if (!authCode) {
      throw new ServerlessError(
        'Failed to get authorization code',
        'AWS_LOGIN_NO_CODE',
        { stack: false },
      )
    }

    // 4. Exchange Token
    const tokens = await this.exchangeToken(
      region,
      authCode,
      codeVerifier,
      redirectUri,
    )

    // 5. Save Token (Cache)
    const sessionId = this.extractSessionId(tokens.idToken)
    this.saveToken(sessionId, tokens)

    // 6. Update Config
    const shouldUpdate = await this.checkAndConfirmOverwrite(profile, sessionId)

    if (shouldUpdate) {
      this.updateConfig(profile, sessionId, configRegion)
      this.logger.success(
        `Successfully logged in. Saved session ${sessionId} to profile "${profile}".`,
      )
    } else {
      this.logger.success(
        'Successfully logged in. Profile configuration not updated.',
      )
    }
  }

  async checkAndConfirmOverwrite(profile, newSessionId) {
    const configPath = this.getConfigPath()
    const profileSectionName =
      profile === 'default' ? 'default' : `profile ${profile}`

    const existingSessionId = configWriter.getValue(
      profileSectionName,
      'login_session',
      configPath,
    )

    if (!existingSessionId || existingSessionId === newSessionId) {
      return true
    }

    const message = `Profile ${profile} is already configured to use session ${existingSessionId}.\nDo you want to overwrite it to use ${newSessionId} instead?`
    this.logger.blankLine()
    const choice = await this.logger.choose({
      message,
      choices: [
        { name: 'Yes', value: 'Yes' },
        { name: 'No', value: 'No' },
      ],
    })

    return choice === 'Yes'
  }

  getExistingRegion(profile) {
    const configPath = this.getConfigPath()
    const profileSectionName =
      profile === 'default' ? 'default' : `profile ${profile}`

    return configWriter.getValue(profileSectionName, 'region', configPath)
  }

  generateHtmlPage(title, content, type = 'success') {
    const isError = type === 'error'
    const iconColor = isError ? '#FD5750' : '#22c55e'
    const sanitizedTitle = this.sanitizeHtml(title)
    const icon = isError
      ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <circle cx="12" cy="12" r="10"></circle>
           <line x1="15" y1="9" x2="9" y2="15"></line>
           <line x1="9" y1="9" x2="15" y2="15"></line>
         </svg>`
      : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
           <polyline points="22 4 12 14.01 9 11.01"></polyline>
         </svg>`

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizedTitle} - Serverless Framework</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #121212 0%, #1a1a1a 50%, #0d0d0d 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      padding: 20px;
    }
    .container {
      background: rgba(40, 40, 40, 0.8);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 48px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .logo {
      margin-bottom: 32px;
    }
    .logo img {
      height: 48px;
      width: auto;
    }
    .icon {
      margin-bottom: 24px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      color: ${isError ? '#FD5750' : '#ffffff'};
    }
    p {
      color: #C7C7C7;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 12px;
    }
    p:last-child {
      margin-bottom: 0;
    }
    .error-detail {
      background: rgba(253, 87, 80, 0.1);
      border: 1px solid rgba(253, 87, 80, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    .error-detail strong {
      color: #FD5750;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 13px;
      color: #7C7C7C;
    }
    .footer a {
      color: #FD5750;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="${SERVERLESS_LOGO_BASE64}" alt="Serverless" />
    </div>
    <div class="icon">${icon}</div>
    <h1>${sanitizedTitle}</h1>
    ${content}
    <div class="footer">
      Powered by <a href="https://serverless.com" target="_blank">Serverless Framework</a>
    </div>
  </div>
</body>
</html>`
  }

  generatePKCE() {
    // Generate a cryptographically secure random PKCE code verifier
    // PKCE code verifier must be between 43 and 128 characters, using allowed characters
    // We'll use base64url encoding and slice to 64 characters
    const codeVerifier = crypto
      .randomBytes(48)
      .toString('base64url')
      .slice(0, 64)
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
    return { codeVerifier, codeChallenge }
  }

  async startLocalServer(expectedState) {
    return new Promise((resolve, reject) => {
      const server = http.createServer()
      let codePromiseResolve
      let codePromiseReject
      const codePromise = new Promise((res, rej) => {
        codePromiseResolve = res
        codePromiseReject = rej
      })

      let received = false
      const timeoutId = setTimeout(() => {
        if (server.listening) server.close()
        codePromiseReject(
          new ServerlessError(
            'Login timed out. Please try again.',
            'AWS_LOGIN_TIMEOUT',
            { stack: false },
          ),
        )
      }, LOGIN_TIMEOUT_MS)

      server.on('request', (req, res) => {
        if (received) {
          res.writeHead(200)
          res.end()
          return
        }
        const url = new URL(req.url, `http://${req.headers.host}`)
        if (url.pathname === '/oauth/callback') {
          clearTimeout(timeoutId)
          received = true
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')
          const error = url.searchParams.get('error')

          if (error) {
            const sanitizedError = this.sanitizeHtml(error)
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(
              this.generateHtmlPage(
                'Login Failed',
                `
              <p class="error-detail">An error was received from AWS: <strong>${sanitizedError}</strong></p>
              <p>This may be due to insufficient permissions, expired credentials, or a misconfiguration.</p>
              <p>Please check your AWS permissions, ensure your credentials are valid, and try again.</p>
            `,
                'error',
              ),
            )
            codePromiseReject(
              new ServerlessError(
                `AWS login failed with error: ${error}. Possible causes include insufficient permissions, expired credentials, or misconfiguration. Please verify your AWS permissions and credentials, then try again.`,
                'AWS_LOGIN_FAILED',
                { stack: false },
              ),
            )
            return
          }

          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(
              this.generateHtmlPage(
                'Invalid State',
                `
              <p>The authentication state does not match. This may indicate a security issue.</p>
              <p>Please close this window and try logging in again.</p>
            `,
                'error',
              ),
            )
            codePromiseReject(
              new ServerlessError(
                'State mismatch',
                'AWS_LOGIN_STATE_MISMATCH',
                {
                  stack: false,
                },
              ),
            )
            return
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(
              this.generateHtmlPage(
                'Login Successful',
                `
              <p>You have successfully authenticated with AWS.</p>
              <p>You can close this window and return to the CLI.</p>
            `,
                'success',
              ),
            )
            codePromiseResolve(code)
          } else {
            res.writeHead(400)
            res.end('Missing code')
            codePromiseReject(
              new ServerlessError(
                'Missing authorization code',
                'AWS_LOGIN_MISSING_CODE',
                { stack: false },
              ),
            )
          }
        } else {
          res.writeHead(404)
          res.end()
        }
      })

      server.on('error', (err) => {
        clearTimeout(timeoutId)
        reject(err)
      })
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port
        resolve({ server, port, codePromise })
      })
    })
  }

  async exchangeToken(region, code, codeVerifier, redirectUri) {
    const tokenUrl = `https://${region}.signin.aws.amazon.com/v1/token`

    // Generate DPoP Key Pair
    const { privateKey, publicKey } = this.generateDPoPKey()
    const dpopProof = this.generateDPoPProof(
      privateKey,
      publicKey,
      'POST',
      tokenUrl,
    )
    const dpopKeyPem = privateKey.export({ type: 'sec1', format: 'pem' }) // aws-cli uses SEC1

    const body = JSON.stringify({
      grantType: 'authorization_code',
      code: code,
      clientId: 'arn:aws:signin:::devtools/same-device',
      codeVerifier: codeVerifier,
      redirectUri: redirectUri,
    })

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'aws-cli/2.15.0',
        DPoP: dpopProof,
      },
      body: body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new ServerlessError(
        `Token exchange failed: ${response.status} ${text}`,
        'AWS_LOGIN_TOKEN_EXCHANGE_FAILED',
        { stack: false },
      )
    }

    return response.json().then((data) => ({ ...data, dpopKey: dpopKeyPem }))
  }

  generateDPoPKey() {
    return crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    })
  }

  generateDPoPProof(privateKey, publicKey, method, url) {
    const jwk = publicKey.export({ format: 'jwk' })

    // Ensure padding is removed for base64url encodings in standard way
    const base64UrlEncode = (str) => {
      return Buffer.from(str).toString('base64url')
    }

    const header = {
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: jwk.x,
        y: jwk.y,
      },
    }

    const payload = {
      htm: method,
      htu: url,
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),
    }

    const headerEnc = base64UrlEncode(JSON.stringify(header))
    const payloadEnc = base64UrlEncode(JSON.stringify(payload))
    const signingInput = `${headerEnc}.${payloadEnc}`

    // Use 'dsaEncoding: "ieee-p1363"' for correct ES256 signature format in JWTs.
    const signature = crypto.sign('sha256', Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    })

    const signatureEnc = signature.toString('base64url')
    return `${headerEnc}.${payloadEnc}.${signatureEnc}`
  }

  extractSessionId(idToken) {
    const parts = idToken.split('.')
    if (parts.length !== 3)
      throw new ServerlessError('Invalid JWT', 'AWS_LOGIN_INVALID_JWT', {
        stack: false,
      })
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload.sub
  }

  extractAccountId(sessionId) {
    // Session ID is an ARN: arn:aws:iam::123456789012:user/username
    // Split by ':'
    const parts = sessionId.split(':')
    if (parts.length < 6) {
      throw new ServerlessError(
        'Could not extract account ID from session ARN.',
        'AWS_LOGIN_INVALID_SESSION_ARN',
        { stack: false },
      )
    }
    return parts[4]
  }

  saveToken(sessionId, tokens) {
    const homeDir = os.homedir()
    const cacheDir = path.join(homeDir, '.aws', 'login', 'cache')
    const hash = crypto.createHash('sha256').update(sessionId).digest('hex')
    const cacheFile = path.join(cacheDir, `${hash}.json`)

    fs.mkdirSync(cacheDir, { recursive: true })

    const accountId = this.extractAccountId(sessionId)

    if (
      !tokens.accessToken ||
      typeof tokens.accessToken !== 'object' ||
      !tokens.accessToken.accessKeyId ||
      !tokens.accessToken.secretAccessKey ||
      !tokens.accessToken.sessionToken
    ) {
      throw new ServerlessError(
        'Invalid access token format received from AWS.',
        'AWS_LOGIN_INVALID_TOKEN',
        { stack: false },
      )
    }

    // AWS CLI format
    const formattedToken = {
      accessToken: {
        accessKeyId: tokens.accessToken.accessKeyId,
        secretAccessKey: tokens.accessToken.secretAccessKey,
        sessionToken: tokens.accessToken.sessionToken,
        accountId: accountId,
      },
      tokenType: tokens.tokenType,
      clientId: 'arn:aws:signin:::devtools/same-device',
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
      dpopKey: tokens.dpopKey, // Save the private key PEM
    }

    // Calculate expiresAt
    const expiresIn = tokens.expiresIn || DEFAULT_EXPIRATION_SECONDS
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
      .toISOString()
      .replace(/\.\d+Z$/, 'Z')
    formattedToken.accessToken.expiresAt = expiresAt

    fs.writeFileSync(cacheFile, JSON.stringify(formattedToken, null, 2))
    fs.chmodSync(cacheFile, 0o600)
  }

  updateConfig(profile, sessionId, region) {
    const configPath = this.getConfigPath()

    const profileSectionName =
      profile === 'default' ? 'default' : `profile ${profile}`

    const newValues = {
      __section__: profileSectionName,
      login_session: sessionId,
    }

    if (region) {
      newValues['region'] = region
    }

    configWriter.updateConfig(newValues, configPath)
  }

  getConfigPath() {
    if (process.env.AWS_CONFIG_FILE) {
      return path.resolve(process.env.AWS_CONFIG_FILE)
    }
    const homeDir = os.homedir()
    return path.join(homeDir, '.aws', 'config')
  }

  sanitizeHtml(str) {
    if (!str) return ''
    return str.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
  }
}
