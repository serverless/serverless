'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const { log } = require('@serverless/utils/log');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const apiRequest = require('@serverless/utils/api-request');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { writeOrgAndConsole, showOnboardingWelcome } = require('./utils');

const orgUpdateConfirm = async (stepHistory) => {
  log.notice(
    'Service has monitoring enabled, but it is configured with the "org" to which you do not have access'
  );
  log.notice();
  const shouldUpdateOrg = await promptWithHistory({
    message: 'Would you like to update it?',
    type: 'confirm',
    name: 'shouldUpdateOrg',
    stepHistory,
  });
  return shouldUpdateOrg;
};

const orgsChoice = async (orgNames, stepHistory) => {
  const orgName = await promptWithHistory({
    message: 'What org do you want to add this service to?',
    type: 'list',
    name: 'orgName',
    choices: [...orgNames, { name: '[Skip]', value: '_skip_' }],
    stepHistory,
  });
  return orgName;
};

const resolveOrgNames = async () => {
  const { userId } = await apiRequest('/api/identity/me');
  return new Set(
    (await apiRequest(`/api/identity/users/${userId}/orgs`)).orgs.map(({ orgName }) => orgName)
  );
};
const setOrgAndConsole = async (context, stepData) => {
  const { history, stepHistory } = context;
  const { orgNames, isFullyPreconfigured, isMonitoringOverridenByCli } = stepData;
  let { orgName } = stepData;
  if (!orgName) {
    orgName = await (async () => {
      // We only want to automatically select the single available org in situations where user explicitly
      // logged in/registered during the process and created new service, for existing services we want to always ask
      // that question. It will also be always asked if `SERVERLESS_ACCESS_KEY` was provided
      if (orgNames.size === 1 && history && history.has('consoleLogin') && history.has('service')) {
        return orgNames.values().next().value;
      }
      return orgsChoice(orgNames, stepHistory);
    })();
  }

  if (orgName === '_skip_') {
    return;
  }

  if (isMonitoringOverridenByCli && isFullyPreconfigured) {
    const shouldOverrideConsoleConfig = await promptWithHistory({
      message:
        'Are you sure you want to update monitoring settings ' +
        `to ${chalk.bold(`org: ${orgName}, console: true`)}`,
      type: 'confirm',
      name: 'shouldOverrideConsoleConfig',
      stepHistory,
    });
    if (!shouldOverrideConsoleConfig) {
      delete context.configuration.org;
      if (context.configuration.console) delete context.configuration.console.org;
      delete context.configuration.console;
      return;
    }
  }
  log.notice();

  log.notice.success(
    `Your project is ready to be deployed to Serverless Console (org: "${orgName}")`
  );

  await writeOrgAndConsole(orgName, context);
  return;
};

module.exports = {
  async isApplicable(context) {
    const { configuration, options, serviceDir, isConsole } = context;

    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if (!isConsole) {
      context.inapplicabilityReasonCode = 'NON_CONSOLE_CONTEXT';
      return false;
    }

    if (!(await resolveAuthMode())) {
      context.inapplicabilityReasonCode = 'NOT_LOGGED_IN';
      return false;
    }

    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      context.inapplicabilityReasonCode = 'NON_AWS_PROVIDER';
      return false;
    }

    const runtime = _.get(configuration.provider, 'runtime') || 'nodejs14.x';
    if (!runtime.startsWith('nodejs')) {
      context.inapplicabilityReasonCode = 'UNSUPPORTED_RUNTIME';
      return false;
    }

    const orgNames = await resolveOrgNames();
    if (!orgNames.size) {
      context.inapplicabilityReasonCode = 'NO_ORGS_AVAILABLE';
      return false;
    }

    const isConsolePreconfigured = Boolean(configuration.console);
    const configurationOrg = _.get(configuration.console, 'org') || configuration.org;
    const isMonitoringPreconfigured = Boolean(configurationOrg);

    const isFullyPreconfigured = isConsolePreconfigured && isMonitoringPreconfigured;
    const orgName = options.org || configurationOrg;

    const isMonitoringOverridenByCli =
      isMonitoringPreconfigured &&
      ((options.org && options.org !== configurationOrg) ||
        (options.console && !configuration.console));
    if (orgName) {
      if (orgNames.has(orgName)) {
        if (options.org) {
          if (isMonitoringPreconfigured && !isMonitoringOverridenByCli) {
            context.inapplicabilityReasonCode = 'MONITORING_NOT_OVERRIDEN_BY_CLI';
            return false;
          }
        } else if (!isMonitoringOverridenByCli) {
          context.inapplicabilityReasonCode = 'HAS_MONITORING_SETUP';
          return false;
        }
        return {
          orgName,
          isFullyPreconfigured,
          isMonitoringPreconfigured,
          isMonitoringOverridenByCli,
        };
      }
      if (options.org) {
        log.error();
        log.error(
          'Passed value for "--org" doesn\'t seem to correspond to account with which you\'re logged in with.'
        );
      } else {
        log.error();
        log.error(`Configured org "${orgName}" is not available in your account.`);
      }
    }
    return {
      orgNames,
      isFullyPreconfigured,
      isMonitoringPreconfigured,
      isMonitoringOverridenByCli,
      isConsolePreconfigured,
    };
  },
  async run(context, stepData) {
    const { configuration, options, stepHistory } = context;
    if (context.initial.isInServiceContext && !context.initial.isConsoleEnabled) {
      showOnboardingWelcome(context);
    }

    if (!stepData.orgName) {
      delete configuration.org;
      if (configuration.console) delete configuration.console.org;
    }
    if (!options.org) {
      if (stepData.isMonitoringPreconfigured) {
        if (!stepData.orgName) {
          if (!(await orgUpdateConfirm(stepHistory))) return;
        }
      }
    }
    await setOrgAndConsole(context, stepData);
  },
  configuredQuestions: [
    'orgName',
    'appName',
    'newAppName',
    'shouldUpdateOrg',
    'appUpdateType',
    'shouldOverrideConsoleConfig',
  ],
};
