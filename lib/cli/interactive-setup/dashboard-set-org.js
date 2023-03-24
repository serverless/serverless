'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const { log } = require('@serverless/utils/log');
const accountUtils = require('@serverless/utils/account');
const configUtils = require('@serverless/utils/config');
const { ServerlessSDK } = require('@serverless/platform-client');
const promptWithHistory = require('@serverless/utils/inquirer/prompt-with-history');
const { writeOrgAndApp, showOnboardingWelcome } = require('./utils');
const {
  getPlatformClientWithAccessKey,
  getOrCreateAccessKeyForOrg,
} = require('@serverless/dashboard-plugin/lib/client-utils');

const isValidAppName = RegExp.prototype.test.bind(/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/);

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

const appUpdateConfirm = async (appName, orgName, stepHistory) => {
  log.notice('The "app" used in this Service does not yet exist in your Organization.');
  log.notice();

  const appUpdateType = await promptWithHistory({
    message: 'What would you like to do?',
    type: 'list',
    name: 'appUpdateType',
    stepHistory,
    choices: [
      { name: `Create '${appName}' app in '${orgName}' org`, value: '_create_' },
      {
        name: 'Switch to one of the existing apps (or create new one with different name)',
        value: '_choose_existing_',
      },
      { name: "Skip, I'll sort this out manually", value: '_skip_' },
    ],
  });
  return appUpdateType;
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

const appNameChoice = async (appNames, stepHistory) => {
  const appName = await promptWithHistory({
    message: 'What application do you want to add this to?',
    type: 'list',
    name: 'appName',
    choices: Array.from(appNames).concat({ name: '[create a new app]', value: '_create_' }),
    stepHistory,
  });
  return appName;
};

const appNameInput = async (appNames, stepHistory) => {
  const appName = await promptWithHistory({
    message: 'What do you want to name this application?',
    type: 'input',
    name: 'newAppName',
    stepHistory,
    validate: (input) => {
      input = input.trim();
      if (!isValidAppName(input)) {
        return (
          'App name is not valid.\n' +
          '   - It should only contain lowercase alphanumeric and hyphens.\n' +
          '   - It should start and end with an alphanumeric character.\n' +
          "   - Shouldn't exceed 128 characters"
        );
      }
      if (appNames.includes(input)) return 'App of this name already exists';
      return true;
    },
  });
  return appName;
};

const steps = {
  resolveOrgNames: async (user) => {
    if (process.env.SERVERLESS_ACCESS_KEY) {
      const sdk = new ServerlessSDK({ accessKey: process.env.SERVERLESS_ACCESS_KEY });
      const { orgName } = await sdk.accessKeys.get();
      return new Set([orgName]);
    }

    let orgs = new Set();
    if (!user.idToken) {
      // User registered over CLI hence idToken is not stored.
      // Still to resolve organizations from platform idToken is needed.
      // Handling it gently by assuming that orgs listed in config file
      // make a valid representation
      for (const org of Object.keys(user.accessKeys)) orgs.add(org);
    } else {
      const sdk = new ServerlessSDK();
      await accountUtils.refreshToken(sdk);
      user = configUtils.getLoggedInUser();
      sdk.config({ accessKey: user.idToken });
      orgs = new Set(
        (await sdk.organizations.list({ username: user.username })).map((org) => org.tenantName)
      );
    }
    return orgs;
  },
  setOrgAndApp: async (context, stepData) => {
    const { history, stepHistory } = context;
    const { orgNames, isFullyPreconfigured, isMonitoringOverridenByCli } = stepData;
    let { orgName, apps, newAppName, appName } = stepData;
    if (!orgName) {
      orgName = await (async () => {
        // We only want to automatically select the single available org in situations where user explicitly
        // logged in/registered during the process and created new service, for existing services we want to always ask
        // that question. It will also be always asked if `SERVERLESS_ACCESS_KEY` was provided
        if (
          orgNames.size === 1 &&
          history &&
          history.has('dashboardLogin') &&
          history.has('service')
        ) {
          return orgNames.values().next().value;
        }
        return orgsChoice(orgNames, stepHistory);
      })();
    }

    if (orgName === '_skip_') {
      return;
    }

    const sdk = await getPlatformClientWithAccessKey(orgName);
    if (!newAppName && !appName) {
      if (!apps) apps = await sdk.apps.list({ orgName });

      const appNames = apps.map((app) => app.appName);

      if (!apps.length) {
        newAppName = context.configuration.service;
      } else {
        appName = await appNameChoice(appNames, stepHistory);
        if (appName === '_create_') {
          newAppName = await appNameInput(appNames, stepHistory);
        }
      }
    }
    if (newAppName) {
      ({ appName } = await sdk.apps.create({ orgName, app: { name: newAppName } }));
    }

    if (isMonitoringOverridenByCli && isFullyPreconfigured) {
      const shouldOverrideDashboardConfig = await promptWithHistory({
        message:
          'Are you sure you want to update monitoring settings ' +
          `to ${chalk.bold(`org: ${orgName}, app: ${appName}`)}`,
        type: 'confirm',
        name: 'shouldOverrideDashboardConfig',
        stepHistory,
      });
      if (!shouldOverrideDashboardConfig) {
        delete context.configuration.app;
        delete context.configuration.org;
        return;
      }
    }
    log.notice();

    log.notice.success(
      `Your project is ready to be deployed to Serverless Dashboard (org: "${orgName}", app: "${appName}")`
    );

    await writeOrgAndApp(orgName, appName, context);
    return;
  },
};

module.exports = {
  async isApplicable(context) {
    const { configuration, options, serviceDir } = context;

    if (!serviceDir) {
      context.inapplicabilityReasonCode = 'NOT_IN_SERVICE_DIRECTORY';
      return false;
    }

    if (options.console) {
      context.inapplicabilityReasonCode = 'CONSOLE_CONTEXT';
      return false;
    }

    if (
      _.get(configuration, 'provider') !== 'aws' &&
      _.get(configuration, 'provider.name') !== 'aws'
    ) {
      context.inapplicabilityReasonCode = 'NON_AWS_PROVIDER';
      return false;
    }
    const sdk = new ServerlessSDK();
    const { supportedRegions, supportedRuntimes } = await sdk.metadata.get();

    // We want to still allow onboarding from Dashboard (idenfitied by explicit `--org` passed)
    if (
      !options.org &&
      !supportedRuntimes.includes(_.get(configuration.provider, 'runtime') || 'nodejs12.x')
    ) {
      context.inapplicabilityReasonCode = 'UNSUPPORTED_RUNTIME';
      return false;
    }

    if (
      !supportedRegions.includes(options.region || configuration.provider.region || 'us-east-1')
    ) {
      context.inapplicabilityReasonCode = 'UNSUPPORTED_REGION';
      return false;
    }
    const usesServerlessAccessKey = Boolean(process.env.SERVERLESS_ACCESS_KEY);

    let user = configUtils.getLoggedInUser();
    if (!user && !usesServerlessAccessKey) {
      context.inapplicabilityReasonCode = 'NOT_LOGGED_IN';
      return false;
    }

    const orgNames = await steps.resolveOrgNames(user);
    if (!orgNames.size) {
      context.inapplicabilityReasonCode = 'NO_ORGS_AVAILABLE';
      return false;
    }
    if (!usesServerlessAccessKey) {
      user = configUtils.getLoggedInUser(); // Refreshed, as new token might have been generated
    }

    const isMonitoringPreconfigured = Boolean(configuration.org);

    const orgName = options.org || configuration.org;
    const appName = options.app || configuration.app;

    const isDashboardAppPreconfigured = Boolean(configuration.app);
    const isMonitoringOverridenByCli =
      isMonitoringPreconfigured &&
      ((options.org && options.org !== configuration.org) ||
        (options.app && options.app !== configuration.app));

    const isFullyPreconfigured = isMonitoringPreconfigured && isDashboardAppPreconfigured;
    if (orgName && orgNames.has(orgName)) {
      if (!isValidAppName(appName)) {
        return {
          user,
          orgName,
          isFullyPreconfigured,
          isMonitoringPreconfigured,
          isDashboardAppPreconfigured,
          isMonitoringOverridenByCli,
        };
      }

      const accessKey = await getOrCreateAccessKeyForOrg(orgName);
      sdk.config({ accessKey });
      const apps = await sdk.apps.list({ orgName });

      if (options.org || options.app) {
        if (apps.some((app) => app.appName === appName)) {
          if (
            isMonitoringPreconfigured &&
            isDashboardAppPreconfigured &&
            !isMonitoringOverridenByCli
          ) {
            context.inapplicabilityReasonCode = 'MONITORING_NOT_OVERRIDEN_BY_CLI';
            return false;
          }
          return {
            user,
            orgName,
            appName,
            isFullyPreconfigured,
            isMonitoringPreconfigured,
            isDashboardAppPreconfigured,
            isMonitoringOverridenByCli,
          };
        }
        if (options.app) {
          log.error();
          log.error('Passed value for "--app" doesn\'t seem to correspond to chosen organization.');
        }
        return {
          user,
          orgName,
          isFullyPreconfigured,
          isMonitoringPreconfigured,
          isDashboardAppPreconfigured,
          isMonitoringOverridenByCli,
        };
      } else if (apps.some((app) => app.appName === appName)) {
        if (!isMonitoringOverridenByCli) {
          context.inapplicabilityReasonCode = 'HAS_MONITORING_SETUP';
          return false;
        }
        return {
          user,
          orgName,
          appName,
          isFullyPreconfigured,
          isMonitoringPreconfigured,
          isDashboardAppPreconfigured,
          isMonitoringOverridenByCli,
        };
      }
      return {
        user,
        orgName,
        apps,
        newAppName: appName,
        isFullyPreconfigured,
        isMonitoringPreconfigured,
        isDashboardAppPreconfigured,
        isMonitoringOverridenByCli,
      };
    } else if (orgName) {
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
      user,
      orgNames,
      isFullyPreconfigured,
      isMonitoringPreconfigured,
      isDashboardAppPreconfigured,
      isMonitoringOverridenByCli,
    };
  },
  async run(context, stepData) {
    const { configuration, options, stepHistory } = context;
    if (context.initial.isInServiceContext && !context.initial.isDashboardEnabled) {
      showOnboardingWelcome(context);
    }

    if (!stepData.orgName) delete configuration.org;
    if (!stepData.appName && !stepData.newAppName) delete configuration.app;
    if (!options.org && !options.app) {
      if (stepData.isMonitoringPreconfigured) {
        if (!stepData.orgName) {
          if (!(await orgUpdateConfirm(stepHistory))) return;
        } else if (stepData.newAppName && stepData.isMonitoringPreconfigured) {
          const appUpdateTypeChoice = await appUpdateConfirm(
            stepData.newAppName,
            stepData.orgName,
            stepHistory
          );
          switch (appUpdateTypeChoice) {
            case '_create_':
              break;
            case '_choose_existing_':
              delete stepData.newAppName;
              break;
            case '_skip_':
              return;
            default:
              throw new Error('Unexpected app update type');
          }
        }
      }
    }
    await steps.setOrgAndApp(context, stepData);
  },
  steps,
  configuredQuestions: [
    'orgName',
    'appName',
    'newAppName',
    'shouldUpdateOrg',
    'appUpdateType',
    'shouldOverrideDashboardConfig',
  ],
};
