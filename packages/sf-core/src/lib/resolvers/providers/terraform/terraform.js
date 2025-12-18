import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { addProxyToAwsClient } from '@serverless/util'
import { text } from 'stream/consumers'
import _ from 'lodash'
import { AbstractProvider } from '../index.js'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'

export class Terraform extends AbstractProvider {
  static type = 'terraform'
  static resolvers = ['outputs']
  static defaultResolver = 'outputs'

  static validateConfig(providerConfig) {
    /**
     * The schema for the S3 backend configuration.
     */
    const s3ConfigSchema = z
      .object({
        type: z.literal('terraform'),
        backend: z.literal('s3'),
        bucket: z.string({
          message: "The 'bucket' property is required and must be a string",
        }),
        key: z.string({
          message: 'The `key` property is required and must be a string',
        }),
        region: z
          .string({
            message: "The 'region' property must be a string",
          })
          .optional(),
      })
      .strict(
        "Only 'bucket', 'key', and 'region' are allowed in the remote backend configuration",
      )

    /**
     * Schema for the http backend configuration.
     */
    const httpConfigSchema = z
      .object({
        type: z.literal('terraform'),
        backend: z.literal('http'),
        address: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
      })
      .strict(
        "Only 'address', 'username', and 'password' are allowed in the http backend configuration",
      )

    /**
     * The schema for the remote backend configuration.
     */
    const workspaceIdSchema = z.object({
      workspaceId: z.string({
        message:
          "Either 'workspaceId' or 'organization' and 'workspace' are required",
      }),
    })
    const workspaceNameSchema = z.object({
      workspace: z.string({
        message:
          "Either 'workspaceId' or 'organization' and 'workspace' are required",
      }),
      organization: z.string({
        message:
          "Either 'workspaceId' or 'organization' and 'workspace' are required",
      }),
    })
    const remoteConfigSchema = z
      .object({
        type: z.literal('terraform'),
        backend: z.literal('remote'),
        token: z.string().optional(),
        hostname: z.string().optional(),
        workspaceId: z.string().optional(),
        workspace: z.string().optional(),
        organization: z.string().optional(),
      })
      .strict(
        "Only 'token', 'hostname', 'workspaceId', 'workspace', and 'organization' are allowed in the remote backend configuration",
      )
      .refine(
        (data) => {
          /**
           * Ideally I'd like to use the zod `or` method to validate that either
           * `workspaceId` or `organization` and `workspace` are provided, but the
           * `or` method is not working as expected. So I'm using a custom refine
           * method to validate this.
           */
          return (
            workspaceIdSchema.safeParse(data).success ||
            workspaceNameSchema.safeParse(data).success
          )
        },
        {
          message:
            "Either 'workspaceId' or 'organization' and 'workspace' are required",
          path: ['backend', 'workspaceId', 'workspace', 'organization'],
        },
      )

    /**
     * Base schema is the schema that is applicable to all configurations. This
     * includes "type", which is always "terraform" as thats the resolver type,
     * and "backend", which is either "s3" or "remote".
     */
    const baseSchema = z.object({
      type: z.literal('terraform', {
        message: "The 'type' property must be 'terraform'",
      }),
      backend: z.enum(['s3', 'remote', 'http'], {
        message:
          'Only the "s3", "remote", and "http" backends are supported at this time',
      }),
    })

    try {
      baseSchema.parse(providerConfig)

      if (providerConfig.backend === 's3') {
        s3ConfigSchema.parse(providerConfig)
      } else if (providerConfig.backend === 'remote') {
        remoteConfigSchema.parse(providerConfig)
      } else if (providerConfig.backend === 'http') {
        httpConfigSchema.parse(providerConfig)
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issue = error.issues[0]
        throw new Error(issue.message)
      } else {
        throw error
      }
    }
  }

  resolveVariable = async ({ resolverType, resolutionDetails, key }) => {
    super.resolveVariable({ resolverType, resolutionDetails, key })
    if (resolverType === 'outputs') {
      let terraformStateOutputs = {}
      if (this.config.backend === 's3') {
        terraformStateOutputs = await resolveTerraformOutputsFromS3({
          bucket: this.config.bucket,
          key: this.config.key,
          region: this.config.region,
        })
      } else if (this.config.backend === 'remote') {
        terraformStateOutputs = await resolveTerraformOutputsFromRemote({
          hostname: this.config.hostname,
          token: this.config.token,
          organization: this.config.organization,
          workspace: this.config.workspace,
          workspaceId: this.config.workspaceId,
        })
      } else if (this.config.backend === 'http') {
        terraformStateOutputs = await resolveTerraformOutputsFromHttp({
          address: this.config.address,
          username: this.config.username,
          password: this.config.password,
        })
      }

      /**
       * We use lodash get() instead of terraformStateOutputs[key] to allow for
       * getting values from nested objects.
       */
      const value = _.get(terraformStateOutputs, key)
      return value
    }

    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

/**
 * The main resolver for Terraform outputs from an AWS S3 bucket.
 */
const resolveTerraformOutputsFromS3 = async ({ bucket, key, region }) => {
  const clientConfig = {}

  /**
   * If a region is provided, it is used to configure the S3 client.
   */
  if (region) {
    clientConfig.region = region
  }

  try {
    /**
     * This gets the contents of the Terraform state file from the S3 bucket.
     */
    const client = addProxyToAwsClient(new S3Client(clientConfig))
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
    const response = await client.send(command)

    /**
     * The content is a stream, this method reads the stream into a string. Then
     * the JSON is parsed to get the Terraform state, including the outputs.
     */
    const stateFile = await text(response.Body)
    const state = JSON.parse(stateFile)

    /**
     * Lastly, the outputs field is formatted as {key:{value:"value"}}, so this
     * maps the outputs to a simpler object {key:"value"} to make it compatible
     * with the expected output format
     */
    return Object.fromEntries(
      Object.entries(state.outputs || {}).map(([key, value]) => [
        key,
        value.value,
      ]),
    )
  } catch (error) {
    throw new Error(`Error fetching Terraform outputs from S3: ${error}`)
  }
}

/**
 * Terraform by default looks for a token stored in the TF_TOKEN_<hostname>
 * environment variable, where the hostname is the hostname of the remote API
 * compatible endpoint. The hostname is denoted with '_' instead of '.' in the
 * environment variable. This env var key is referenced in the logic to get the
 * default token as well as the error message; as such, we have this method to
 * get the key name.
 */
const getTokenEnvVarKey = (hostname) =>
  `TF_TOKEN_${new URL(hostname).hostname.replace(/\./g, '_')}`

/**
 * The Terraform CLI has a "login" command, which stores the token in a file.
 * The tokens are stored under credentials.<hostname>.token. Therefore the
 * hostname is provided in this method to get the correct token.
 */
const getTerraformToken = (hostname) => {
  /**
   * This is the default method for getting the tokens for the remote backend
   * in Terraform.
   */
  const tokenEnvVarKey = getTokenEnvVarKey(hostname)
  if (process.env[tokenEnvVarKey]) {
    return process.env[tokenEnvVarKey]
  }

  /**
   * The Terraform Cloud token can be provided as an environment variable. This
   * is supported; however, this method is no longer in favor of using as the
   * TF_TOKEN_app_terraform_io environment variable, should be used instead.
   */
  if (process.env.TF_CLOUD_TOKEN) {
    return process.env.TF_CLOUD_TOKEN
  }

  const credentialsPath = path.join(
    process.env.HOME,
    '.terraform.d',
    'credentials.tfrc.json',
  )
  try {
    const rawData = fs.readFileSync(credentialsPath, 'utf-8')
    const credentials = JSON.parse(rawData)
    return credentials['credentials'][hostname]['token']
  } catch (error) {
    return null
  }
}

/**
 * API Client for the Terraform HCP API.
 */
const terraformCloudClient = (hostname, token) => {
  const baseURL = hostname
  const headers = {
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${token}`,
  }

  return async (path) => {
    const url = new URL(path, baseURL)
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.statusText}: ${errorText}`)
    }

    return response.json()
  }
}

const resolveTerraformOutputsFromRemote = async ({
  hostname,
  token,
  organization,
  workspace,
  workspaceId,
}) => {
  /**
   * The app.terraform.io is the hostname for Terraform HCP (formerly Cloud).
   * Other services, like Artifactory, may have different hostnames. Terraform
   * Enterprise may also be hosted on a different domain. The hostname option
   * allows using either of these services.
   */
  const apiUrl = hostname || 'https://app.terraform.io/api/v2/'
  const tokenEnvVarKey = getTokenEnvVarKey(apiUrl)
  const apiToken = token || getTerraformToken(apiUrl)
  if (!apiToken) {
    throw new Error(
      `Terraform token is required, either from the "token" property, "~/.terraform.d/credentials.tfrc.json" file, "TF_CLOUD_TOKEN" env var, or "${tokenEnvVarKey}" env var`,
    )
  }
  const client = terraformCloudClient(apiUrl, apiToken)

  /**
   * The API to get the Terraform state outputs requires the workspace ID;
   * however, we'd also like to support getting this by organization and
   * workspace name. This block of code gets the workspace ID from the
   * organization and workspace name.
   */
  if (organization && workspace) {
    const workspacePath = [
      'organizations',
      organization,
      'workspaces',
      workspace,
    ]
    try {
      const response = await client(path.join(...workspacePath))
      workspaceId = response.data.id
    } catch (error) {
      throw new Error(
        `Error fetching Terraform outputs from Terraform API: ${error}`,
      )
    }
  }

  /**
   * Lastly, we get the Terraform outputs from the Terraform API, parse them
   * and return the entire object.
   */
  try {
    const currentOutputsPath = [
      'workspaces',
      workspaceId,
      'current-state-version-outputs',
    ]
    const response = await client(path.join(...currentOutputsPath))
    return Object.fromEntries(
      response.data.map((e) => [e.attributes.name, e.attributes.value]),
    )
  } catch (error) {
    throw new Error(
      `Error fetching Terraform outputs from Terraform API: ${error}`,
    )
  }
}

const resolveTerraformOutputsFromHttp = async ({
  address,
  username,
  password,
}) => {
  /**
   * https://developer.hashicorp.com/terraform/language/settings/backends/http#configuration-variables
   *
   * These three settings are required to get the state from the TF HTTP
   * backend. As per the docs (linked), the names TF_HTTP are the standard way
   * of defining those variables if not defined in the .tf file. Therefore, if
   * the user has them defined for use with TF, then it'll work with SF as well.
   */
  const apiAddress = address || process.env.TF_HTTP_ADDRESS
  const apiUsername = username || process.env.TF_HTTP_USERNAME
  const apiPassword = password || process.env.TF_HTTP_PASSWORD
  if (!apiAddress) {
    throw new Error(
      'Terraform HTTP backend requires a valid URL address, either from the `address` property or from the `TF_HTTP_ADDRESS` environment variable',
    )
  }

  /**
   * In theory, the credentials are optional, so we only set them if specified.
   */
  const requestOptions = { method: 'GET', headers: {} }
  if (apiUsername || apiPassword) {
    const basicAuthValue = btoa(`${apiUsername || ''}:${apiPassword || ''}`)
    requestOptions.headers['Authorization'] = `Basic ${basicAuthValue}`
  }

  try {
    const response = await fetch(apiAddress, requestOptions)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.statusText}: ${errorText}`)
    }

    const responseData = await response.json()

    /**
     * The response is an object, with the format {<key>: {value: <value>}}, so
     * we remap it to {<key>: <value>}
     */
    return Object.fromEntries(
      Object.entries(responseData.outputs || []).map(([key, value]) => [
        key,
        value.value,
      ]),
    )
  } catch (error) {
    throw new Error(
      `Error fetching Terraform outputs from HTTP backend: ${error}`,
    )
  }
}
