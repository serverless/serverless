'use strict';
const wait = require('timers-ext/promise/sleep');
const { log, progress } = require('@serverless/utils/log');
const apiRequest = require('@serverless/utils/api-request');

const progressKey = 'dev-mode-progress';

const allFunctionsExist = async (context) => {
  const { total, hits } = await apiRequest(`/api/search/orgs/${context.org.orgId}/search`, {
    method: 'POST',
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
              terms: { 'aws_lambda_name.keyword': context.consoleDevModeTargetFunctions },
            },
          ],
        },
      },
    },
  });

  return {
    hits,
    allExist: total === context.consoleDevModeTargetFunctions.length,
    total: context.consoleDevModeTargetFunctions.length,
    functionCount: total,
  };
};

const checkInstrumentationStatus = async (context) => {
  const { total } = await apiRequest(`/api/search/orgs/${context.org.orgId}/search`, {
    method: 'POST',
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
              match: { instrument_mode: 'dev' },
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

const headerMessage = 'Instrumenting functions';
const warningMessage =
  'WARNING: Dev mode will not sample traces. This may increase CloudWatch and Serverless Console costs for higher volume functions.';

const waitForInstrumentation = async (context) => {
  const instrumentationProgress = progress.get(progressKey);
  let isInstrumenting = true;
  while (isInstrumenting) {
    const { isInstrumented: done, total, instrumented } = await checkInstrumentationStatus(context);
    instrumentationProgress.update(
      `${headerMessage}\n${warningMessage}\nInstrumenting ${instrumented}/${total} functions`
    );
    if (done) {
      isInstrumenting = false;
    } else {
      await wait(1000);
    }
  }
};

module.exports = {
  async isApplicable(context) {
    const { isConsoleDevMode, org } = context;

    if (!isConsoleDevMode) {
      context.inapplicabilityReasonCode = 'NON_DEV_MODE_CONTEXT';
      return false;
    }

    if (!org) {
      context.inapplicabilityReasonCode = 'UNRESOLVED_ORG';
      return false;
    }

    const instrumentationProgress = progress.get(progressKey);
    instrumentationProgress.update('Validating Serverless Console instrumentation status');

    // Add single function name or all function names to the list
    const targetFunctions = [];
    const targetInstrumentations = [];
    context.serverless.service.setFunctionNames(context.options);
    if (context.options.function) {
      const func = context.serverless.service.getFunction(context.options.function);
      const functionName = func.name;
      targetInstrumentations.push({
        instrumentations: {
          mode: 'dev',
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
            mode: 'dev',
          },
          resourceKey: `aws_${context.awsAccountId}_function_${context.serverless.service.provider.region}_${functionName}`,
        });
        targetFunctions.push(functionName);
      }
    }

    context.targetInstrumentations = targetInstrumentations;
    context.consoleDevModeTargetFunctions = targetFunctions;
    const { allExist, total, functionCount, hits } = await allFunctionsExist(context);
    if (!allExist) {
      const foundFunctionNames = hits.map(({ aws_lambda_name: awsLambdaName }) => awsLambdaName);
      log.notice();
      const promptLogger = functionCount === 0 ? log.error : log.warning;
      promptLogger(
        `${functionCount} of ${total} functions exist in your console integration. Deploy your service now to add these functions to your integration.\n`
      );
      if (functionCount === 0) {
        context.inapplicabilityReasonCode = 'NO_FUNCTIONS_EXIST';
        context.targetInstrumentations = undefined;
        context.consoleDevModeTargetFunctions = undefined;
        return false;
      }
      context.consoleDevModeTargetFunctions = foundFunctionNames;
      context.targetInstrumentations = context.targetInstrumentations.filter((target) => {
        const name = target.resourceKey.split('_').pop();
        return foundFunctionNames.includes(name);
      });
    }

    const { isInstrumented } = await checkInstrumentationStatus(context);
    if (isInstrumented) {
      context.inapplicabilityReasonCode = 'ALREADY_INSTRUMENTED';
    }
    return !isInstrumented;
  },

  async run(context) {
    const instrumentationProgress = progress.get(progressKey);
    instrumentationProgress.notice(
      `${headerMessage}\n${warningMessage}\nThis may take a few minutes...`
    );
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
    return true;
  },
};
