'use strict';

const path = require('path');
const inquirer = require('@serverless/utils/inquirer');
const resolveProviderCredentials = require('@serverless/dashboard-plugin/lib/resolveProviderCredentials');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/isAuthenticated');
const hasLocalCredentials = require('../../aws/has-local-credentials');

const fsp = require('fs').promises;

const yamlExtensions = new Set(['.yml', '.yaml']);

const appPattern = /^(?:#\s*)?app\s*:.+/m;
const orgPattern = /^(?:#\s*)?(?:tenant|org)\s*:.+/m;

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
          'Dashboard service is currently unavailable, please try again later',
          'DASHBOARD_UNAVAILABLE'
        );
      }
      throw err;
    }

    return Boolean(result);
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
      process.stdout.write(
        'Add the following settings to your serverless configuration file:\n\n' +
          `org: ${orgName}\napp: ${appName}\n`
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
    configuration.app = appName;
  },
};
