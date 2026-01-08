import os from 'os'
import path from 'path'
import crypto from 'crypto'
import http from 'http'
import open from 'open'
import { SERVERLESS_LOGO_BASE64 } from './serverless-logo.js'
import { log, ServerlessError } from '@serverless/util'

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const LOGIN_TIMEOUT_MS = 300000 // 5 minutes

/**
 * Base class for AWS login implementations.
 * Contains shared functionality for OAuth flows.
 */
export class AwsLoginBase {
  constructor(options = {}) {
    this.options = options
    this.logger = options.logger || log.get('core-runner:aws-login')
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

  async startLocalServer(expectedState, options = {}) {
    const {
      successTitle = 'Login Successful',
      successContent = '<p>You have successfully authenticated.</p><p>You can close this window and return to the CLI.</p>',
      errorPrefix = 'AWS',
    } = options

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
            `${errorPrefix}_LOGIN_TIMEOUT`,
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
              <p class="error-detail">An error was received: <strong>${sanitizedError}</strong></p>
              <p>This may be due to insufficient permissions, expired credentials, or a misconfiguration.</p>
              <p>Please check your permissions, ensure your credentials are valid, and try again.</p>
            `,
                'error',
              ),
            )
            codePromiseReject(
              new ServerlessError(
                `Login failed with error: ${error}. Possible causes include insufficient permissions, expired credentials, or misconfiguration. Please verify your permissions and credentials, then try again.`,
                `${errorPrefix}_LOGIN_FAILED`,
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
                `${errorPrefix}_LOGIN_STATE_MISMATCH`,
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
              this.generateHtmlPage(successTitle, successContent, 'success'),
            )
            codePromiseResolve(code)
          } else {
            res.writeHead(400)
            res.end('Missing code')
            codePromiseReject(
              new ServerlessError(
                'Missing authorization code',
                `${errorPrefix}_LOGIN_MISSING_CODE`,
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

  async openBrowser(url) {
    this.logger.info(`Opening browser to: ${url}`)
    try {
      await open(url)
    } catch (err) {
      this.logger.error(
        `Failed to open browser automatically: ${err.message || err}.`,
      )
      this.logger.error(
        `Please copy and paste the following URL into your browser to continue login:\n${url}`,
      )
    }
  }
}

export { LOGIN_TIMEOUT_MS, HTML_ESCAPES }
