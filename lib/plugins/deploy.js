'use strict';

const wait = require('timers-ext/promise/sleep');
const { log, progress } = require('@serverless/utils/log');
const {
  getPlatformClientWithAccessKey,
  getOrCreateAccessKeyForOrg,
} = require('@serverless/dashboard-plugin/lib/client-utils');
const apiRequest = require('@serverless/utils/api-request');
const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const { awsRequest } = require('./../cli/interactive-setup/utils');

const iamRoleStackName = 'Serverless-Inc-Role-Stack';
const cloudFormationServiceConfig = { name: 'CloudFormation', params: { region: 'us-east-1' } };

const sharedProgressKey = 'main';

const waitUntilStackIsCreated = async (context) => {
  await wait(2000);
  const stackEvents = (
    await awsRequest(context, cloudFormationServiceConfig, 'describeStackEvents', {
      StackName: iamRoleStackName,
    })
  ).StackEvents;
  const failedStatusReasons = stackEvents
    .filter(({ ResourceStatus: status }) => {
      return status && status.endsWith('_FAILED');
    })
    .map(({ ResourceStatusReason: reason }) => reason);

  if (failedStatusReasons.length) {
    log.error(`Creating IAM Role failed:\n  - ${failedStatusReasons.join('\n  - ')}`);
    return false;
  }
  const statusEvent = stackEvents.find(
    ({ ResourceType: resourceType }) => resourceType === 'AWS::CloudFormation::Stack'
  );
  const status = statusEvent ? statusEvent.ResourceStatus : null;
  if (status && status.endsWith('_COMPLETE')) {
    if (status === 'CREATE_COMPLETE') return true;
    log.error('Creating IAM Role failed');
    return false;
  }
  return waitUntilStackIsCreated(context);
};

const waitUntilIntegrationIsReady = async (context) => {
  await wait(2000);
  const { integrations } = await apiRequest(`/api/integrations/?orgId=${context.org.orgId}`, {
    urlName: 'integrationsBackend',
    accessKey: context.accessKey,
    authMethod: 'dashboard',
  });
  const integration = integrations.find(
    ({ vendorAccount }) => vendorAccount === context.awsAccountId
  );
  if (integration) return integration;
  return waitUntilIntegrationIsReady(context);
};

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    this.commands = {
      deploy: {
        ...cliCommandsSchema.get('deploy'),
        commands: {
          function: {
            ...cliCommandsSchema.get('deploy function'),
          },
          list: {
            ...cliCommandsSchema.get('deploy list'),

            commands: {
              functions: {
                ...cliCommandsSchema.get('deploy list functions'),
              },
            },
          },
        },
      },
    };

    this.resolveAwsAccountId = async (context) => {
      try {
        return (await awsRequest(context, 'STS', 'getCallerIdentity')).Account;
      } catch (error) {
        throw new Error('Could not determine AWS Account Id');
      }
    };

    this.hooks = {
      'before:deploy:deploy': async () => {
        const provider = this.serverless.service.provider.name;
        if (!this.serverless.getProvider(provider)) {
          const errorMessage = `The specified provider "${provider}" does not exist.`;
          throw new ServerlessError(errorMessage, 'INVALID_PROVIDER');
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('package');
        }
      },
      'after:deploy:deploy': async () => {
        if (this.serverless.configurationInput.org) {
          const integrationSetupProgress = progress.get(sharedProgressKey);
          // Get access key for requests
          const accessKey = await getOrCreateAccessKeyForOrg(
            this.serverless.configurationInput.org
          );
          // Build context
          const sdk = await getPlatformClientWithAccessKey(this.serverless.configurationInput.org);
          const org = await sdk.organizations.get({
            orgName: this.serverless.configurationInput.org,
          });
          const context = {
            serverless: this.serverless,
            options: this.options,
            accessKey,
            org: {
              ...org,
              orgId: org.orgUid,
            },
          };
          // Get target AWS accountId
          const accountId = await this.resolveAwsAccountId(context);
          context.awsAccountId = accountId;
          // Check for existing integration
          const { integrations } = await apiRequest(
            `/api/integrations/?orgId=${context.org.orgId}`,
            {
              urlName: 'integrationsBackend',
              accessKey,
              authMethod: 'dashboard',
            }
          );

          let integration = integrations.find(
            ({ vendorAccount }) => vendorAccount === context.awsAccountId
          );

          let action = 'REMOVE_INSTRUMENTATION';

          // End here since we don't need to remove any instrumentation
          if (!this.serverless.configurationInput.monitor && !integration) {
            return true;
          }

          if (
            integration &&
            (integration.status !== 'alive' || integration.syncStatus === 'pending')
          ) {
            action = 'WAIT_FOR_INTEGRATION';
          } else if (!integration) {
            action = 'WAIT_FOR_INTEGRATION';
            integrationSetupProgress.notice('Creating IAM Role for Serverless Dashboard');
            const { cfnTemplateUrl, params } = await apiRequest(
              `/api/integrations/aws/initial?orgId=${context.org.orgId}`,
              {
                urlName: 'integrationsBackend',
                accessKey,
                authMethod: 'dashboard',
              }
            );

            await awsRequest(context, cloudFormationServiceConfig, 'createStack', {
              Capabilities: ['CAPABILITY_NAMED_IAM'],
              StackName: iamRoleStackName,
              TemplateURL: cfnTemplateUrl,
              Parameters: [
                { ParameterKey: 'AccountId', ParameterValue: params.accountId },
                { ParameterKey: 'ReportServiceToken', ParameterValue: params.reportServiceToken },
                { ParameterKey: 'ExternalId', ParameterValue: params.externalId },
                { ParameterKey: 'Version', ParameterValue: params.version },
              ],
            });

            if (!(await waitUntilStackIsCreated(context))) return false;
            integration = await waitUntilIntegrationIsReady(context);
          } else {
            action = 'INSTRUMENT_RESOURCES';
          }

          const mode = this.serverless.configurationInput.monitor ? 'prod' : 'none';
          const targetInstrumentations = [];
          context.serverless.service.setFunctionNames(context.options);
          if (context.options.function) {
            const func = context.serverless.service.getFunction(context.options.function);
            const functionName = func.name;
            targetInstrumentations.push({
              instrumentations: {
                mode,
              },
              resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
            });
          } else {
            const names = context.serverless.service.getAllFunctionsNames();
            for (const name of names) {
              const functionName = name;
              targetInstrumentations.push({
                instrumentations: {
                  mode,
                },
                resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
              });
            }
          }

          await apiRequest('/api/integrations/resources', {
            urlName: 'integrationsBackend',
            accessKey,
            authMethod: 'dashboard',
            method: 'PUT',
            body: {
              integrationId: integration.integrationId,
              accessKey,
              orgId: org.orgUid,
              action,
              targetInstrumentations,
            },
          });

          integrationSetupProgress.remove();
          if (this.serverless.configurationInput.monitor) {
            log.notice.success(
              'Serverless Dashboard is updating. Check Serverless Dashboard to see monitoring data.'
            );
          } else {
            log.notice.success(
              'Serverless Dashboard is removing instrumentation. This may take a few minutes for updates to appear in Serverless Dashboard.'
            );
          }
        }
        return true;
      },
    };
  }
}

module.exports = Deploy;
