import {
  createAndWaitForSlackAppInstallation,
  getSlackConfigTokenCredentials,
  refreshSlackConfigToken,
  updateSlackAppMode,
  getSlackCredentialsFromEnvironment,
  createManifest,
  removeSlackAppForDev,
} from './slack/apps.js'
import { setTimeout } from 'node:timers/promises'
import { ParameterType } from '@aws-sdk/client-ssm'
import { log, ServerlessError } from '@serverless/util'

const logger = log.get('scf:integrations:slack')

export default class SlackIntegration {
  #projectConfig
  #stage
  #ssmClient
  #state
  #startedDevIntegrations
  #ssmParameterPath

  constructor({ projectConfig, stage, ssmClient, state }) {
    this.#projectConfig = projectConfig
    this.#stage = stage
    this.#ssmClient = ssmClient
    this.#state = state
    this.#startedDevIntegrations = []
    this.#ssmParameterPath =
      projectConfig.deployment?.slack?.appConfigTokenSSMParameterPath ||
      `/${projectConfig.name}/${stage}/slack/appconfig/credentials`
  }

  async #getSlackAppCredentials(integrationName) {
    const credentials = await this.#ssmClient.getSsmParameter({
      paramName: this.#ssmParameterPath,
    })
    if (!credentials) {
      const newCredentials = await getSlackConfigTokenCredentials()
      await this.#storeSlackAppCredentials(integrationName, {
        ...newCredentials,
        success: true,
      })
      return { ...newCredentials, success: true }
    }
    const expiresAt = new Date(JSON.parse(credentials).expiresAt)
    if (expiresAt < new Date()) {
      logger.warning('Slack app config credentials are expired, refreshing')
      const credentialsObject = JSON.parse(credentials)
      const refreshResult = await refreshSlackConfigToken({
        configToken: credentialsObject.configToken,
        refreshToken: credentialsObject.refreshToken,
      })

      if (refreshResult.success) {
        // Refresh was successful
        await this.#storeSlackAppCredentials(integrationName, refreshResult)
        return refreshResult
      } else {
        const response = await log.input({
          message:
            'Failed to refresh Slack config token, would you like to provide new Slack app configuration credentials? Enter y/n',
        })

        if (
          response.toLowerCase() === 'y' ||
          response.toLowerCase() === 'yes'
        ) {
          logger.info('Please provide new Slack app configuration credentials')
          const newCredentials = await getSlackConfigTokenCredentials()
          await this.#storeSlackAppCredentials(integrationName, {
            ...newCredentials,
            success: true,
          })
          return { ...newCredentials, success: true }
        } else {
          // User chose not to provide new credentials
          throw new ServerlessError(
            'Slack credential refresh failed and user chose not to provide new credentials',
            {
              stack: false,
            },
          )
        }
      }
    }
    return JSON.parse(credentials)
  }

  async #storeSlackAppCredentials(_, credentials) {
    await this.#ssmClient.storeSSMParameter({
      paramName: this.#ssmParameterPath,
      paramValue: JSON.stringify(credentials),
      overwrite: true,
      type: ParameterType.SECURE_STRING,
    })
  }

  async #deleteSlackAppCredentials() {
    await this.#ssmClient.deleteSSMParameter({
      paramName: this.#ssmParameterPath,
    })
  }

  async #initSlackIntegration(
    containerName,
    integrationName,
    integrationConfig,
  ) {
    // const containerName = 'service'
    if (
      this.#state.state.containers[containerName]?.integrations?.[
        integrationName
      ]
    ) {
      try {
        await this.#getSlackAppCredentials()
      } catch (error) {
        /* empty */
      }
      logger.warning(
        `Slack integration ${integrationName} already exists, skipping.`,
      )
      return
    }
    const slackEnvCredentials = getSlackCredentialsFromEnvironment()
    if (slackEnvCredentials.botToken && slackEnvCredentials.signingSecret) {
      try {
        await this.#getSlackAppCredentials()
      } catch (error) {
        /* empty */
      }
      logger.warning(
        `Slack integration ${integrationName} already has credentials in the environment, skipping.`,
      )
      return
    }

    let slackConfigCredentials =
      await this.#getSlackAppCredentials(integrationName)
    if (!slackConfigCredentials) {
      slackConfigCredentials = await getSlackConfigTokenCredentials()
      await this.#storeSlackAppCredentials(
        integrationName,
        slackConfigCredentials,
      )
      logger.success('Slack app config credentials stored in AWS SSM')
      await setTimeout(4000)
    } else {
      // TODO: Check if credentials are expired
    }

    // If no credentials are provided, create a new app
    if (integrationConfig && !integrationConfig.credentials) {
      const createAppResult = await createAndWaitForSlackAppInstallation(
        createManifest({ appDisplayName: integrationConfig.name }),
        slackConfigCredentials,
      )

      logger.write(
        `Slack integration ${integrationName} created.\n` +
          `Please add the following to your environment:\n` +
          `\SLACK_SIGNING_SECRET=${createAppResult.signingSecret}\n` +
          `\SLACK_BOT_TOKEN=${createAppResult.botToken}\n` +
          `\SLACK_APP_TOKEN=${createAppResult.appToken}\n`,
      )

      if (!this.#state.state.containers[containerName]) {
        this.#state.state.containers[containerName] = {}
      }
      if (!this.#state.state.containers[containerName]?.integrations) {
        this.#state.state.containers[containerName].integrations = {}
      }
      this.#state.state.containers[containerName].integrations[
        integrationName
      ] = {
        type: 'slack',
        appId: createAppResult.appId,
        socketMode: integrationConfig.socketMode,
        credentialEnv: {
          SLACK_SIGNING_SECRET: `${integrationName}_SLACK_SIGNING_SECRET`,
          SLACK_BOT_TOKEN: `${integrationName}_SLACK_BOT_TOKEN`,
          SLACK_APP_TOKEN: `${integrationName}_SLACK_APP_TOKEN`,
        },
      }
      this.#state.state.isDeployed = true
      this.#state.save()
    } else if (integrationConfig.credentials) {
      logger.debug(`Using existing slack credentials for ${integrationName}`)
      return
    }
  }

  async #changeSlackAppMode({ appId, socketMode, configToken, requestUrl }) {
    await updateSlackAppMode({
      appId,
      socketMode,
      configToken,
      requestUrl,
    })
  }

  async init() {
    for (const [containerName, containerConfig] of Object.entries(
      this.#projectConfig.containers ?? {},
    )) {
      for (const [integrationName, integrationConfig] of Object.entries(
        containerConfig.integrations ?? {},
      )) {
        if (integrationConfig.type !== 'slack') {
          continue
        }
        await this.#initSlackIntegration(
          containerName,
          integrationName,
          integrationConfig,
        )
      }
    }
  }

  async startDev() {
    const slackIntegrations = Object.entries(this.#state.state.containers ?? {})
      .map(([containerName, containerConfig]) => {
        return Object.entries(containerConfig.integrations ?? {})
          .filter(([_, integration]) => integration.type === 'slack')
          .map(([integrationName, integration]) => ({
            containerName,
            integrationName,
            appId: integration.appId,
          }))
      })
      .filter((appIds) => appIds.length > 0)
      .flat()

    for (const { containerName, integrationName, appId } of slackIntegrations) {
      try {
        const credentials = await this.#getSlackAppCredentials(integrationName)
        if (credentials && credentials.configToken) {
          await this.#changeSlackAppMode({
            appId,
            socketMode: true,
            configToken: credentials.configToken,
          })
          this.#startedDevIntegrations.push({
            containerName,
            integrationName,
            appId,
          })
        } else {
          logger.warning(
            `Could not find valid credentials for Slack app ${integrationName}`,
          )
        }
      } catch (error) {
        logger.error(
          `Failed to start dev mode for Slack app ${integrationName}: ${error.message}`,
        )
      }
    }
  }

  async stopDev() {
    for (const { containerName, integrationName, appId } of this
      .#startedDevIntegrations) {
      try {
        const credentials = await this.#getSlackAppCredentials(integrationName)
        if (!credentials || !credentials.configToken) {
          logger.warning(
            `Could not find valid credentials for Slack app ${integrationName}`,
          )
          continue
        }

        const containerConfig = this.#state.state.containers[containerName]
        const requestUrlDomain =
          containerConfig?.routing?.customDomain ??
          this.#state.state.awsCloudFront?.distributionDomainName

        if (requestUrlDomain) {
          let requestUrl = `https://${requestUrlDomain}`
          const pathPattern = containerConfig?.routing?.pathPattern ?? '/'
          if (pathPattern.endsWith('/*')) {
            requestUrl += pathPattern.replace('/*', `/slack`)
          } else {
            requestUrl += `${pathPattern}/slack`
          }

          logger.debug('requestUrl', requestUrl)

          await this.#changeSlackAppMode({
            appId,
            socketMode: false,
            configToken: credentials.configToken,
            requestUrl,
          })
        }
      } catch (error) {
        logger.error(
          `Failed to stop dev mode for Slack app ${integrationName}: ${error.message}`,
        )
      }
    }
  }

  hasSlackIntegration() {
    const slackIntegrations = Object.entries(this.#state.state.containers ?? {})
      .map(([_, containerConfig]) => {
        return Object.entries(containerConfig.integrations ?? {})
          .filter(([_, integration]) => integration.type === 'slack')
          .map(([integrationName, integration]) => ({
            integrationName,
            appId: integration.appId,
          }))
      })
      .filter((appIds) => appIds.length > 0)
      .flat()

    return slackIntegrations.length > 0
  }

  async deploy() {
    const slackIntegrations = Object.entries(this.#state.state.containers ?? {})
      .map(([containerName, containerConfig]) => {
        return Object.entries(containerConfig.integrations ?? {})
          .filter(([_, integration]) => integration.type === 'slack')
          .map(([integrationName, integration]) => ({
            containerName,
            integrationName,
            appId: integration.appId,
          }))
      })
      .filter((appIds) => appIds.length > 0)
      .flat()

    for (const { containerName, integrationName, appId } of slackIntegrations) {
      try {
        const credentials = await this.#getSlackAppCredentials(integrationName)
        if (!credentials || !credentials.configToken) {
          logger.warning(
            `Could not find valid credentials for Slack app ${integrationName}`,
          )
          continue
        }

        const containerConfig = this.#state.state.containers[containerName]
        const requestUrlDomain =
          containerConfig?.routing?.customDomain ??
          this.#state.state.awsCloudFront?.distributionDomainName

        if (requestUrlDomain) {
          let requestUrl = `https://${requestUrlDomain}`
          const pathPattern = containerConfig?.routing?.pathPattern ?? '/'
          if (pathPattern.endsWith('/*')) {
            requestUrl += pathPattern.replace('/*', `/slack`)
          } else {
            requestUrl += `${pathPattern}/slack`
          }

          await this.#changeSlackAppMode({
            appId,
            socketMode: false,
            configToken: credentials.configToken,
            requestUrl,
          })
        }
      } catch (error) {
        logger.error(
          `Failed to deploy Slack app ${integrationName}: ${error.message}`,
        )
      }
    }
  }

  async remove() {
    const slackIntegrations = Object.entries(this.#state.state.containers ?? {})
      .map(([_, containerConfig]) => {
        return Object.entries(containerConfig.integrations ?? {})
          .filter(([_, integration]) => integration.type === 'slack')
          .map(([integrationName, integration]) => ({
            integrationName,
            appId: integration.appId,
          }))
      })
      .filter((appIds) => appIds.length > 0)
      .flat()

    for (const { integrationName, appId } of slackIntegrations) {
      try {
        const credentials = await this.#getSlackAppCredentials(integrationName)
        if (credentials && credentials.configToken) {
          await removeSlackAppForDev({
            appId,
            configToken: credentials.configToken,
          })
        } else {
          logger.warning(
            `Could not find credentials for Slack app ${integrationName}`,
          )
        }
      } catch (error) {
        logger.error(
          `Failed to remove Slack app ${integrationName}: ${error.message}`,
        )
      }
    }
  }
}
