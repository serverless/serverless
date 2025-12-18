import { AbstractProvider } from '../index.js'
import { z } from 'zod'
import DopplerSDK from '@dopplerhq/node-sdk'

export class Doppler extends AbstractProvider {
  static type = 'doppler'
  static resolvers = ['doppler']
  static defaultResolver = 'doppler'

  static validateConfig(providerConfig) {
    const baseSchema = z
      .object({
        type: z.literal('doppler'),
        token: z.string().optional(),
        project: z.string().optional(),
        config: z.string().optional(),
      })
      .strict({
        message:
          "Only 'token', 'project', and 'config' are allowed in the Doppler configuration",
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
      token: this.config.token || process.env.DOPPLER_TOKEN,
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'doppler') {
      const credentials = await this.resolveCredentials()

      if (!credentials.token) {
        throw new Error(
          'No Doppler token provided. Please provide a token in the Doppler configuration or set the DOPPLER_TOKEN environment variable.',
        )
      }

      // Split the key into project and secret name if project is not in config
      let project = this.config.project
      let config = this.config.config || this.stage
      let secretName = key

      // Check if the key contains a slash
      if (key.includes('/')) {
        const parts = key.split('/')
        if (parts.length !== 2) {
          throw new Error(
            'When referencing a Doppler project in the variable string, it must be in format "${doppler:projectName/secretName}" with exactly one slash',
          )
        }
        // Project name in the key takes precedence over config
        project = parts[0]
        secretName = parts[1]
      } else if (!project) {
        // If no slash in key and no project in config
        throw new Error(
          'No project specified. Either include project in the resolver config, or reference it in the variable string as "${doppler:projectName/secretName}"',
        )
      }

      try {
        const doppler = new DopplerSDK({
          accessToken: credentials.token,
        })

        const secret = await doppler.secrets.get(project, config, secretName)

        // We could either return secret.value.computed or secret.value.raw
        return secret.value.computed
      } catch (error) {
        // Format the error message based on the Doppler API error structure
        if (error.title && error.statusCode && error.detail) {
          const messages = error.detail.messages
            ? error.detail.messages.join(', ')
            : 'Unknown error'

          if (error.statusCode === 401) {
            throw new Error(
              `Failed to authenticate with Doppler: Please provide a valid Doppler token either by setting the DOPPLER_TOKEN environment variable or by adding it to your resolver configuration. For more information, see the docs: https://www.serverless.com/framework/docs/guides/variables/doppler`,
            )
          }

          throw new Error(
            `Error fetching secret from Doppler: ${error.statusCode} ${error.title} - ${messages}`,
          )
        } else {
          throw new Error(
            `Error fetching secret from Doppler: ${error.message}`,
          )
        }
      }
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}
