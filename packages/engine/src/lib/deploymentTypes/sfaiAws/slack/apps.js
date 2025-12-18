import slackPkg from '@slack/web-api'
import { ServerlessError, log, progress } from '@serverless/util'
import http from 'http'
import url from 'url'
import open from 'open'
import { setTimeout } from 'timers/promises'
const { WebClient } = slackPkg

const slackProgress = progress.get('main')

export const getSlackCredentialsFromEnvironment = () => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  const botToken = process.env.SLACK_BOT_TOKEN
  const appToken = process.env.SLACK_APP_TOKEN
  return { signingSecret, botToken, appToken }
}

export const createManifest = ({
  appDisplayName,
  request_url = null,
  description = null,
}) => {
  return JSON.stringify({
    display_information: {
      name: appDisplayName,
      description: description ?? appDisplayName,
      background_color: '#0040ff',
    },
    features: {
      bot_user: {
        display_name: appDisplayName,
        always_online: false,
      },
      app_home: {
        home_tab_enabled: false,
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
    },
    oauth_config: {
      redirect_urls: ['http://localhost:3000/slack/oauth/callback'],
      scopes: {
        bot: [
          'app_mentions:read',
          'assistant:write',
          'channels:history',
          'chat:write',
          'groups:history',
          'im:history',
          'links:read',
          'links:write',
          'mpim:history',
        ],
      },
    },
    settings: {
      event_subscriptions: {
        bot_events: [
          'app_mention',
          'assistant_thread_context_changed',
          'assistant_thread_started',
          'message.channels',
          'message.groups',
          'message.im',
          'message.mpim',
        ],
      },
      interactivity: {
        is_enabled: true,
      },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  })
}

export const createSlackAppForDev = async (
  manifest,
  { configToken, refreshToken, expiresAt } = {
    configToken: null,
    refreshToken: null,
    expiresAt: null,
  },
) => {
  if (!configToken) {
    throw new ServerlessError('configToken is not set', { stack: false })
  }
  const web = new WebClient(configToken)

  const res = await web.apps.manifest.create({
    manifest,
    token: configToken,
  })

  return res
}

const getSlackAppManifest = async ({ appId, configToken }) => {
  if (!configToken) {
    throw new ServerlessError('configToken is not set', { stack: false })
  }
  const web = new WebClient(configToken)
  const response = await web.apps.manifest.export({
    app_id: appId,
    token: configToken,
  })
  return response
}

export const refreshSlackConfigToken = async ({
  refreshToken,
  configToken,
}) => {
  try {
    const web = new WebClient(refreshToken)
    const response = await web.tooling.tokens.rotate({
      refresh_token: refreshToken,
    })

    const expiresAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()

    return {
      configToken: response.token,
      refreshToken: response.refresh_token,
      expiresAt,
    }
  } catch (error) {
    console.error('Failed to refresh Slack config token', error)
    throw new ServerlessError('Failed to refresh Slack config token', {
      stack: false,
    })
  }
}

export const updateSlackAppMode = async ({
  appId,
  socketMode,
  requestUrl,
  configToken,
}) => {
  if (!configToken) {
    throw new ServerlessError('configToken is not set', { stack: false })
  }
  const web = new WebClient(configToken)
  const getManifestResponse = await getSlackAppManifest({ appId, configToken })
  if (!getManifestResponse.manifest) {
    throw new ServerlessError(
      'Slack app does not exist, please run `init-integrations` to create it',
      { stack: false },
    )
  }

  // settings.event_subscriptions.request_url
  const manifest = getManifestResponse.manifest
  if (!socketMode && requestUrl) {
    manifest.settings.event_subscriptions.request_url = requestUrl
    manifest.settings.interactivity.request_url = requestUrl
    manifest.settings.socket_mode_enabled = false
  } else if (!socketMode) {
    throw new ServerlessError(
      'Must provide requestUrl when disabling socket mode',
      { stack: false },
    )
  }

  if (socketMode) {
    manifest.settings.socket_mode_enabled = true
  }

  try {
    await web.apps.manifest.validate({
      manifest,
      app_id: appId,
      token: configToken,
    })
  } catch (error) {
    throw new ServerlessError('Invalid manifest', { stack: false })
  }

  const res = await web.apps.manifest.update({
    app_id: appId,
    token: configToken,
    manifest,
  })

  return res
}

export const removeSlackAppForDev = async ({ appId, configToken }) => {
  if (!configToken) {
    throw new ServerlessError('configToken is not set', { stack: false })
  }
  const web = new WebClient(configToken)

  const res = await web.apps.manifest.delete({
    app_id: appId,
    token: configToken,
  })

  return res
}

const canRunOpenOnLinux = () => {
  try {
    execSync('which xdg-open')
    return true
  } catch (err) {
    return false
  }
}

export const createAndWaitForSlackAppInstallation = async (
  manifest,
  { configToken, refreshToken, expiresAt } = {
    configToken: null,
    refreshToken: null,
    expiresAt: null,
  },
) => {
  if (!configToken) {
    throw new ServerlessError('configToken is not set', { stack: false })
  }

  // Add the redirect URI to the manifest
  const redirectUri = 'http://localhost:3000/slack/oauth/callback'

  // Create the app using manifest
  slackProgress.update('Creating Slack App')
  const createResult = await createSlackAppForDev(manifest, {
    configToken,
    refreshToken,
    expiresAt,
  })
  const {
    app_id,
    credentials: { client_id, client_secret, signing_secret },
  } = createResult
  slackProgress.remove()
  log.debug(`Slack app created with ID: ${app_id}`)

  // Use the provided oauth_authorize_url directly - it should already have the right scopes
  // Just make sure it includes the redirect URI
  let installUrl = createResult.oauth_authorize_url

  // Check if the URL already contains a redirect_uri parameter
  if (!installUrl.includes('redirect_uri=')) {
    // Add the redirect_uri parameter if it's not already there
    installUrl +=
      (installUrl.includes('?') ? '&' : '?') +
      `redirect_uri=${encodeURIComponent(redirectUri)}`
  }

  // Wait for app installation
  const tokens = await waitForInstallation(
    client_id,
    client_secret,
    redirectUri,
    installUrl,
  )

  log.debug('Slack tokens', tokens)

  log.success('Slack App Created\n\n')

  await setTimeout(2000)

  log.warning(
    `Now create an app token by going to https://api.slack.com/apps/${app_id} and click "Generate Token and Scopes", make sure to select 'connections:write'`,
  )

  open(`https://api.slack.com/apps/${app_id}`, { wait: false })

  const appToken = await log.input({
    message: 'Enter your app token',
    inputType: 'invisible',
  })
  log.debug('slack appToken', appToken)
  return {
    appId: app_id,
    botToken: tokens.botToken,
    appToken,
    signingSecret: signing_secret,
  }
}

export const getSlackConfigTokenCredentials = async () => {
  log.warning(
    'Go to https://api.slack.com/apps and create an App Configuration Token',
  )

  const configToken = await log.input({
    message: 'Enter your Access Token',
    inputType: 'invisible',
  })

  const refreshToken = await log.input({
    message: 'Enter your Refresh Token',
    inputType: 'invisible',
  })

  const expiresAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()

  return { configToken, refreshToken, expiresAt }
}

// Helper function to wait for installation
const waitForInstallation = (
  clientId,
  clientSecret,
  redirectUri,
  installUrl,
) => {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true)

      if (parsedUrl.pathname === '/slack/oauth/callback') {
        const code = parsedUrl.query.code

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('Installation failed. No authorization code received.')
          server.close()
          reject(new Error('No authorization code received'))
          return
        }

        try {
          // Exchange code for tokens
          const web = new WebClient()
          const result = await web.oauth.v2.access({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
          })

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(
            'Installation successful! You can close this window and return to the CLI.',
          )

          server.close()

          // Extract tokens
          const botToken = result.access_token

          resolve({ botToken })
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end('Installation failed. See CLI for details.')
          server.close()
          reject(error)
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' })
        res.end('Not found')
      }
    })

    server.listen(3000, () => {
      log.warning(
        `Go to ${installUrl} \nto install your newly created app if the link does not open automatically`,
      )
      slackProgress.update('Waiting for app installation.')
      open(installUrl, { wait: false })
      log.debug('Waiting for app installation...')
    })

    // Add error handling for the server
    server.on('error', (err) => {
      console.error('Server error:', err.message)
      reject(err)
    })
  })
}
