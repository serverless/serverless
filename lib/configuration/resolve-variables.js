'use strict';

// Import required modules
const path = require('path');
const _ = require('lodash');
const ServerlessError = require('../serverless-error');
const resolveVariables = require('./variables/resolve');
const resolveVariablesMeta = require('./variables/resolve-meta');
const isPropertyResolved = require('./variables/is-property-resolved');
const eventuallyReportVariableResolutionErrors = require('./variables/eventually-report-resolution-errors');
const filterSupportedOptions = require('../cli/filter-supported-options');
const humanizePropertyPathKeys = require('./variables/humanize-property-path-keys');
const serverlessVariablesSourceEnv = require('./variables/sources/env');
const serverlessVariablesSourceFile = require('./variables/sources/file');
const serverlessVariablesSourceOpt = require('./variables/sources/opt');
const serverlessVariablesSourceSelf = require('./variables/sources/self');
const serverlessVariablesSourceStrToBool = require('./variables/sources/str-to-bool');
const serverlessVariablesSourceSls = require('./variables/sources/sls');
const serverlessVariablesSourceParams = require('./variables/sources/param');
const serverlessVariablesSourceAwsCf = require('./variables/sources/aws-cf');
const serverlessVariablesSourceAwsS3 = require('./variables/sources/aws-s3');
const serverlessVariablesSourceAwsSsm = require('./variables/sources/aws-ssm');
const serverlessVariablesSourceAws = require('./variables/sources/aws');
const resolveExternalPluginSources = require('./variables/sources/resolve-external-plugin-sources');

/**
 * Resolve Serverless Variables: Phase One
 *
 * Resolve Serverless Variables "provider.stage" and "useDotenv"
 * These need to be resolved before any other variables, since a lot of
 * logic is dependent on them.
 */
const resolveServerlessVariablesPhaseOne = async ({ service, servicePath, options }) => {
  const sourcesToResolveFrom = ['file', 'self', 'strToBool', 'opt', 'env'];
  const propertyPathsToResolve = ['provider\0stage', 'useDotenv'];

  // Creates a Map for each variable found in the configuration.
  const variablesMeta = resolveVariablesMeta(service);

  // Configure resolver
  const resolverConfiguration = {
    serviceDir: servicePath,
    configuration: service,
    variablesMeta,
    sources: {
      file: serverlessVariablesSourceFile,
      self: serverlessVariablesSourceSelf,
      strToBool: serverlessVariablesSourceStrToBool,
      opt: serverlessVariablesSourceOpt,
      env: serverlessVariablesSourceEnv,
    },
    options,
    fulfilledSources: new Set(sourcesToResolveFrom),
    propertyPathsToResolve: new Set(propertyPathsToResolve),
    variableSourcesInConfig: new Set(),
  };

  await resolveVariables(resolverConfiguration);

  const resolvedService = resolverConfiguration.configuration;

  // Throw any resolution errors
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );
  if (resolutionErrors.size) {
    throw new ServerlessError(
      `Cannot resolve ${path.basename(servicePath)}: Variables resolution errored with:${Array.from(
        resolutionErrors,
        (error) => `\n  - ${error.message}`
      )}`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  /**
   * Massage useDotenv to be a boolean
   */
  if (resolvedService.useDotenv === 'true') {
    resolvedService.useDotenv = true;
  }
  if (resolvedService.useDotenv === 'false') {
    resolvedService.useDotenv = false;
  }

  /**
   * If "provider.stage" or "useDotenv" variables were not resolved and
   * include "${env:", report them and explain what might have happened.
   */
  if (
    !isPropertyResolved(variablesMeta, 'provider\0stage') &&
    resolvedService.provider.stage.includes('${env:')
  ) {
    throw new ServerlessError(
      'Could not resolve "provider.stage" variable. Environment variable is missing. Please note that if the environment variable is specified in a .env file, it is not loaded until after the "provider.stage" variable is resolved. The reason is .env file loading looks for .env.${stage} as well as .env but when "provider.stage" is not resolved, the stage is unknown.',
      'VARIABLES_RESOLUTION_ERROR'
    );
  }
  if (
    !isPropertyResolved(variablesMeta, 'useDotenv') &&
    resolvedService.useDotenv.includes('${env:')
  ) {
    throw new ServerlessError(
      'Could not resolve "useDotenv" variable. Environment variable is missing. Please note that if the environment variable is specified in a .env file, it is not loaded until after the "useDotenv" variable is resolved. The reason is .env file loading looks for .env.${stage} as well as .env but when "useDotenv" is not resolved, the stage is unknown.',
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  /**
   * Throw error if key properteis are not resolved with
   * helpful comments on the rationale.
   */
  if (!isPropertyResolved(variablesMeta, 'provider\0stage')) {
    throw new ServerlessError(
      `Cannot resolve "provider.stage" variable. Please note, only Variable sources ${sourcesToResolveFrom.join(
        ', '
      )} are supported for this property. AWS sources (e.g. SSM) or Serverless Framework Dashboard sources (e.g. params) are not supported for this property.`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }
  if (!isPropertyResolved(variablesMeta, 'useDotenv')) {
    throw new ServerlessError(
      `Cannot resolve "useDotenv" variable. Please note, only Variable sources ${sourcesToResolveFrom.join(
        ', '
      )} are supported for this property. AWS sources (e.g. SSM) or Serverless Framework Dashboard sources (e.g. params) are not supported for this property.`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  return resolvedService;
};

/**
 * Resolve Serverless Variables: Phase Two
 *
 * Resolve everything, but still using limited sources.
 * We need to get "params" from the Platform for Dashboard
 * users, but need to ensure that some properties are resolved
 * (e.g. "org", "app", "service", "region", etc.)
 */
const resolveServerlessVariablesPhaseTwo = async ({ service, servicePath, options }) => {
  const sourcesToResolveFrom = ['file', 'self', 'strToBool', 'opt', 'env'];

  // Creates a Map for each variable found in the configuration.
  const variablesMeta = resolveVariablesMeta(service);

  // Configure resolver
  const resolverConfiguration = {
    serviceDir: servicePath,
    configuration: service,
    variablesMeta,
    sources: {
      file: serverlessVariablesSourceFile,
      self: serverlessVariablesSourceSelf,
      strToBool: serverlessVariablesSourceStrToBool,
      opt: serverlessVariablesSourceOpt,
      env: serverlessVariablesSourceEnv,
    },
    options,
    fulfilledSources: new Set(sourcesToResolveFrom),
    variableSourcesInConfig: new Set(),
    // propertyPathsToResolve: new Set([]), // Omit to resolve everything
  };

  await resolveVariables(resolverConfiguration);

  const resolvedService = resolverConfiguration.configuration;

  // Throw any resolution errors
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );
  if (resolutionErrors.size) {
    throw new ServerlessError(
      `Cannot resolve ${path.basename(servicePath)}: Variables resolution errored with:${Array.from(
        resolutionErrors,
        (error) => `\n  - ${error.message}`
      )}`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  /**
   * Throw errors for common mistakes to help users.
   */
  const errorHandler = (property) => {
    throw new ServerlessError(
      `Cannot resolve "${property}" variable. Please note, only Variable sources ${sourcesToResolveFrom.join(
        ', '
      )} are supported for this property. AWS sources (e.g. SSM) or Serverless Framework Dashboard sources (e.g. params) are not supported for this property.`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  };
  if (!isPropertyResolved(variablesMeta, 'package\0path')) {
    return errorHandler('package\0path');
  }
  if (!isPropertyResolved(variablesMeta, 'frameworkVersion')) {
    return errorHandler('frameworkVersion');
  }
  if (!isPropertyResolved(variablesMeta, 'org')) {
    return errorHandler('org');
  }
  if (!isPropertyResolved(variablesMeta, 'app')) {
    return errorHandler('app');
  }
  if (!isPropertyResolved(variablesMeta, 'service')) {
    return errorHandler('service');
  }
  if (!isPropertyResolved(variablesMeta, 'provider\0region')) {
    return errorHandler('provider\0region');
  }
  if (!isPropertyResolved(variablesMeta, 'dashboard')) {
    return errorHandler('dashboard');
  }

  return resolvedService;
};

/**
 * Resolve Serverless Variables: Phase Three
 *
 * Resolve everything except for Plugin sources
 */
const resolveServerlessVariablesPhaseThree = async ({
  service,
  servicePath,
  options,
  serverlessFrameworkInstance,
  serviceInstanceParamsFromPlatform,
  serviceOutputReferencesFromPlatform = {},
}) => {
  let sourcesToResolveFrom = ['file', 'self', 'strToBool', 'opt', 'env', 'sls', 'param'];

  // Creates a Map for each variable found in the configuration.
  const variablesMeta = resolveVariablesMeta(service);

  /**
   * First resolve, without AWS sources
   */
  let resolverConfiguration = {
    serviceDir: servicePath,
    configuration: service,
    variablesMeta,
    sources: {
      file: serverlessVariablesSourceFile,
      self: serverlessVariablesSourceSelf,
      strToBool: serverlessVariablesSourceStrToBool,
      opt: serverlessVariablesSourceOpt,
      env: serverlessVariablesSourceEnv,
      sls: serverlessVariablesSourceSls(serverlessFrameworkInstance),
      param: serverlessVariablesSourceParams({
        service,
        serviceInstanceParamsFromPlatform,
      }),
    },
    options,
    fulfilledSources: new Set(sourcesToResolveFrom),
    variableSourcesInConfig: new Set(),
    // propertyPathsToResolve: new Set([]), // Omit to resolve everything
  };
  await resolveVariables(resolverConfiguration);
  let resolvedService = resolverConfiguration.configuration;

  // Throw any resolution errors
  let resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );
  if (resolutionErrors.size) {
    throw new ServerlessError(
      `Cannot resolve ${path.basename(servicePath)}: Variables resolution errored with:${Array.from(
        resolutionErrors,
        (error) => `\n  - ${error.message}`
      )}`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  /**
   * Second resolve, with AWS sources
   */
  sourcesToResolveFrom = [
    'file',
    'self',
    'strToBool',
    'opt',
    'env',
    'sls',
    'param',
    'cf',
    's3',
    'ssm',
    'aws',
  ];

  resolverConfiguration = {
    serviceDir: servicePath,
    configuration: service,
    variablesMeta,
    sources: {
      file: serverlessVariablesSourceFile,
      self: serverlessVariablesSourceSelf,
      strToBool: serverlessVariablesSourceStrToBool,
      opt: serverlessVariablesSourceOpt,
      env: serverlessVariablesSourceEnv,
      sls: serverlessVariablesSourceSls(serverlessFrameworkInstance),
      param: serverlessVariablesSourceParams({
        service,
        serviceInstanceParamsFromPlatform,
      }),
      cf: serverlessVariablesSourceAwsCf(serverlessFrameworkInstance),
      s3: serverlessVariablesSourceAwsS3(serverlessFrameworkInstance),
      ssm: serverlessVariablesSourceAwsSsm(serverlessFrameworkInstance),
      aws: serverlessVariablesSourceAws(serverlessFrameworkInstance),
    },
    options,
    fulfilledSources: new Set(sourcesToResolveFrom),
    variableSourcesInConfig: new Set(),
    // propertyPathsToResolve: new Set([]), // Omit to resolve everything
  };
  await resolveVariables(resolverConfiguration);
  resolvedService = resolverConfiguration.configuration;

  // Throw any resolution errors
  resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );
  if (resolutionErrors.size) {
    throw new ServerlessError(
      `Cannot resolve ${path.basename(servicePath)}: Variables resolution errored with:${Array.from(
        resolutionErrors,
        (error) => `\n  - ${error.message}`
      )}`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  return resolvedService;
};

/**
 * Resolve Serverless Variables: Phase Four
 *
 * Plugins have been loaded at this point, so we can resolve
 * any variables from sources they might have added.
 */
const resolveServerlessVariablesPhaseFour = async ({
  service,
  servicePath,
  options,
  serverlessFrameworkInstance,
  serviceInstanceParamsFromPlatform,
  serviceOutputReferencesFromPlatform = {},
}) => {
  // Creates a Map for each variable found in the configuration.
  const variablesMeta = resolveVariablesMeta(service);

  // Create a full list of sources to resolve from
  const sourcesToResolveFrom = [
    'file',
    'self',
    'strToBool',
    'opt',
    'env',
    'sls',
    'param',
    'cf',
    's3',
    'ssm',
    'aws',
  ];

  const resolverConfiguration = {
    serviceDir: servicePath,
    configuration: service,
    variablesMeta,
    sources: {
      file: serverlessVariablesSourceFile,
      self: serverlessVariablesSourceSelf,
      strToBool: serverlessVariablesSourceStrToBool,
      opt: serverlessVariablesSourceOpt,
      env: serverlessVariablesSourceEnv,
      sls: serverlessVariablesSourceSls(serverlessFrameworkInstance),
      param: serverlessVariablesSourceParams({
        service,
        serviceInstanceParamsFromPlatform,
      }),
      cf: serverlessVariablesSourceAwsCf(serverlessFrameworkInstance),
      s3: serverlessVariablesSourceAwsS3(serverlessFrameworkInstance),
      ssm: serverlessVariablesSourceAwsSsm(serverlessFrameworkInstance),
      aws: serverlessVariablesSourceAws(serverlessFrameworkInstance),
    },
    options,
    fulfilledSources: new Set(sourcesToResolveFrom),
    variableSourcesInConfig: new Set(),
    // propertyPathsToResolve: new Set([]), // Omit to resolve everything
  };

  resolveExternalPluginSources(
    service,
    servicePath,
    serverlessFrameworkInstance.pluginManager.externalPlugins
  );

  await resolveVariables(resolverConfiguration);
  const resolvedService = resolverConfiguration.configuration;

  // Throw any resolution errors
  const resolutionErrors = new Set(
    Array.from(variablesMeta.values(), ({ error }) => error).filter(Boolean)
  );
  if (resolutionErrors.size) {
    throw new ServerlessError(
      `Cannot resolve ${path.basename(servicePath)}: Variables resolution errored with:${Array.from(
        resolutionErrors,
        (error) => `\n  - ${error.message}`
      )}`,
      'VARIABLES_RESOLUTION_ERROR'
    );
  }

  // Return if no remaining variables exist
  if (!variablesMeta.size) {
    return resolvedService;
  }

  /**
   * Report unrecognized Serverless Variable Sources found
   * within the Service configuration, which naturally, are
   * still unresolved.
   */
  const unresolvedSources = require('./variables/resolve-unresolved-source-types')(variablesMeta);
  const recognizedSourceNames = new Set(Object.keys(resolverConfiguration.sources));
  const unrecognizedSourceNames = Array.from(unresolvedSources.keys()).filter(
    (sourceName) => !recognizedSourceNames.has(sourceName)
  );

  if (unrecognizedSourceNames.includes('output')) {
    throw new ServerlessError(
      '"Cannot resolve configuration: ' +
        '"output" variable can only be used in ' +
        'services deployed with Serverless Dashboard (with "org" setting configured)',
      'DASHBOARD_VARIABLE_SOURCES_MISUSE'
    );
  }
  throw new ServerlessError(
    `Unrecognized configuration variable sources: "${unrecognizedSourceNames.join('", "')}"`,
    'UNRECOGNIZED_VARIABLE_SOURCES'
  );
};

module.exports = {
  resolveServerlessVariablesPhaseOne,
  resolveServerlessVariablesPhaseTwo,
  resolveServerlessVariablesPhaseThree,
  resolveServerlessVariablesPhaseFour,
};
