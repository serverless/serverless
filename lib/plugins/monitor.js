'use strict';

const cliCommandsSchema = require('../cli/commands-schema');
const { StepHistory } = require('@serverless/utils/telemetry');
const inquirer = require('@serverless/utils/inquirer');
const log = require('@serverless/utils/log').log.get('monitoring');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/is-authenticated');
const hasLocalCredentials = require('./../aws/has-local-credentials');
const { awsRequest } = require('./../cli/interactive-setup/utils');

const steps = {
  dashboardLogin: require('./../cli/interactive-setup/dashboard-login'),
  dashboardSetOrg: require('./../cli/interactive-setup/dashboard-set-org'),
  awsCredentials: require('./../cli/interactive-setup/aws-credentials'),
  deploy: require('./../cli/interactive-setup/deploy'),
  consoleSetupIamRole: require('./../cli/interactive-setup/console-setup-iam-role'),
};

class Monitor {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.cache = {};

    this.commands = {
      monitor: {
        ...cliCommandsSchema.get('monitor'),
      },
    };
    this.hooks = {
      'monitor:monitor': this.monitor.bind(this),
    };
  }

  async resolveAwsAccountId(context) {
    try {
      return (await awsRequest(context, 'STS', 'getCallerIdentity')).Account;
    } catch {
      return null;
    }
  }

  async monitor() {
    const stepsDetails = new Map(
      Object.entries(steps).map(([stepName, step]) => {
        return [stepName, { configuredQuestions: step.configuredQuestions }];
      })
    );
    // Build initial context
    const context = {
      history: new Map(),
      inquirer,
      configuration: this.serverless.configurationInput,
      options: this.options,
      awsAccountId: await this.resolveAwsAccountId({ serverless: this.serverless }),
      initial: {
        isInServiceContext: true,
        isDashboardEnabled: Boolean(
          this.serverless.configuration && this.serverless.configuration.org
        ),
      },
      serviceDir: true,
      isLoggedIntoDashboard: isAuthenticated(),
      hasLocalAwsCredentials: hasLocalCredentials(),
      isDashboard: true,
      isConsole: true,
    };
    // Run the described steps
    //   - Modify the console set up IAM role step to show errors and update verbiage to match linear ticket
    for (const [stepName, step] of Object.entries(steps)) {
      delete context.stepHistory;
      delete context.inapplicabilityReasonCode;
      const stepData = await step.isApplicable(context);

      // console.log(stepName, stepData, context.inapplicabilityReasonCode);
      if (stepData) log.debug('%s: applicable: %o', stepName, stepData);
      else log.debug('%s: not applicable: %s', stepName, context.inapplicabilityReasonCode);

      Object.assign(stepsDetails.get(stepName), {
        isApplicable: Boolean(stepData),
        inapplicabilityReasonCode: context.inapplicabilityReasonCode,
        timestamp: Date.now(),
      });

      if (stepData) {
        log.notice();
        context.stepHistory = new StepHistory();
        context.history.set(stepName, context.stepHistory);
        await step.run(context, stepData);
      }
    }
  }
}

module.exports = Monitor;
