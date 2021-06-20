'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const resolve = require('ncjsm/resolve');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const isObject = require('type/object/is');
const userConfig = require('@serverless/utils/config');
const isStandalone = require('../isStandaloneExecutable');
const { triggeredDeprecations } = require('../logDeprecation');
const isNpmGlobal = require('../npmPackage/isGlobal');
const resolveLocalServerlessPath = require('../../cli/resolve-local-serverless-path');
const resolveIsLocallyInstalled = require('../../utils/is-locally-installed');
const ci = require('ci-info');

const checkIsTabAutocompletionInstalled = async () => {
  try {
    return (await fs.readdir(path.resolve(os.homedir(), '.config/tabtab'))).some((filename) =>
      filename.startsWith('serverless.')
    );
  } catch {
    return false;
  }
};

const getServiceConfig = ({ configuration, options }) => {
  const providerName = isObject(configuration.provider)
    ? configuration.provider.name
    : configuration.provider;

  const isAwsProvider = providerName === 'aws';

  const defaultRuntime = isAwsProvider
    ? configuration.provider.runtime || 'nodejs12.x'
    : _.get(configuration, 'provider.runtime');

  const functions = (() => {
    if (isObject(configuration.functions)) return configuration.functions;
    if (!Array.isArray(configuration.functions)) return {};
    const result = {};
    for (const functionsBlock of configuration.functions) Object.assign(result, functionsBlock);
    return result;
  })();

  const resolveResourceTypes = (resources) => {
    if (!isPlainObject(resources)) return [];
    return [
      ...new Set(
        Object.values(resources)
          .map((resource) => {
            const type = _.get(resource, 'Type');
            if (typeof type !== 'string' || !type.includes('::')) return null;
            const domain = type.slice(0, type.indexOf(':'));
            return domain === 'AWS' ? type : domain;
          })
          .filter(Boolean)
      ),
    ];
  };

  const resources = (() => {
    if (!isAwsProvider) return undefined;
    return {
      general: resolveResourceTypes(_.get(configuration.resources, 'Resources')),
    };
  })();

  const plugins = configuration.plugins
    ? configuration.plugins.modules || configuration.plugins
    : [];

  const result = {
    provider: {
      name: providerName,
      runtime: defaultRuntime,
      stage: options.stage || _.get(configuration, 'provider.stage') || 'dev',
      region: isAwsProvider
        ? options.region || configuration.provider.region || 'us-east-1'
        : _.get(configuration, 'provider.region'),
    },
    plugins,
    functions: Object.values(functions)
      .map((functionConfig) => {
        if (!functionConfig) return null;
        const functionEvents = Array.isArray(functionConfig.events) ? functionConfig.events : [];
        const functionRuntime = (() => {
          if (functionConfig.image) return '$containerimage';
          return functionConfig.runtime || defaultRuntime;
        })();

        return {
          runtime: functionRuntime,
          events: functionEvents.map((eventConfig) => ({
            type: isObject(eventConfig) ? Object.keys(eventConfig)[0] || null : null,
          })),
        };
      })
      .filter(Boolean),
    resources,
  };

  // We want to recognize types of constructs from `serverless-lift` plugin if possible
  if (plugins.includes('serverless-lift') && _.isObject(configuration.constructs)) {
    result.constructs = Object.values(configuration.constructs)
      .map((construct) => {
        if (_.isObject(construct) && construct.type != null) {
          return { type: construct.type };
        }
        return null;
      })
      .filter(Boolean);
  }

  return result;
};

module.exports = async ({
  command,
  options,
  commandSchema,
  serviceDir,
  configuration,
  serverless,
}) => {
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

  const usedVersions = await (async () => {
    if (!isLocallyInstalled || (await resolveIsLocallyInstalled())) {
      return {
        'serverless': require('../../../package').version,
        '@serverless/dashboard-plugin': require('@serverless/dashboard-plugin/package').version,
      };
    }
    const localServerlessPath = await resolveLocalServerlessPath();
    return {
      'serverless': require(path.resolve(localServerlessPath, 'package.json')).version,
      // Since v2.42.0 it's "@serverless/dashboard-plugin"
      '@serverless/dashboard-plugin': await (async () => {
        try {
          return require((
            await resolve(localServerlessPath, '@serverless/dashboard-plugin/package')
          ).realPath).version;
        } catch {
          return undefined;
        }
      })(),
      '@serverless/enterprise-plugin': await (async () => {
        try {
          return require((
            await resolve(localServerlessPath, '@serverless/enterprise-plugin/package')
          ).realPath).version;
        } catch {
          return undefined;
        }
      })(),
    };
  })();

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
      if (serverless && serverless.isInvokedByGlobalInstallation) return 'local:fallback';
      return 'local:direct';
    })(),
    isAutoUpdateEnabled: Boolean(userConfig.get('autoUpdate.enabled')),
    isTabAutocompletionInstalled: await checkIsTabAutocompletionInstalled(),
    timestamp: Date.now(),
    timezone,
    triggeredDeprecations: Array.from(triggeredDeprecations),
    versions: usedVersions,
  };

  if (commandDurationMs != null) {
    payload.commandDurationMs = commandDurationMs;
  }

  if (configuration && commandSchema.serviceDependencyMode) {
    const npmDependencies = (() => {
      const pkgJson = (() => {
        try {
          return require(path.resolve(serviceDir, 'package.json'));
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
    payload.config = getServiceConfig({ configuration, options });
    payload.dashboard.orgUid = serverless && serverless.service.orgUid;
  }

  return payload;
};
