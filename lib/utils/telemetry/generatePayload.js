'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const userConfig = require('@serverless/utils/config');
const isStandalone = require('../isStandaloneExecutable');
const { triggeredDeprecations } = require('../logDeprecation');
const isNpmGlobal = require('../npmPackage/isGlobal');
const noServiceCommands = require('../../cli/commands-schema/no-service');
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

const shouldIncludeServiceSpecificConfig = (serverless) => {
  if (!serverless.serviceDir) {
    return false;
  }

  const noServiceCommand = noServiceCommands.get(serverless.processedInput.commands.join(' '));
  if (noServiceCommand && !noServiceCommand.serviceDependencyMode) {
    return false;
  }

  return true;
};

const getServiceConfig = (serverless) => {
  const { service: serviceConfig } = serverless;
  const { provider: providerConfig } = serviceConfig;
  const provider = serverless.getProvider(providerConfig.name);

  const isAwsProvider = providerConfig.name === 'aws';

  const defaultRuntime = isAwsProvider ? provider.getRuntime() : providerConfig.runtime;

  return {
    provider: {
      name: providerConfig.name,
      runtime: defaultRuntime,
      stage: isAwsProvider ? provider.getStage() : providerConfig.stage,
      region: isAwsProvider ? provider.getRegion() : providerConfig.region,
    },
    plugins: serviceConfig.plugins ? serviceConfig.plugins.modules || serviceConfig.plugins : [],
    functions: Object.values(serviceConfig.functions).map((functionConfig) => {
      const functionEvents = functionConfig.events || [];
      const functionRuntime = (() => {
        if (functionConfig.image) return '$containerimage';
        return functionConfig.runtime || defaultRuntime;
      })();

      return {
        runtime: functionRuntime,
        events: functionEvents.map((eventConfig) => ({
          type: Object.keys(eventConfig)[0] || null,
        })),
      };
    }),
  };
};

module.exports = async (serverless) => {
  let timezone;
  try {
    timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Pass silently
  }

  const ciName = (() => {
    if (process.env.SERVERLESS_CI_CD) {
      return 'Serverless CI/CD';
    }

    if (process.env.SEED_APP_NAME) {
      return 'Seed';
    }

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

  const payload = {
    ciName,
    cliName: 'serverless',
    command: serverless.processedInput.commands.join(' '),
    dashboard: {
      userId,
    },
    firstLocalInstallationTimestamp: userConfig.get('meta.created_at'),
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
    timestamp: Date.now(),
    timezone,
    triggeredDeprecations: Array.from(triggeredDeprecations),
    versions,
  };

  if (shouldIncludeServiceSpecificConfig(serverless)) {
    const npmDependencies = (() => {
      const pkgJson = (() => {
        try {
          return require(path.resolve(serverless.serviceDir, 'package.json'));
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

    payload.npmDependencies = npmDependencies;
    payload.config = getServiceConfig(serverless);
    payload.dashboard.orgUid = serverless.service.orgUid;
  }

  return payload;
};
