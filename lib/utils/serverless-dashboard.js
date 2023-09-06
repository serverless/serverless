'use strict';

const wait = require('timers-ext/promise/sleep');
const { log, progress } = require('@serverless/utils/log');
const {
  getPlatformClientWithAccessKey,
  getOrCreateAccessKeyForOrg,
} = require('@serverless/dashboard-plugin/lib/client-utils');
const apiRequest = require('@serverless/utils/api-request');
const { dashboardFrontend } = require('@serverless/utils/lib/auth/urls');
const { awsRequest } = require('./../cli/interactive-setup/utils');

const iamRoleStackName = 'Serverless-Inc-Role-Stack';
const cloudFormationServiceConfig = { name: 'CloudFormation', params: { region: 'us-east-1' } };

const DashboardService = (serverless, options) => {
  const integrationSetupProgress = progress.get('main');
  let context = {};

  /**
   * Wait for IAM Role Stack to be created
   * @returns
   */
  const waitUntilStackIsCreated = async () => {
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
    return waitUntilStackIsCreated();
  };

  /**
   * This must be run before any other method is run to ensure that
   * the context is properly configured
   */
  const configureIntegrationContext = async () => {
    const sdk = await getPlatformClientWithAccessKey(serverless.configurationInput.org);
    const accessKey = await getOrCreateAccessKeyForOrg(serverless.configurationInput.org);
    const org = await sdk.organizations.get({
      orgName: serverless.configurationInput.org,
    });
    const awsAccountId = await resolveAwsAccountId();

    const { integrations } = await apiRequest(`/api/integrations/?orgId=${org.orgUid}`, {
      urlName: 'integrationsBackend',
      accessKey,
      authMethod: 'dashboard',
    });
    const integration = integrations.find(({ vendorAccount }) => vendorAccount === awsAccountId);

    let mode = 'none';
    let startMessage = 'Disabling dashboard monitoring...';
    let successMessage = 'Dashboard monitoring is disabled';
    if (
      serverless.configurationInput.org &&
      serverless.configurationInput.app &&
      serverless.configurationInput.provider.name === 'aws'
    ) {
      mode = 'prod';
      startMessage = 'Enabling monitoring for your service\nThis may take a few minutes...';
      successMessage = 'Dashboard monitoring is enabled';
    }

    const targetFunctionNames = [];
    const targetInstrumentations = [];
    serverless.service.setFunctionNames(options);
    if (options.function) {
      const func = serverless.service.getFunction(options.function);
      const functionName = func.name;
      targetInstrumentations.push({
        instrumentations: {
          mode,
        },
        resourceKey: `aws_${awsAccountId}_function_${serverless.service.provider.region}_${functionName}`,
      });
      targetFunctionNames.push(functionName);
    } else {
      const names = serverless.service.getAllFunctionsNames();
      for (const name of names) {
        const functionName = name;
        targetInstrumentations.push({
          instrumentations: {
            mode,
          },
          resourceKey: `aws_${awsAccountId}_function_${serverless.service.provider.region}_${functionName}`,
        });
        targetFunctionNames.push(functionName);
      }
    }

    context = {
      serverless,
      options,
      accessKey,
      awsAccountId,
      integration,
      targetInstrumentations,
      targetFunctionNames,
      instrumentation: {
        startMessage,
        successMessage,
        mode,
      },
      org: {
        ...org,
        orgId: org.orgUid,
      },
    };
  };

  /**
   * This wil convert some error messages to be more user friendly
   * @param {string} message Failure message
   * @returns
   */
  const convertMessage = (message) => {
    if (/Cannot reference more than 5 layers/.test(message)) {
      return 'Too many layers. Please remove at least one layer from this function and try again.';
    }
    return message;
  };

  /**
   * Resolves local AWS Account Id
   * @returns
   */
  const resolveAwsAccountId = async () => {
    try {
      return (await awsRequest({ serverless }, 'STS', 'getCallerIdentity')).Account;
    } catch (error) {
      throw new Error('Could not determine AWS Account Id');
    }
  };

  /**
   * Wait for integration to be ready for instrumentation
   * @returns
   */
  const waitUntilIntegrationIsReady = async () => {
    await wait(2000);
    const { integrations } = await apiRequest(`/api/integrations/?orgId=${context.org.orgId}`, {
      urlName: 'integrationsBackend',
      accessKey: context.accessKey,
      authMethod: 'dashboard',
    });
    const integration = integrations.find(
      ({ vendorAccount }) => vendorAccount === context.awsAccountId
    );
    if (integration) {
      return integration;
    }
    return waitUntilIntegrationIsReady();
  };

  /**
   * Check instrumentation status of functions
   * @returns
   */
  const checkInstrumentationStatus = async (mode) => {
    const { total, hits } = await apiRequest(`/api/search/orgs/${context.org.orgId}/search`, {
      method: 'POST',
      accessKey: context.accessKey,
      authMethod: 'dashboard',
      body: {
        from: 0,
        size: context.targetFunctionNames.length,
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
                match: { instrument_mode: mode },
              },
              {
                terms: { 'aws_lambda_name.keyword': context.targetFunctionNames },
              },
            ],
          },
        },
      },
    });

    return {
      isInstrumented: total === context.targetFunctionNames.length,
      total: context.targetFunctionNames.length,
      instrumented: total,
      hits,
    };
  };

  /**
   * Wait for all function to be instrumented
   *
   * @param {string[]} flowIds This is an array of flowIds to wait for
   * @param {string} mode This is the instrumentation mode being set
   * @param {string} startMessage This is an optional message to display at the start of the instrumentation process
   *
   */
  const waitForInstrumentation = async (flowIds, startMessage, successMessage) => {
    let waiting = true;
    // 3 minutes per flowId which is a batch of 50 resources. For example 100 resources would be 6 minutes
    const MAX_TIMEOUT = flowIds.length * 1000 * 60 * 3;
    const startTime = Date.now();
    while (waiting) {
      // eslint-disable-next-line no-loop-func
      const apiRequests = flowIds.map((id) =>
        apiRequest(`/api/integrations/aws/flows/${encodeURIComponent(id)}`, {
          urlName: 'integrationsBackend',
          accessKey: context.accessKey,
          authMethod: 'dashboard',
        })
      );
      const results = await Promise.allSettled(apiRequests);

      const allResults = results
        .filter(({ status }) => status === 'fulfilled')
        .map(({ value }) => value);

      const completeFunctions = allResults.reduce(
        (functions, { inventories }) => [
          ...functions,
          ...inventories.filter(({ status }) => status === 'complete'),
        ],
        []
      );

      integrationSetupProgress.update(
        `${startMessage}\nUpdating ${completeFunctions.length}/${context.instrumentationCount} functions`
      );

      const allComplete = allResults.reduce((done, { status }) => {
        if (!done) return done;
        return status === 'complete' || status === 'incomplete';
      }, true);
      const allStatues = allResults.reduce((statuses, { status }) => {
        if (!statuses.includes(status)) {
          return [...statuses, status];
        }
        return statuses;
      }, []);

      if (allComplete) {
        const allIncompleteInventories = allResults.reduce(
          (incomplete, { inventories }) => [
            ...incomplete,
            ...inventories.filter(({ status }) => status === 'incomplete'),
          ],
          []
        );

        if (allIncompleteInventories.length > 0) {
          const failedFunctionList = allIncompleteInventories.map(
            ({ resourceKey, failReason }) =>
              `• ${resourceKey.split('_').pop()} - ${convertMessage(failReason)}`
          );
          log.warning(
            `Instrumentation failed for the following functions:\n${failedFunctionList.join('\n')}`
          );
        } else if (allStatues.some((status) => status === 'incomplete')) {
          log.error('Instrumentation failed. Please try again.');
        } else {
          log.notice.success(successMessage);
        }
        waiting = false;
      } else if (Date.now() - startTime > MAX_TIMEOUT) {
        log.notice.success(
          `Serverless Dashboard instrumentation is still running in the background.\n  Please refer to the Dashboard for progress.\n  ${dashboardFrontend}/${context.org.orgName}/settings`
        );
        waiting = false;
      } else {
        await wait(1000);
      }
    }
  };

  /**
   * Ensure the local AWS account has been instrumented properly
   * @param {string} successMessage This is an optional message to display at the end of the instrumentation process
   * @returns
   */
  const ensureIntegrationIsConfigured = async () => {
    // Do not run this if we have not generated context or we are not looking to set up the integration
    if (
      Object.keys(context).length === 0 ||
      !serverless.configurationInput.org ||
      !serverless.configurationInput.app ||
      (serverless.configurationInput.dashboard &&
        serverless.configurationInput.dashboard.disableMonitoring)
    ) {
      return false;
    } else if (
      context.integration &&
      context.integration.status === 'alive' &&
      context.integration.syncStatus !== 'pending'
    ) {
      log.notice.success('Your AWS account is integrated with Serverless Dashboard');
      return true;
    }
    if (!context.integration) {
      integrationSetupProgress.notice('Creating IAM Role for Serverless Dashboard');
      const { cfnTemplateUrl, params } = await apiRequest(
        `/api/integrations/aws/initial?orgId=${context.org.orgId}`,
        {
          urlName: 'integrationsBackend',
          accessKey: context.accessKey,
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

      if (!(await waitUntilStackIsCreated())) return false;

      integrationSetupProgress.notice('Validating integration');
      const integration = await waitUntilIntegrationIsReady();
      context.integration = integration;
    }
    await apiRequest(`/api/integrations/aws/${context.org.orgUid}/pre/integration`, {
      urlName: 'integrationsBackend',
      accessKey: context.accessKey,
      authMethod: 'dashboard',
      method: 'POST',
      body: {
        integrationId: context.integration.integrationId,
        targetInstrumentations: context.targetInstrumentations,
        serviceName: context.serverless.configurationInput.service,
      },
    });
    log.notice.success(
      `Serverless Dashboard is integrating with your AWS account (one-time set-up).\n  An email will be sent upon completion, or view progress within the Dashboard:\n  ${dashboardFrontend}/${context.org.orgName}/settings/integrations`
    );
    integrationSetupProgress.remove();
    context.integration.integrationInProgress = true;
    return true;
  };

  /**
   * Call this function to instrument or uninstrument all the functions in a service
   */
  const instrumentService = async () => {
    // Skip if we have not set up context or if there is no integration to instrument
    if (Object.keys(context).length === 0 || !context.integration) {
      integrationSetupProgress.remove();
      return;
    } else if (context.integration.integrationInProgress) {
      const integration = await waitUntilIntegrationIsReady();
      if (integration.status === 'failed') {
        log.error(
          `Your AWS account failed to integration with Serverless Dashboard.${
            integration.lastError ? `\n ${integration.lastError}` : ''
          }`
        );
        integrationSetupProgress.remove();
        return;
      }
    }

    const { mode, startMessage, successMessage } = context.instrumentation;
    const { isInstrumented, hits } = await checkInstrumentationStatus('prod');

    const shouldRunInstrumentation =
      (mode === 'prod' && !isInstrumented) || (mode === 'none' && isInstrumented);
    const instrumentedKeys = hits.map(({ id }) => id);
    if (shouldRunInstrumentation) {
      integrationSetupProgress.notice(startMessage);
      try {
        const distributeArrayBy50 = (array) => {
          const result = [];
          let index = 0;
          while (index < array.length) result.push(array.slice(index, (index += 50)));
          return result;
        };
        const chunkedResources = distributeArrayBy50(
          context.targetInstrumentations.filter(
            ({ resourceKey }) => !instrumentedKeys.includes(resourceKey)
          )
        );
        // Send requests to instrument
        context.instrumentationCount = chunkedResources.reduce(
          (sum, chunk) => sum + chunk.length,
          0
        );
        const flowIds = [];
        for (const chunk of chunkedResources) {
          const { flowId } = await apiRequest('/api/integrations/aws/instrumentations', {
            urlName: 'integrationsBackend',
            method: 'POST',
            authMethod: 'dashboard',
            accessKey: context.accessKey,
            body: {
              orgId: context.org.orgId,
              resources: chunk,
            },
          });
          flowIds.push(flowId);
        }

        // Wait for instrumentation to complete
        if (!context.integration.integrationInProgress) {
          await waitForInstrumentation(flowIds, startMessage, successMessage);
        }
      } catch (error) {
        log.error(error.message);
      }
    } else if (mode === 'prod') {
      log.notice.success(successMessage);
    }
    integrationSetupProgress.remove();
    return;
  };

  return {
    configureIntegrationContext,
    ensureIntegrationIsConfigured,
    instrumentService,
  };
};

module.exports = DashboardService;
