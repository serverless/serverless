import { AbstractProvider } from '../index.js'
import { z } from 'zod'

export class CloudflareKv extends AbstractProvider {
  static type = 'cloudflareKv'
  static resolvers = ['cloudflareKv']
  static defaultResolver = 'cloudflareKv'

  static validateConfig(providerConfig) {
    const baseSchema = z
      .object({
        type: z.literal('cloudflareKv'),
        accountId: z.string().optional(),
        namespaceId: z.string().optional(),
        apiToken: z.string().optional(),
      })
      .strict({
        message:
          "Only 'accountId', 'namespaceId', and 'apiToken' are allowed in the Cloudflare KV configuration",
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
      apiToken: this.config.apiToken || process.env.CLOUDFLARE_API_TOKEN,
      accountId: this.config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID,
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    await super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'cloudflareKv') {
      const credentials = await this.resolveCredentials()

      if (!credentials.apiToken) {
        throw new Error(
          'No Cloudflare API token provided. Please provide an apiToken in the Cloudflare KV configuration or set the CLOUDFLARE_API_TOKEN environment variable.',
        )
      }

      if (!credentials.accountId) {
        throw new Error(
          'No Cloudflare account ID provided. Please provide an accountId in the Cloudflare KV configuration or set the CLOUDFLARE_ACCOUNT_ID environment variable.',
        )
      }

      /**
       * The key can be in the format:
       *   ${cloudflareKv:keyName}           - namespaceId must be in config
       *   ${cloudflareKv:namespaceId/keyName} - namespaceId from key
       */
      let namespaceId = this.config.namespaceId
      let keyName = key

      if (key.includes('/')) {
        const parts = key.split('/')
        namespaceId = parts[0]
        keyName = parts.slice(1).join('/')
      }

      if (!namespaceId) {
        throw new Error(
          'No namespace ID specified. Either include namespaceId in the resolver config, or reference it in the variable string as "${cloudflareKv:namespaceId/keyName}"',
        )
      }

      return await resolveValueFromCloudflareKv({
        apiToken: credentials.apiToken,
        accountId: credentials.accountId,
        namespaceId,
        keyName,
      })
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveValueFromCloudflareKv = async ({
  apiToken,
  accountId,
  namespaceId,
  keyName,
}) => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(keyName)}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.statusText}: ${errorText}`)
    }

    return await response.text()
  } catch (error) {
    throw new Error(`Error fetching value from Cloudflare KV: ${error.message}`)
  }
}
