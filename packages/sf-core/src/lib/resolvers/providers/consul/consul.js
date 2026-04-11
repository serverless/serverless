import { AbstractProvider } from '../index.js'
import { z } from 'zod'

export class Consul extends AbstractProvider {
  static type = 'consul'
  static resolvers = ['consul']
  static defaultResolver = 'consul'

  static validateConfig(providerConfig) {
    const baseSchema = z
      .object({
        type: z.literal('consul'),
        address: z.string().optional(),
        token: z.string().optional(),
        datacenter: z.string().optional(),
        namespace: z.string().optional(),
      })
      .strict({
        message:
          "Only 'address', 'token', 'datacenter', and 'namespace' are allowed in the Consul configuration",
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
      token: this.config.token || process.env.CONSUL_HTTP_TOKEN,
      address:
        this.config.address ||
        process.env.CONSUL_HTTP_ADDR ||
        'http://localhost:8500',
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'consul') {
      const credentials = await this.resolveCredentials()

      return await resolveValueFromConsul({
        address: credentials.address,
        token: credentials.token,
        key,
        datacenter: this.config.datacenter,
        namespace: this.config.namespace,
      })
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveValueFromConsul = async ({
  address,
  token,
  key,
  datacenter,
  namespace,
}) => {
  const params = new URLSearchParams({ raw: 'true' })
  if (datacenter) {
    params.set('dc', datacenter)
  }
  if (namespace) {
    params.set('ns', namespace)
  }

  const baseUrl = address.replace(/\/+$/, '')
  const url = `${baseUrl}/v1/kv/${key}?${params.toString()}`

  const headers = {}
  if (token) {
    headers['X-Consul-Token'] = token
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.statusText}: ${errorText}`)
    }

    /**
     * With the raw query parameter, Consul returns the raw value
     * directly as the response body (no base64 encoding).
     */
    return await response.text()
  } catch (error) {
    throw new Error(`Error fetching value from Consul KV: ${error.message}`)
  }
}
