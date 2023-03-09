'use strict';
const wait = require('timers-ext/promise/sleep');
const { log, progress } = require('@serverless/utils/log');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const apiRequest = require('@serverless/utils/api-request');

const successMessage = 'Your functions are instrumented for development.';
const progressKey = 'instrumentation-progress';

const allFunctionsExist = async (context) => {
  const { total } = await apiRequest(`/api/search/orgs/${context.org.orgId}/search`, {
    method: 'POST',
    body: {
      from: 0,
      size: context.targetFunctions.length,
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
              terms: { 'aws_lambda_name.keyword': context.targetFunctions },
            },
          ],
        },
      },
    },
  });

  return {
    allExist: total === context.targetFunctions.length,
    total: context.targetFunctions.length,
    functionCount: total,
  };
};

const checkInstrumentationStatus = async (context) => {
  const { total } = await apiRequest(`/api/search/orgs/${context.org.orgId}/search`, {
    method: 'POST',
    body: {
      from: 0,
      size: context.targetFunctions.length,
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
              match: { instrument_mode: 'dev' },
            },
            {
              terms: { 'aws_lambda_name.keyword': context.targetFunctions },
            },
          ],
        },
      },
    },
  });

  return {
    isInstrumented: total === context.targetFunctions.length,
    total: context.targetFunctions.length,
    instrumented: total,
  };
};

const waitForInstrumentation = async (context) => {
  const instrumentationProgress = progress.get(progressKey);
  let isInstrumenting = true;
  while (isInstrumenting) {
    const { isInstrumented: done, total, instrumented } = await checkInstrumentationStatus(context);
    instrumentationProgress.update(`Instrumenting ${instrumented}/${total} functions`);
    if (done) {
      isInstrumenting = false;
    } else {
      await wait(1000);
    }
  }
};

module.exports = {
  async isApplicable(context) {
    const { isConsole, serverless, launchDev, org } = context;

    if (!isConsole) {
      context.inapplicabilityReasonCode = 'NON_CONSOLE_CONTEXT';
      return false;
    }

    if (!launchDev) {
      context.inapplicabilityReasonCode = 'NO_ENABLE_DEV';
      return false;
    }

    if (!serverless) {
      context.inapplicabilityReasonCode = 'NO_FRAMEWORK_INITIALIZED';
      return false;
    }

    if (!(await resolveAuthMode())) {
      context.inapplicabilityReasonCode = 'NOT_LOGGED_IN';
      return false;
    }

    if (!org) {
      context.inapplicabilityReasonCode = 'UNRESOLVED_ORG';
      return false;
    }

    // Add single function name or all function names to the list
    const functionNames = [];
    const osFunctions = [];
    context.serverless.service.setFunctionNames(context.options);
    if (context.options.function) {
      const func = context.serverless.service.getFunction(context.options.function);
      const functionName = func.name;
      osFunctions.push({
        instrumentations: {
          mode: 'dev',
        },
        resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
      });
      functionNames.push(functionName);
    } else {
      const names = context.serverless.service.getAllFunctionsNames();
      for (const name of names) {
        const functionName = name;
        osFunctions.push({
          instrumentations: {
            mode: 'dev',
          },
          resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
        });
        functionNames.push(functionName);
      }
    }

    context.targetInstrumentations = osFunctions;
    context.targetFunctions = functionNames;

    const { allExist, total, functionCount } = await allFunctionsExist(context);
    if (!allExist) {
      log.notice(
        `Only ${functionCount} of ${total} functions exist on this integration. Be sure to deploy the service before using dev.`
      );
      context.deployNeeded = true;
      return false;
    }

    const { isInstrumented } = await checkInstrumentationStatus(context);
    if (isInstrumented) {
      log.notice.success(successMessage);
    }
    return !isInstrumented;
  },

  async run(context) {
    const instrumentationProgress = progress.get(progressKey);
    instrumentationProgress.notice('Instrumenting functions', 'This may take a few minutes...');
    // Chunk targetInstrumentations into 50 resources per request
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
        body: {
          orgId: context.org.orgId,
          resources: chunk,
        },
      });
    }

    // Wait for instrumentation to complete
    await waitForInstrumentation(context);

    log.notice.success(successMessage);
    return true;
  },
};
