import { AbstractProvider } from '../index.js'
import { z } from 'zod'

export class AzureKeyVault extends AbstractProvider {
  static type = 'azureKeyVault'
  static resolvers = ['azureKeyVault']
  static defaultResolver = 'azureKeyVault'

  static validateConfig(providerConfig) {
    const baseSchema = z
      .object({
        type: z.literal('azureKeyVault'),
        vaultUrl: z.string().optional(),
        token: z.string().optional(),
        apiVersion: z.string().optional(),
      })
      .strict({
        message:
          "Only 'vaultUrl', 'token', and 'apiVersion' are allowed in the Azure Key Vault configuration",
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
      token: this.config.token || process.env.AZURE_ACCESS_TOKEN,
      vaultUrl: this.config.vaultUrl || process.env.AZURE_KEY_VAULT_URL,
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    await super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'azureKeyVault') {
      const credentials = await this.resolveCredentials()

      if (!credentials.token) {
        throw new Error(
          'No Azure access token provided. Please provide a token in the Azure Key Vault configuration or set the AZURE_ACCESS_TOKEN environment variable.',
        )
      }

      /**
       * The key can be in the format:
       *   ${azureKeyVault:secretName}
       *   ${azureKeyVault:secretName/version}
       *
       * If vaultUrl is not in the config or env, the key can also be:
       *   ${azureKeyVault:vaultName/secretName}
       *   ${azureKeyVault:vaultName/secretName/version}
       */
      let vaultUrl = credentials.vaultUrl
      let secretName = key
      let version = ''
      const apiVersion = this.config.apiVersion || '7.4'

      const parts = key.split('/')

      if (vaultUrl) {
        // vaultUrl is provided, key is secretName or secretName/version
        secretName = parts[0]
        if (parts.length > 1) {
          version = parts[1]
        }
      } else {
        // No vaultUrl, key should be vaultName/secretName or vaultName/secretName/version
        if (parts.length < 2) {
          throw new Error(
            'No vault URL specified. Either include vaultUrl in the resolver config, set the AZURE_KEY_VAULT_URL environment variable, or reference it as "${azureKeyVault:vaultName/secretName}"',
          )
        }
        vaultUrl = `https://${parts[0]}.vault.azure.net`
        secretName = parts[1]
        if (parts.length > 2) {
          version = parts[2]
        }
      }

      return await resolveSecretFromAzureKeyVault({
        token: credentials.token,
        vaultUrl,
        secretName,
        version,
        apiVersion,
      })
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveSecretFromAzureKeyVault = async ({
  token,
  vaultUrl,
  secretName,
  version,
  apiVersion,
}) => {
  // Ensure vaultUrl doesn't have trailing slash
  const baseUrl = vaultUrl.replace(/\/+$/, '')
  const versionPath = version ? `/${encodeURIComponent(version)}` : ''
  const url = `${baseUrl}/secrets/${encodeURIComponent(secretName)}${versionPath}?api-version=${apiVersion}`

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

    if (responseData.value !== undefined) {
      return responseData.value
    }

    throw new Error('No secret value found in Azure Key Vault response')
  } catch (error) {
    throw new Error(
      `Error fetching secret from Azure Key Vault: ${error.message}`,
    )
  }
}
