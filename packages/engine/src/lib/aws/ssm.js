import {
  GetParameterCommand,
  ParameterNotFound,
  ParameterType,
  PutParameterCommand,
  SSMClient,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm'
import { addProxyToAwsClient } from '@serverless/util'

/**
 * @typedef {Object} GetSsmParams
 * @property {string} paramName - The name of the SSM parameter.
 */

/**
 * @typedef {Object} PutSsmParams
 * @property {string} paramName - The name of the SSM parameter.
 * @property {string} paramValue - The value to store in the SSM parameter.
 * @property {ParameterType} type - The type of the parameter.
 */

export class AwsSsmClient {
  /**
   * Initializes the SSM client.
   *
   * @param {Object} options - The options for initializing the SSM client.
   * @param {string} [options.region] - The AWS region to use for the SSM client.
   * @param {Object} [options.credentials] - The AWS credentials to use for the SSM client.
   * @returns {AwsSsmClient} The initialized SSM service.
   */
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(new SSMClient(awsConfig))
  }

  /**
   * Fetches the value of an SSM parameter.
   *
   * @param {GetSsmParams} params - The parameters for fetching the SSM parameter.
   * @returns {Promise<string|null>} - The value of the SSM parameter, or null if not found.
   */
  getSsmParameter = async ({ paramName }) => {
    try {
      const command = new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      })

      const response = await this.client.send(command)
      return response.Parameter.Value
    } catch (err) {
      const name = err.name
      if (err instanceof ParameterNotFound || name === 'ParameterNotFound') {
        return null
      }
      throw err
    }
  }

  /**
   * Stores a value in an SSM parameter.
   *
   * @param {PutSsmParams} params - The parameters for storing the SSM parameter.
   */
  storeSSMParameter = async ({
    paramName,
    paramValue,
    type = ParameterType.STRING,
    overwrite = false,
  }) => {
    const command = new PutParameterCommand({
      Name: paramName,
      Value: paramValue,
      Type: type,
      Overwrite: overwrite,
    })
    return await this.client.send(command)
  }

  deleteSSMParameter = async ({ paramName }) => {
    const command = new DeleteParameterCommand({
      Name: paramName,
    })
    return await this.client.send(command)
  }
}
