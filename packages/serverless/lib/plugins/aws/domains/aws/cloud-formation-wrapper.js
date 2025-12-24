/**
 * Wrapper class for AWS CloudFormation provider
 */

import {
  CloudFormationClient,
  DescribeStackResourceCommand,
  DescribeStacksCommand,
  ListExportsCommand,
} from '@aws-sdk/client-cloudformation'
import {
  addProxyToAwsClient,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import Globals from '../globals.js'
import Logging from '../logging.js'
import { getAWSPagedResults } from '../utils.js'

class CloudFormationWrapper {
  constructor(credentials) {
    // for the CloudFormation stack we should use the `base` stage not the plugin custom stage
    const defaultStackName =
      Globals.serverless.service.service + '-' + Globals.getBaseStage()
    this.stackName =
      Globals.serverless.service.provider.stackName || defaultStackName

    const config = {
      region: Globals.getRegion(),
      endpoint: Globals.getServiceEndpoint('cloudformation'),
      retryStrategy: Globals.getRetryStrategy(),
    }

    if (credentials) {
      config.credentials = credentials
    }

    this.cloudFormation = addProxyToAwsClient(new CloudFormationClient(config))
  }

  /**
   * Get an API id from the existing config or CloudFormation stack resources or outputs
   * @param {string} apiType
   * @returns {Promise<string>}
   */
  async findApiId(apiType) {
    const configApiId = await this.getConfigId(apiType)
    if (configApiId) {
      return configApiId
    }

    return await this.getStackApiId(apiType)
  }

  /**
   * Get an API id from the existing config or CloudFormation stack based on provider.apiGateway params
   * @param {string} apiType
   * @returns {Promise<string|null>}
   */
  async getConfigId(apiType) {
    const apiGateway = Globals.serverless.service.provider.apiGateway || {}
    const apiIdKey = Globals.gatewayAPIIdKeys[apiType]
    const apiGatewayValue = apiGateway[apiIdKey]

    if (apiGatewayValue) {
      if (typeof apiGatewayValue === 'string') {
        return apiGatewayValue
      }

      return await this.getCloudformationId(apiGatewayValue, apiType)
    }

    return null
  }

  async getCloudformationId(apiGatewayValue, apiType) {
    // in case object and Fn::ImportValue try to get API id from the CloudFormation outputs
    const importName = apiGatewayValue[Globals.CFFuncNames.fnImport]
    if (importName) {
      const importValues = await this.getImportValues([importName])
      const nameValue = importValues[importName]
      if (!nameValue) {
        Logging.logWarning(
          `CloudFormation ImportValue '${importName}' not found in the outputs`,
        )
      }
      return nameValue
    }

    const ref = apiGatewayValue[Globals.CFFuncNames.ref]
    if (ref) {
      try {
        return await this.getStackApiId(apiType, ref)
      } catch (error) {
        Logging.logWarning(`Unable to get ref ${ref} value.\n ${error.message}`)
        return null
      }
    }

    // log warning not supported restApiId
    Logging.logWarning(`Unsupported apiGateway.${apiType} object`)

    return null
  }

  /**
   * Gets rest API id from CloudFormation stack or nested stack
   * @param {string} apiType
   * @param {string} logicalResourceId
   * @returns {Promise<string>}
   */
  async getStackApiId(apiType, logicalResourceId = null) {
    if (!logicalResourceId) {
      logicalResourceId = Globals.CFResourceIds[apiType]
    }

    let response
    try {
      // trying to get information for specified stack name
      response = await this.getStack(logicalResourceId, this.stackName)
    } catch {
      // in case error trying to get information from some of nested stacks
      response = await this.getNestedStack(logicalResourceId, this.stackName)
    }

    if (!response) {
      throw new ServerlessError(
        `Failed to find logicalResourceId '${logicalResourceId}' for the stack ${this.stackName}\n` +
          'Make sure the stack exists and the API gateway event is added',
        ServerlessErrorCodes.domains.CLOUDFORMATION_STACK_RESOURCE_NOT_FOUND,
      )
    }

    const apiId = response.StackResourceDetail.PhysicalResourceId
    if (!apiId) {
      throw new ServerlessError(
        `No ApiId associated with CloudFormation stack ${this.stackName}`,
        ServerlessErrorCodes.domains.CLOUDFORMATION_API_ID_NOT_FOUND,
      )
    }

    return apiId
  }

  /**
   * Gets values by names from cloudformation exports
   * @param {string[]} names
   * @returns {Promise<any>}
   */
  async getImportValues(names) {
    const exports = await getAWSPagedResults(
      this.cloudFormation,
      'Exports',
      'NextToken',
      'NextToken',
      new ListExportsCommand({}),
    )
    // filter Exports by names which we need
    const filteredExports = exports.filter(
      (item) => names.indexOf(item.Name) !== -1,
    )
    // converting a list of unique values to dict
    // [{Name: "export-name", Value: "export-value"}, ...] - > {"export-name": "export-value"}
    return filteredExports.reduce(
      (prev, current) => ({ ...prev, [current.Name]: current.Value }),
      {},
    )
  }

  /**
   * Returns a description of the specified resource in the specified stack.
   * @param {string} logicalResourceId
   * @param {string} stackName
   * @returns {Promise<any>}
   */
  async getStack(logicalResourceId, stackName) {
    try {
      return await this.cloudFormation.send(
        new DescribeStackResourceCommand({
          LogicalResourceId: logicalResourceId,
          StackName: stackName,
        }),
      )
    } catch (err) {
      throw new ServerlessError(
        `Failed to find CloudFormation resources with an error: ${err.message}\n`,
        ServerlessErrorCodes.domains.CLOUDFORMATION_DESCRIBE_STACK_FAILED,
        { originalMessage: err.message },
      )
    }
  }

  /**
   * Returns a description of the specified resource in the specified nested stack.
   * @param {string} logicalResourceId
   * @param {string} stackName
   * @returns {Promise<any>}
   */
  async getNestedStack(logicalResourceId, stackName) {
    // get all stacks from the CloudFormation
    const stacks = await getAWSPagedResults(
      this.cloudFormation,
      'Stacks',
      'NextToken',
      'NextToken',
      new DescribeStacksCommand({}),
    )

    // filter stacks by given stackName and check by nested stack RootId
    const regex = new RegExp('/' + stackName + '/')
    const filteredStackNames = stacks.reduce((acc, stack) => {
      if (!stack.RootId) {
        return acc
      }
      const match = stack.RootId.match(regex)
      if (match) {
        acc.push(stack.StackName)
      }
      return acc
    }, [])

    for (const name of filteredStackNames) {
      try {
        // stop the loop and return the stack details in case the first one found
        // in case of error continue the looping
        return await this.getStack(logicalResourceId, name)
      } catch (err) {
        Logging.logWarning(err.message)
      }
    }
    return null
  }
}

export default CloudFormationWrapper
