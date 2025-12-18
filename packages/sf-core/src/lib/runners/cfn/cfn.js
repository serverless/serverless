import { AwsCloudformationService } from '@serverless/engine/src/lib/aws/cloudformation.js'
import { getCfnConfig } from './utils.js'
import {
  getAwsCredentialProvider,
  getConfigFilePath,
} from '../../../utils/index.js'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import { Runner } from '../index.js'
import path from 'path'
import deploy from './commands/deploy.js'
import remove from './commands/remove.js'
import info from './commands/info.js'
import print from './commands/print.js'

export class CfnRunner extends Runner {
  constructor({
    config,
    command,
    configFilePath,
    options,
    versionFramework,
    resolverManager,
    compose,
  }) {
    super({
      config,
      configFilePath,
      command,
      options,
      versionFramework,
      resolverManager,
      compose,
    })
  }

  static configFileNames = ['samconfig', 'template']
  static runnerType = 'cfn'

  getAwsDeploymentCredentials
  templateFile
  samConfigFile

  getCliSchema() {
    return [
      {
        command: 'deploy',
        description: 'Deploy a SAM/CloudFormation stack',
        builder: [
          {
            options: {
              stage: {
                description: 'Stage to deploy to (e.g., dev, prod)',
                type: 'string',
                alias: 's',
              },
              region: {
                description: 'Region to deploy to (e.g., us-east-1, us-east-2)',
                type: 'string',
                alias: 'r',
              },
              stack: {
                description: 'Stack name to deploy',
                type: 'string',
                alias: 'st',
              },
              bucket: {
                description: 'Deployment bucket to upload artifacts to',
                type: 'string',
                alias: 'b',
              },
            },
          },
        ],
      },
      {
        command: 'remove',
        description: 'Removes a SAM/CloudFormation stack',
        builder: [
          {
            options: {
              stage: {
                description: 'Stage to deploy to (e.g., dev, prod)',
                type: 'string',
                alias: 's',
              },
              region: {
                description: 'Region to deploy to (e.g., us-east-1, us-east-2)',
                type: 'string',
                alias: 'r',
              },
              stack: {
                description: 'Stack name to deploy',
                type: 'string',
                alias: 'st',
              },
              bucket: {
                description: 'Deployment bucket to upload artifacts to',
                type: 'string',
                alias: 'b',
              },
            },
          },
        ],
      },
      {
        command: 'info',
        description: 'Displays service information',
        builder: [
          {
            options: {
              stage: {
                description: 'Stage to deploy to (e.g., dev, prod)',
                type: 'string',
                alias: 's',
              },
              region: {
                description: 'Region to deploy to (e.g., us-east-1, us-east-2)',
                type: 'string',
                alias: 'r',
              },
              stack: {
                description: 'Stack name to deploy',
                type: 'string',
                alias: 'st',
              },
            },
          },
        ],
      },
      {
        command: 'print',
        description: 'Print the service configuration',
        builder: [
          {
            options: {
              format: {
                description:
                  'Print configuration in given format ("yaml", "json", "text"). Default: yaml',
                type: 'string',
                default: 'yaml',
                alias: 's',
              },
            },
          },
        ],
      },
    ]
  }

  async run() {
    let state, serviceUniqueId

    // Authenticate
    const authenticatedData = await this.resolveVariablesAndAuthenticate()

    // Resolve the variables in the template file
    await this.resolveVariables()

    // Read the template file
    await this.readTemplateFile()

    // Get the AWS deployment credentials
    await this.getAwsCredentialProvider()

    // Run the command
    switch (this.command[0]) {
      case 'deploy': {
        state = await deploy({
          options: this.options,
          samConfigFile: this.samConfigFile,
          templateFile: this.templateFile,
          credentials: await this.getAwsDeploymentCredentials(),
          servicePath: path.dirname(this.configFilePath),
          composeServiceName: this.compose?.serviceName,
        })
        serviceUniqueId = state?.id
        break
      }
      case 'remove': {
        state = await remove({
          options: this.options,
          samConfigFile: this.samConfigFile,
          credentials: await this.getAwsDeploymentCredentials(),
          composeServiceName: this.compose?.serviceName,
        })
        serviceUniqueId = state?.id
        break
      }
      case 'info': {
        state = await info({
          options: this.options,
          samConfigFile: this.samConfigFile,
          credentials: await this.getAwsDeploymentCredentials(),
          composeServiceName: this.compose?.serviceName,
        })
        serviceUniqueId = state?.id
        break
      }
      case 'print':
        state = await print({
          templateFile: this.templateFile,
          format: this.options.format || 'yaml',
        })
        break
      default:
        throw new Error('Command not found')
    }
    this.serviceUniqueId = serviceUniqueId
    return { authenticatedData, state, serviceUniqueId }
  }

  async getAwsCredentialProvider() {
    const { region, resolveCredentials } = await getAwsCredentialProvider({
      awsProfile: this.options?.['aws-profile'],
      providerAwsAccessKeyId:
        this.authenticatedData?.dashboard?.serviceProvider?.accessKeyId,
      providerAwsSecretAccessKey:
        this.authenticatedData?.dashboard?.serviceProvider?.secretAccessKey,
      providerAwsSessionToken:
        this.authenticatedData?.dashboard?.serviceProvider?.sessionToken,
      resolversManager: this.resolverManager,
    })

    this.getAwsDeploymentCredentials = resolveCredentials
    return { region, resolveCredentials }
  }

  async getServiceUniqueId() {
    // Make sure Runner is completely initialized, config resolved and so on,
    // before getting the stackId. This is important because the stackId is
    // dependent on the config.
    if (!this.authenticatedData) {
      await this.resolveVariablesAndAuthenticate()
    }
    await this.resolveVariables()
    await this.readTemplateFile()
    if (!this.getAwsDeploymentCredentials) {
      await this.getAwsCredentialProvider()
    }
    const deploymentCredentials = await this.getAwsDeploymentCredentials()

    const { stackName, region } = getCfnConfig({
      options: this.options,
      samConfigFile: this.samConfigFile,
    })

    const { stackId } = await getStackId({
      stackName,
      region,
      credentials: deploymentCredentials,
    })

    return { serviceUniqueId: stackId }
  }

  async getUsageEventDetails() {
    const cfnConfig = getCfnConfig({
      options: this.options,
      samConfigFile: this.samConfigFile,
    })

    // Resolve credentials
    const credentials = this.getAwsDeploymentCredentials
      ? await this.getAwsDeploymentCredentials()
      : null

    return {
      service: {
        awsAccountId: credentials?.accountId || null,
        regionName: cfnConfig?.region,
        stageName: cfnConfig?.stage,
      },
      awsCfStack: {
        awsCfStackId: this.serviceUniqueId,
      },
    }
  }

  async readTemplateFile() {
    if (this.templateFile) {
      return
    }
    if (path.parse(this.configFilePath).name === 'samconfig') {
      this.samConfigFile = this.config
      const template_file = this.options.stage
        ? this.config[this.options.stage]?.deploy.parameters.template_file
        : this.config?.default?.deploy?.parameters?.template_file // we only care about the deploy parameters
      if (template_file) {
        const specifiedTemplateFilePath = await getConfigFilePath({
          configFileDirPath: path.dirname(this.configFilePath),
          configFileName: template_file.split('.')[0], // because it is usually specified like this: template.yaml
        })
        if (!specifiedTemplateFilePath) {
          // samconfig file found, but the specified custom template file name does not exist
          const err = new ServerlessError(
            `Could not find the specified template file "${template_file}"`,
            ServerlessErrorCodes.sam.TEMPLATE_FILE_NOT_FOUND,
          )
          err.stack = undefined
          throw err
        }
        // samconfig file found and custom template file name specified and found.
        await this.reloadConfig({ configFilePath: specifiedTemplateFilePath })
        await this.resolveVariables()
        this.templateFile = this.config
      } else {
        const defaultTemplateFilePath = await getConfigFilePath({
          configFileDirPath: path.dirname(this.configFilePath),
          configFileName: 'template',
        })
        await this.reloadConfig({ configFilePath: defaultTemplateFilePath })
        await this.resolveVariables()
        this.templateFile = this.config
      }
    } else {
      this.templateFile = this.config
    }
    // This is the latest and only valid format version for AWS SAM templates
    // REF: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/format-version-structure.html
    // We have to explicitly set it because the parser reads it as
    // date type '2010-09-09T00:00:00.000Z' if it is without quotes
    this.templateFile.AWSTemplateFormatVersion = '2010-09-09'
  }
}

const getStackId = async ({ stackName, region, credentials }) => {
  const awsCloudformation = new AwsCloudformationService({
    region,
    credentials,
  })

  const awsStackInfo = await awsCloudformation.describeStack(stackName)

  return {
    stackId: awsStackInfo?.StackId,
    timeCreated: awsStackInfo?.CreationTime?.toISOString(),
    timeUpdated: awsStackInfo?.LastUpdatedTime?.toISOString(),
  }
}
