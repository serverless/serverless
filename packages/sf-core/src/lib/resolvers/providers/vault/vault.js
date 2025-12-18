import { AbstractProvider } from '../index.js'
import _ from 'lodash'
import { z } from 'zod'
import * as fsPath from 'path'

export class Vault extends AbstractProvider {
  static type = 'vault'
  static resolvers = ['vault', 's3']
  static defaultResolver = 'vault'

  static validateConfig(providerConfig) {
    const baseSchema = z
      .object({
        type: z.literal('vault'),
        token: z.string().optional(),
        address: z.string().optional(),
        version: z.string().optional(),
        path: z.string().optional(),
      })
      .strict({
        message:
          "Only 'token', 'address', 'version', and 'path' are allowed in the Vault configuration",
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
    return { token: this.config.token || process.env.VAULT_TOKEN }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })
    if (resolverType === 'vault') {
      /**
       * Retrieving values from Vault requires two sets of values, the path and
       * the key. The path is the location of the secret in Vault, and it
       * returns an object. The key is used to get the value from the object.
       *
       * The user has two ways of providing the path, either as a part of the
       * configuration in stages.*.resolvers.*.path, or as a part of the key
       * in ${vault:<path>/<key>}. One or the either, or both can be provided.
       *
       * If both are provided, then the config path is used as a prefix.
       *
       * In the case of key, ${vault:<path>/<key>}, the value of key would
       * actually be "<path>/<key>", so we need to split it into two parts,
       * and extract the key by popping the last element.
       */
      const pathFromKey = key.split('/')
      const pathFromConfig = this.config.path ? this.config.path.split('/') : []
      const parsedKey = pathFromKey.pop()
      const combinedPath = [...pathFromConfig, ...pathFromKey].join('/')

      const vaultData = await resolveSecretFromVault({
        address: this.config.address,
        token: this.config.token,
        path: combinedPath,
        version: this.config.version,
      })

      /**
       * We use lodash get() instead of vaultData[key] to allow for
       * getting values from nested objects.
       */
      const value = _.get(vaultData, parsedKey)
      return value
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveSecretFromVault = async ({ address, token, version, path }) => {
  /**
   * It is a common practice to use environment variables for the Vault token
   * and address, so we use that as a default if not provided in the config.
   */
  const apiToken = token || process.env.VAULT_TOKEN
  const apiAddress =
    address || process.env.VAULT_ADDR || 'http://localhost:8200/'
  const apiVersion = version || 'v1'

  if (!apiToken) {
    throw new Error(
      'No Vault token provided. Please provide a token in the Vault configuration or set the VAULT_TOKEN environment variable.',
    )
  }

  try {
    const url = new URL(fsPath.join(apiVersion, path), apiAddress)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Vault-Token': apiToken,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.statusText}: ${errorText}`)
    }

    const responseData = await response.json()

    /**
     * Vault supports multiple Secrets Engine, each which may have different
     * output formats. The KV secret engine is available by default for static
     * key/value paris. The value mount_type in the response specifies the type
     * of secret engine. In the case of KV, the response includes data in the
     * format {data, metadata}, but the metadata is probably not interesting to
     * use in the configuration. Otherwise each param would need to specify
     * ${vault:data.key}, but this makes it available under ${vault:key}.
     *
     * All other secret engines are returned as is.
     */
    if (responseData.mount_type === 'kv') {
      return responseData.data.data
    } else {
      return responseData.data
    }
  } catch (error) {
    throw new Error(`Error fetching secret from Vault: ${error.message}`)
  }
}
