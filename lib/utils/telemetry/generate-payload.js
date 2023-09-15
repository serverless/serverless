'use strict';

const path = require('path');
const crypto = require('crypto');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const isObject = require('type/object/is');
const userConfig = require('@serverless/utils/config');
const getNotificationsMode = require('@serverless/utils/get-notifications-mode');
const log = require('@serverless/utils/log').log.get('telemetry');
const isStandalone = require('../is-standalone-executable');
const { getConfigurationValidationResult } = require('../../classes/config-schema-handler');
const { triggeredDeprecations } = require('../log-deprecation');
const isNpmGlobal = require('../npm-package/is-global');
const isLocallyInstalled = require('../../cli/is-locally-installed');
const ci = require('ci-info');
const AWS = require('../../aws/sdk-v2');

const configValidationModeValues = new Set(['off', 'warn', 'error']);
const commandsReportingProjectId = new Set(['deploy', '', 'remove']);

const getServiceConfig = ({ configuration, options, variableSources }) => {
  const providerName = isObject(configuration.provider)
    ? configuration.provider.name
    : configuration.provider;

  const isAwsProvider = providerName === 'aws';

  const defaultRuntime = isAwsProvider
    ? configuration.provider.runtime || 'nodejs14.x'
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

  const resolveUniqueParamsCount = (params) => {
    if (!isPlainObject(params)) return 0;
    return new Set(
      Object.values(params)
        .filter(isPlainObject)
        .map((stageParams) => Object.keys(stageParams))
        .reduce((acc, stageParamsKeys) => [...acc, ...stageParamsKeys], [])
    ).size;
  };

  const result = {
    // TODO: Update when upgrading the default for next major
    configValidationMode: configValidationModeValues.has(configuration.configValidationMode)
      ? configuration.configValidationMode
      : 'warn',
    provider: {
      name: providerName,
      runtime: defaultRuntime,
      stage: options.stage || _.get(configuration, 'provider.stage') || 'dev',
      region: isAwsProvider
        ? options.region || configuration.provider.region || 'us-east-1'
        : _.get(configuration, 'provider.region'),
    },
    variableSources: variableSources ? Array.from(variableSources) : [],
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
          url: Boolean(functionConfig.url),
          runtime: functionRuntime,
          events: functionEvents.map((eventConfig) => ({
            type: isObject(eventConfig) ? Object.keys(eventConfig)[0] || null : null,
          })),
        };
      })
      .filter(Boolean),
    resources,
    paramsCount: resolveUniqueParamsCount(configuration.params),
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

// This method is explicitly kept as synchronous. The reason for it being the fact that it needs to
// be executed in such manner due to its use in `process.on('SIGINT')` handler.
module.exports = ({
  command,
  options,
  commandSchema,
  serviceDir,
  configuration,
  serverless,
  commandUsage,
  variableSources,
  dockerVersion,
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

  const usedVersions = (() => {
    return {
      'serverless': require('../../../package').version,
      '@serverless/dashboard-plugin': require('@serverless/dashboard-plugin/package').version,
    };
  })();

  // We only consider options that are present in command schema
  const availableOptionNames = new Set(Object.keys(commandSchema.options));
  const commandOptionNames = Object.keys(options).filter((x) => availableOptionNames.has(x));

  const payload = {
    ciName,
    isTtyTerminal: process.stdin.isTTY && process.stdout.isTTY,
    isDockerInstalled: dockerVersion === undefined ? undefined : Boolean(dockerVersion),
    dockerVersion: dockerVersion || undefined,
    cliName: 'serverless',
    command,
    commandOptionNames,
    dashboard: {
      userId,
    },
    firstLocalInstallationTimestamp: userConfig.get('meta.created_at'),
    frameworkLocalUserId: userConfig.get('frameworkId'),
    installationType: (() => {
      if (isStandalone) {
        if (process.platform === 'win32') return 'global:standalone:windows';
        return 'global:standalone:other';
      }
      if (!isLocallyInstalled) {
        return isNpmGlobal() ? 'global:npm' : 'global:other';
      }
      if (EvalError.$serverlessInitInstallationVersion) return 'local:fallback';
      return 'local:direct';
    })(),
    isAutoUpdateEnabled: Boolean(userConfig.get('autoUpdate.enabled')),
    isUsingCompose: Boolean(process.env.SLS_COMPOSE),
    notificationsMode: getNotificationsMode(),
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

    const providerName = isObject(configuration.provider)
      ? configuration.provider.name
      : configuration.provider;
    const isAwsProvider = providerName === 'aws';

    payload.hasLocalCredentials = isAwsProvider && Boolean(new AWS.Config().credentials);
    payload.npmDependencies = npmDependencies;
    payload.config = getServiceConfig({ configuration, options, variableSources });
    payload.isConfigValid = getConfigurationValidationResult(configuration);
    payload.dashboard.orgUid =
      serverless && serverless.isDashboardEnabled ? serverless.service.orgUid : undefined;
    if (isAwsProvider && serverless && commandsReportingProjectId.has(command)) {
      const serviceName = isObject(configuration.service)
        ? configuration.service.name
        : configuration.service;
      const accountId = serverless && serverless.getProvider('aws').accountId;
      if (serviceName && accountId) {
        payload.projectId = crypto
          .createHash('sha256')
          .update(`${serviceName}-${accountId}`)
          .digest('base64');
      }
    }

    if (isAwsProvider && serverless && (command === 'deploy' || command === '')) {
      payload.didCreateService = Boolean(
        serverless && serverless.getProvider('aws').didCreateService
      );
    }
  }

  if (commandUsage) {
    payload.commandUsage = commandUsage;
  }

  log.debug('payload %o', payload);
  return payload;
};
