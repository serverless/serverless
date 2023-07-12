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
const headerMessage = 'Enabling monitoring for your service\nThis may take a few minutes...';

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
  if (integration && integration.status === 'alive' && integration.syncStatus !== 'pending') return;
  await waitUntilIntegrationIsReady(context);
  return;
};

const checkInstrumentationStatus = async (context) => {
  const { total } = await apiRequest(`/api/search/orgs/${context.org.orgId}/search`, {
    method: 'POST',
    accessKey: context.accessKey,
    authMethod: 'dashboard',
    body: {
      from: 0,
      size: context.consoleDevModeTargetFunctions.length,
      query: {
        bool: {
          must: [
            {
              match: { type: 'resource_aws_lambda' },
            },
            {
              match: { tag_account_id: context.awsAccountId },
            },
            {
              match: { instrument_mode: 'prod' },
            },
            {
              terms: { 'aws_lambda_name.keyword': context.consoleDevModeTargetFunctions },
            },
          ],
        },
      },
    },
  });

  return {
    isInstrumented: total === context.consoleDevModeTargetFunctions.length,
    total: context.consoleDevModeTargetFunctions.length,
    instrumented: total,
  };
};

const waitForInstrumentation = async (context) => {
  const instrumentationProgress = progress.get(sharedProgressKey);
  let isInstrumenting = true;
  while (isInstrumenting) {
    const { isInstrumented: done, total, instrumented } = await checkInstrumentationStatus(context);
    instrumentationProgress.update(
      `${headerMessage}\nInstrumenting ${instrumented}/${total} functions`
    );
    if (done) {
      isInstrumenting = false;
    } else {
      await wait(1000);
    }
  }
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

          const integration = integrations.find(
            ({ vendorAccount }) => vendorAccount === context.awsAccountId
          );
          // Set up integration if applicable
          if (
            this.serverless.configurationInput.monitor &&
            this.serverless.configurationInput.provider.name === 'aws'
          ) {
            // Ensure integration is configured
            if (integration) {
              if (integration.status !== 'alive' || integration.syncStatus === 'pending') {
                try {
                  integrationSetupProgress.notice('Setting up Serverless Dashboard Integration');
                  await waitUntilIntegrationIsReady(context);
                } finally {
                  integrationSetupProgress.remove();
                }
              }
            } else {
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

              integrationSetupProgress.notice(
                'Setting up Serverless Dashboard Integration (this may take 5-10 minutes)'
              );

              await waitUntilIntegrationIsReady(context);
            }
            log.notice.success('Your AWS account is integrated with Serverless Dashboard');

            // Instrument service
            const targetFunctions = [];
            const targetInstrumentations = [];
            context.serverless.service.setFunctionNames(context.options);
            if (context.options.function) {
              const func = context.serverless.service.getFunction(context.options.function);
              const functionName = func.name;
              targetInstrumentations.push({
                instrumentations: {
                  mode: 'prod',
                },
                resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
              });
              targetFunctions.push(functionName);
            } else {
              const names = context.serverless.service.getAllFunctionsNames();
              for (const name of names) {
                const functionName = name;
                targetInstrumentations.push({
                  instrumentations: {
                    mode: 'prod',
                  },
                  resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
                });
                targetFunctions.push(functionName);
              }
            }
            context.targetInstrumentations = targetInstrumentations;
            context.consoleDevModeTargetFunctions = targetFunctions;

            const { isInstrumented } = await checkInstrumentationStatus(context);
            if (!isInstrumented) {
              integrationSetupProgress.notice(headerMessage);
              try {
                const distributeArrayBy50 = (array) => {
                  const result = [];
                  let index = 0;
                  while (index < array.length) result.push(array.slice(index, (index += 50)));
                  return result;
                };
                const chunkedResources = distributeArrayBy50(context.targetInstrumentations);
                // Send requests to instrument
                for (const chunk of chunkedResources) {
                  await apiRequest('/api/integrations/aws/instrumentations', {
                    urlName: 'integrationsBackend',
                    method: 'POST',
                    authMethod: 'dashboard',
                    accessKey,
                    body: {
                      orgId: context.org.orgId,
                      resources: chunk,
                    },
                  });
                }

                // Wait for instrumentation to complete
                await waitForInstrumentation(context);
              } catch (error) {
                log.error(error.message);
              }
            }
            integrationSetupProgress.remove();
            log.notice.success('Dashboard monitoring is enabled');
          } else if (
            !this.serverless.configurationInput.monitor &&
            this.serverless.configurationInput.org &&
            integration
          ) {
            // Instrument service
            const targetFunctions = [];
            const targetInstrumentations = [];
            context.serverless.service.setFunctionNames(context.options);
            if (context.options.function) {
              const func = context.serverless.service.getFunction(context.options.function);
              const functionName = func.name;
              targetInstrumentations.push({
                instrumentations: {
                  mode: 'none',
                },
                resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
              });
              targetFunctions.push(functionName);
            } else {
              const names = context.serverless.service.getAllFunctionsNames();
              for (const name of names) {
                const functionName = name;
                targetInstrumentations.push({
                  instrumentations: {
                    mode: 'none',
                  },
                  resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
                });
                targetFunctions.push(functionName);
              }
            }
            context.targetInstrumentations = targetInstrumentations;
            context.consoleDevModeTargetFunctions = targetFunctions;

            const { isInstrumented } = await checkInstrumentationStatus(context);

            if (isInstrumented) {
              integrationSetupProgress.notice('Disabling Monitoring...');
              try {
                const distributeArrayBy50 = (array) => {
                  const result = [];
                  let index = 0;
                  while (index < array.length) result.push(array.slice(index, (index += 50)));
                  return result;
                };
                const chunkedResources = distributeArrayBy50(context.targetInstrumentations);
                // Send requests to instrument
                for (const chunk of chunkedResources) {
                  await apiRequest('/api/integrations/aws/instrumentations', {
                    urlName: 'integrationsBackend',
                    method: 'POST',
                    authMethod: 'dashboard',
                    accessKey,
                    body: {
                      orgId: context.org.orgId,
                      resources: chunk,
                    },
                  });
                }

                // Wait for instrumentation to complete
                await waitForInstrumentation(context);
              } catch (error) {
                log.error(error.message);
              }
              log.notice.success('Dashboard monitoring is disabled');
            }
            integrationSetupProgress.remove();
          }
        }
        return true;
      },
    };
  }
}

module.exports = Deploy;
