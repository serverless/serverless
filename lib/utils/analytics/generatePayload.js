'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const userConfig = require('@serverless/utils/config');
const isStandalone = require('../isStandaloneExecutable');
const { triggeredDeprecations } = require('../logDeprecation');
const isNpmGlobal = require('../npmPackage/isGlobal');
const ci = require('ci-info');

const versions = {
  'serverless': require('../../../package').version,
  '@serverless/enterprise-plugin': require('@serverless/enterprise-plugin/package').version,
};

const checkIsTabAutocompletionInstalled = async () => {
  try {
    return (await fs.readdir(path.resolve(os.homedir(), '.config/tabtab'))).some((filename) =>
      filename.startsWith('serverless.')
    );
  } catch {
    return false;
  }
};

module.exports = async (serverless) => {
  const { service: serviceConfig, config } = serverless;
  const { provider: providerConfig } = serviceConfig;
  const provider = serverless.getProvider(providerConfig.name);

  const isAwsProvider = providerConfig.name === 'aws';

  const defaultRuntime = isAwsProvider ? provider.getRuntime() : providerConfig.runtime;

  const npmDependencies = (() => {
    if (!config.servicePath) return [];
    const pkgJson = (() => {
      try {
        return require(path.resolve(config.servicePath, 'package.json'));
      } catch (error) {
        return null;
      }
    })();
    if (!pkgJson) return [];
    return Array.from(
      new Set([
        ...Object.keys(pkgJson.dependencies || {}),
        ...Object.keys(pkgJson.optionalDependencies || {}),
        ...Object.keys(pkgJson.devDependencies || {}),
      ])
    );
  })();

  let timezone;
  try {
    timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Pass silently
  }

  const ciName = (() => {
    if (ci.isCI) {
      if (ci.name) {
        return ci.name;
      }
      return 'unknown';
    }
    return null;
  })();

  const userId = (() => {
    // In this situation deployment relies on existence on company-wide access key
    // and `userId` from config does not matter
    if (process.env.SERVERLESS_ACCESS_KEY) {
      return null;
    }

    return userConfig.get('userId');
  })();

  return {
    ciName,
    cliName: 'serverless',
    config: {
      provider: {
        name: providerConfig.name,
        runtime: defaultRuntime,
        stage: isAwsProvider ? provider.getStage() : providerConfig.stage,
        region: isAwsProvider ? provider.getRegion() : providerConfig.region,
      },
      plugins: serviceConfig.plugins ? serviceConfig.plugins.modules || serviceConfig.plugins : [],
      functions: Object.values(serviceConfig.functions).map((functionConfig) => ({
        runtime: functionConfig.runtime || defaultRuntime,
        events: functionConfig.events.map((eventConfig) => ({
          type: Object.keys(eventConfig)[0] || null,
        })),
      })),
    },
    dashboard: {
      userId,
      orgUid: serviceConfig.orgUid,
    },
    frameworkLocalUserId: userConfig.get('frameworkId'),
    installationType: await (async () => {
      if (isStandalone) {
        if (process.platform === 'win32') return 'global:standalone:windows';
        return 'global:standalone:other';
      }
      if (!serverless.isLocallyInstalled) {
        return (await isNpmGlobal()) ? 'global:npm' : 'global:other';
      }
      if (serverless._isInvokedByGlobalInstallation) return 'local:fallback';
      return 'local:direct';
    })(),
    isAutoUpdateEnabled: Boolean(userConfig.get('autoUpdate.enabled')),
    isTabAutocompletionInstalled: await checkIsTabAutocompletionInstalled(),
    npmDependencies,
    timestamp: Date.now(),
    timezone,
    triggeredDeprecations: Array.from(triggeredDeprecations),
    versions,
  };
};
