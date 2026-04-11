import { AbstractProvider } from '../index.js'
import { z } from 'zod'

export class GcpSecretManager extends AbstractProvider {
  static type = 'gcpSecretManager'
  static resolvers = ['gcpSecretManager']
  static defaultResolver = 'gcpSecretManager'

  static validateConfig(providerConfig) {
    const baseSchema = z
      .object({
        type: z.literal('gcpSecretManager'),
        project: z.string().optional(),
        token: z.string().optional(),
        version: z.string().optional(),
      })
      .strict({
        message:
          "Only 'project', 'token', and 'version' are allowed in the GCP Secret Manager configuration",
      })

    try {
      baseSchema.parse(providerConfig)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issue = error.issues[0]
        throw new Error(issue.message)
      } else {
        throw error
      }
    }
  }

  async resolveCredentials() {
    await super.resolveCredentials()
    return {
      token: this.config.token || process.env.GCP_ACCESS_TOKEN,
      project: this.config.project || process.env.GCP_PROJECT,
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'gcpSecretManager') {
      const credentials = await this.resolveCredentials()

      if (!credentials.token) {
        throw new Error(
          'No GCP access token provided. Please provide a token in the GCP Secret Manager configuration or set the GCP_ACCESS_TOKEN environment variable.',
        )
      }

      /**
       * The key can be in the format:
       *   ${gcpSecretManager:secretName}
       *   ${gcpSecretManager:project/secretName}
       *
       * If the key contains a slash, the first part is the project and the
       * rest is the secret name. Otherwise, the project must be in the config.
       */
      let project = credentials.project
      let secretName = key
      const version = this.config.version || 'latest'

      if (key.includes('/')) {
        const parts = key.split('/')
        project = parts[0]
        secretName = parts.slice(1).join('/')
      }

      if (!project) {
        throw new Error(
          'No GCP project specified. Either include project in the resolver config, set the GCP_PROJECT environment variable, or reference it in the variable string as "${gcpSecretManager:project/secretName}"',
        )
      }

      return await resolveSecretFromGcp({
        token: credentials.token,
        project,
        secretName,
        version,
      })
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveSecretFromGcp = async ({
  token,
  project,
  secretName,
  version,
}) => {
  const url = `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(project)}/secrets/${encodeURIComponent(secretName)}/versions/${encodeURIComponent(version)}:access`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.statusText}: ${errorText}`)
    }

    const responseData = await response.json()

    /**
     * GCP Secret Manager returns the secret payload as a base64-encoded
     * string in the payload.data field.
     */
    if (responseData.payload?.data) {
      return Buffer.from(responseData.payload.data, 'base64').toString('utf-8')
    }

    throw new Error('No secret data found in GCP Secret Manager response')
  } catch (error) {
    throw new Error(
      `Error fetching secret from GCP Secret Manager: ${error.message}`,
    )
  }
}
