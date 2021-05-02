'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const userConfig = require('@serverless/utils/config');
const isStandalone = require('../isStandaloneExecutable');
const { triggeredDeprecations } = require('../logDeprecation');
const isNpmGlobal = require('../npmPackage/isGlobal');
const noServiceCommands = require('../../cli/commands-schema/no-service');
const resolveInput = require('../../cli/resolve-input');
const resolveIsLocallyInstalled = require('../../utils/is-locally-installed');
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
  if (!serverless || !serverless.serviceDir) {
    return false;
  }

  const { command } = resolveInput();
  const noServiceCommand = noServiceCommands.get(command);
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

module.exports = async (serverless = null) => {
  let commandDurationMs;

  if (EvalError.$serverlessCommandStartTime) {
    const diff = process.hrtime(EvalError.$serverlessCommandStartTime);
    // First element is in seconds and second in nanoseconds
    commandDurationMs = Math.floor(diff[0] * 1000 + diff[1] / 1000000);
  }

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

  const isLocallyInstalled = await (async () => {
    if (serverless) {
      return serverless.isLocallyInstalled;
    }

    return resolveIsLocallyInstalled();
  })();

  const { command, options, commandSchema } = resolveInput();

  // We only consider options that are present in command schema
  const availableOptionNames = new Set(Object.keys(commandSchema.options));
  const commandOptionNames = Object.keys(options).filter((x) => availableOptionNames.has(x));

  const payload = {
    ciName,
    cliName: 'serverless',
    command,
    commandOptionNames,
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
      if (!isLocallyInstalled) {
        return (await isNpmGlobal()) ? 'global:npm' : 'global:other';
      }
      if (serverless && serverless._isInvokedByGlobalInstallation) return 'local:fallback';
      return 'local:direct';
    })(),
    isAutoUpdateEnabled: Boolean(userConfig.get('autoUpdate.enabled')),
    isTabAutocompletionInstalled: await checkIsTabAutocompletionInstalled(),
    timestamp: Date.now(),
    timezone,
    triggeredDeprecations: Array.from(triggeredDeprecations),
    versions,
  };

  if (commandDurationMs != null) {
    payload.commandDurationMs = commandDurationMs;
  }

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
