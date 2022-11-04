'use strict';

const path = require('path');
const memoizee = require('memoizee');
const inquirer = require('@serverless/utils/inquirer');
const { log, style } = require('@serverless/utils/log');
const resolveProviderCredentials = require('@serverless/dashboard-plugin/lib/resolve-provider-credentials');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/is-authenticated');
const hasLocalCredentials = require('../../aws/has-local-credentials');
const awsRequest = require('../../aws/request');

const fsp = require('fs').promises;

const yamlExtensions = new Set(['.yml', '.yaml']);

const appPattern = /^(?:#\s*)?app\s*:.+/m;
const orgPattern = /^(?:#\s*)?org\s*:.+/m;

const ServerlessError = require('../../serverless-error');
const resolveStage = require('../../utils/resolve-stage');
const resolveRegion = require('../../utils/resolve-region');

module.exports = {
  confirm: async (message, options = {}) => {
    const name = options.name || 'isConfirmed';
    return (
      await inquirer.prompt({
        message,
        type: 'confirm',
        name,
      })
    )[name];
  },
  doesServiceInstanceHaveLinkedProvider: async ({ configuration, options }) => {
    const region = resolveRegion({ configuration, options });
    const stage = resolveStage({ configuration, options });
    let result;
    try {
      result = await resolveProviderCredentials({ configuration, region, stage });
    } catch (err) {
      if (err.statusCode && err.statusCode >= 500) {
        throw new ServerlessError(
          'Serverless Dashboard is currently unavailable, please try again later',
          'DASHBOARD_UNAVAILABLE'
        );
      }
      throw err;
    }

    return Boolean(result);
  },
  awsRequest: async ({ serverless }, serviceConfig, method, params) => {
    const awsProvider = serverless && serverless.getProvider('aws');
    if (awsProvider) {
      // This method supports only direct service name input
      return awsProvider.request(
        serviceConfig.name || serviceConfig,
        method,
        params,
        serviceConfig.params
      );
    }
    return awsRequest(serviceConfig, method, params);
  },
  resolveInitialContext: ({ configuration, serviceDir }) => {
    return {
      isInServiceContext: Boolean(serviceDir),
      isLoggedIntoDashboard: isAuthenticated(),
      hasLocalAwsCredentials: hasLocalCredentials(),
      isDashboardEnabled: Boolean(configuration && configuration.org && configuration.app),
    };
  },
  writeOrgAndApp: async (
    orgName,
    appName,
    { configurationFilename, serviceDir, configuration }
  ) => {
    const configurationFilePath = path.resolve(serviceDir, configurationFilename);
    let ymlString = await (async () => {
      if (!yamlExtensions.has(path.extname(configurationFilename))) return null; // Non YAML config
      try {
        return await fsp.readFile(configurationFilePath);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    })();

    if (!ymlString) {
      log.notice(
        'Add the following settings to your serverless configuration file:\n\n' +
          `org: ${orgName}\napp: ${appName}`
      );
      return;
    }
    ymlString = ymlString.toString();

    const appMatch = ymlString.match(appPattern);
    if (appMatch) {
      ymlString = ymlString.replace(appMatch[0], `app: ${appName}`);
    } else {
      ymlString = `app: ${appName}\n${ymlString}`;
    }

    const orgMatch = ymlString.match(orgPattern);
    if (orgMatch) {
      ymlString = ymlString.replace(orgMatch[0], `org: ${orgName}`);
    } else {
      ymlString = `org: ${orgName}\n${ymlString}`;
    }
    await fsp.writeFile(configurationFilePath, ymlString);
    configuration.org = orgName;
    if (appName) configuration.app = appName;
  },
  showOnboardingWelcome: memoizee(
    (context) => {
      if (context.isConsole) {
        log.notice("Enabling Serverless Console's next-generation monitoring.");
        log.notice(style.aside('Learn more at https://serverless.com/console'));
      } else {
        log.notice(`Onboarding "${context.configuration.service}" to the Serverless Dashboard`);
        log.notice();
      }
    },
    { length: 0 }
  ),
};
