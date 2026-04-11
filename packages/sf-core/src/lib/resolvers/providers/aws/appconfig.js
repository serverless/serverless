import {
  AppConfigDataClient,
  StartConfigurationSessionCommand,
  GetLatestConfigurationCommand,
} from '@aws-sdk/client-appconfigdata'
import { addProxyToAwsClient } from '@serverless/util'

export const resolveValueFromAppConfig = async (
  credentials,
  region,
  key,
  providerConfig,
) => {
  /**
   * The key can be in the format:
   *   ${aws:appconfig:applicationId/environmentId/configurationProfileId}
   *   ${aws:appconfig:applicationId/environmentId/configurationProfileId/jsonPath}
   *
   * Or if applicationId, environmentId, and configurationProfileId are
   * in the provider config, the key is used as a JSON path into
   * the configuration data.
   */
  let applicationId = providerConfig.applicationId
  let environmentId = providerConfig.environmentId
  let configurationProfileId = providerConfig.configurationProfileId
  let jsonPath = null

  const parts = key.split('/')
  if (parts.length >= 3) {
    applicationId = parts[0]
    environmentId = parts[1]
    configurationProfileId = parts[2]
    if (parts.length > 3) {
      jsonPath = parts.slice(3).join('/')
    }
  } else if (!applicationId || !environmentId || !configurationProfileId) {
    throw new Error(
      'AWS AppConfig requires applicationId, environmentId, and configurationProfileId. Provide them in the resolver config or as "${aws:appconfig:appId/envId/profileId}"',
    )
  } else {
    // All IDs from config, key is a JSON path
    jsonPath = key
  }

  const client = addProxyToAwsClient(
    new AppConfigDataClient({
      credentials,
      region,
    }),
  )

  // Start a configuration session
  const sessionCommand = new StartConfigurationSessionCommand({
    ApplicationIdentifier: applicationId,
    EnvironmentIdentifier: environmentId,
    ConfigurationProfileIdentifier: configurationProfileId,
  })
  const session = await client.send(sessionCommand)

  // Get the latest configuration
  const configCommand = new GetLatestConfigurationCommand({
    ConfigurationToken: session.InitialConfigurationToken,
  })
  const configResult = await client.send(configCommand)

  // Convert the configuration blob to string
  const configString = new TextDecoder().decode(configResult.Configuration)

  if (!configString) {
    throw new Error('No configuration data returned from AWS AppConfig')
  }

  // If jsonPath is provided, parse the config as JSON and extract the value
  if (jsonPath) {
    let configData
    try {
      configData = JSON.parse(configString)
    } catch {
      // If JSON parsing fails, return raw config string
      return configString
    }
    const keys = jsonPath.split('.')
    let value = configData
    for (const k of keys) {
      if (value === undefined || value === null) {
        throw new Error(
          `Key "${jsonPath}" not found in AWS AppConfig configuration`,
        )
      }
      value = value[k]
    }
    if (value === undefined) {
      throw new Error(
        `Key "${jsonPath}" not found in AWS AppConfig configuration`,
      )
    }
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  return configString
}
