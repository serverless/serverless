'use strict';

const _ = require('lodash');
const { ServerlessSDK } = require('@serverless/platform-client');
const log = require('./log');
const errorHandler = require('./error-handler');
const wrap = require('./wrap');
const injectLogsIamRole = require('./inject-logs-iam-role');
const injectOutputOutputs = require('./inject-output-outputs');
const wrapClean = require('./wrap-clean');
const getAppUids = require('./app-uids');
const removeDestination = require('./remove-destination');
const { saveDeployment, createAndSetDeploymentUid } = require('./deployment');
const variables = require('./variables');
const { generate } = require('./generate-event');
const { configureDeployProfile } = require('./deploy-profile');
const { test } = require('./test');
const { getDashboardUrl, dashboardHandler } = require('./dashboard');
const setApiGatewayAccessLogFormat = require('./set-api-gateway-access-log-format');
const paramCommand = require('./param-command');
const outputCommand = require('./output-command');
const isAuthenticated = require('./is-authenticated');
const throwAuthError = require('./throw-auth-error');
const monitoringIntegrationService = require('./monitoring/monitoring-integration-service');

const unconditionalCommands = new Set([
  'dashboard',
  'generate-event',
  'help',
  'plugin',
]);

/*
 * Serverless Enterprise Plugin
 */

class ServerlessEnterprisePlugin {
  constructor(sls) {
    this.sls = sls;

    // Defaults
    this.state = {}; // Useful for storing data across hooks
    this.state.secretsUsed = new Set();

    if (sls.configSchemaHandler && sls.service.provider.name === 'aws') {
      // Source:
      // https://github.com/serverless/enterprise-dashboard/blob/6c3a0fa28bff97a80d5f3f88a907fa887f734151/backend/src/utils/formats.js#L44-L48
      sls.configSchemaHandler.defineTopLevelProperty('org', {
        type: 'string',
        pattern: '^[a-z0-9]{5,39}$',
      });
      // Source:
      // https://github.com/serverless/enterprise-dashboard/blob/6c3a0fa28bff97a80d5f3f88a907fa887f734151/backend/src/utils/formats.js#L50-L56
      sls.configSchemaHandler.defineTopLevelProperty('app', {
        type: 'string',
        pattern: '^[a-z0-9][a-z0-9-]{1,37}[a-z0-9]$',
      });
      sls.configSchemaHandler.defineTopLevelProperty('outputs', {
        type: 'object',
        additionalProperties: {
          anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array' },
            { type: 'object' },
          ],
        },
      });
      sls.configSchemaHandler.defineCustomProperties({
        properties: {
          enterprise: {
            type: 'object',
            properties: {
              collectApiGatewayLogs: { type: 'boolean' },
              collectLambdaLogs: { type: 'boolean' },
              compressLogs: { type: 'boolean' },
              disableAwsSpans: { type: 'boolean' },
              disableFrameworksInstrumentation: { type: 'boolean' },
              disableHttpSpans: { type: 'boolean' },
              logAccessIamRole: { $ref: '#/definitions/awsArnString' },
              logIngestMode: { enum: ['push', 'pull'] },
              disableWrapping: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const {
      service,
      processedInput: { options: cliOptions },
    } = this.sls;
    service.isDashboardMonitoringPreconfigured = Boolean(service.org);
    if (service.isDashboardMonitoringPreconfigured) {
      service.isDashboardAppPreconfigured = Boolean(service.app);
      service.isDashboardMonitoringOverridenByCli =
        (cliOptions.org && cliOptions.org !== service.org) ||
        (cliOptions.app && cliOptions.app !== service.app);
    }
    if (cliOptions.org) service.org = cliOptions.org;
    if (cliOptions.app) service.app = cliOptions.app;

    // Rely on commands schema as configured in "serverless"
    const commandsSchema = sls._commandsSchema;

    // Configure commands available to logged out users
    this.commands = {
      'generate-event': {
        ...commandsSchema.get('generate-event'),
      },
      'test': {
        ...commandsSchema.get('test'),
      },
      'dashboard': {
        ...commandsSchema.get('dashboard'),
      },
      'output': {
        type: 'container',
        commands: {
          get: {
            ...commandsSchema.get('output get'),
          },
          list: {
            ...commandsSchema.get('output list'),
          },
        },
      },
      'param': {
        type: 'container',
        commands: {
          get: {
            ...commandsSchema.get('param get'),
          },
          list: {
            ...commandsSchema.get('param list'),
          },
        },
      },
    };
    this.hooks = {
      'generate-event:generate-event': this.route('generate-event:generate-event').bind(this),
      'test:test': this.route('test:test').bind(this),
      'dashboard:dashboard': this.route('dashboard:dashboard').bind(this),
      'output:get:get': this.route('output:get:get').bind(this),
      'output:list:list': this.route('output:list:list').bind(this),
      'param:get:get': this.route('param:get:get').bind(this),
      'param:list:list': this.route('param:list:list').bind(this),
      // behavior is conditional on this.sls.enterpriseEnabled
      'after:aws:deploy:finalize:cleanup': this.route('after:aws:deploy:finalize:cleanup').bind(
        this
      ),
    };

    this.configurationVariablesSources = {
      param: { resolve: variables.paramResolve.bind(this) },
      output: { resolve: variables.outputResolve.bind(this) },
    };

    // Check if dashboard is configured
    const missing = [];
    if (!sls.service.org) {
      missing.push('org');
    }
    if (!sls.service.app) {
      missing.push('app');
    }
    if (!sls.service.service) {
      missing.push('service');
    }
    if (missing.length > 0 || !this.isDashboardEnabled) {
      this.sfeEnabledHooks = {};
    } else {
      this.sfeEnabledHooks = {
        'before:package:createDeploymentArtifacts': this.route(
          'before:package:createDeploymentArtifacts'
        ).bind(this),
        'after:package:createDeploymentArtifacts': this.route(
          'after:package:createDeploymentArtifacts'
        ).bind(this),
        'before:deploy:function:packageFunction': this.route(
          'before:deploy:function:packageFunction'
        ).bind(this),
        'after:deploy:function:packageFunction': this.route(
          'after:deploy:function:packageFunction'
        ).bind(this),
        'before:invoke:local:invoke': this.route('before:invoke:local:invoke').bind(this),
        'before:aws:package:finalize:saveServiceState': this.route(
          'before:aws:package:finalize:saveServiceState'
        ).bind(this),
        'before:deploy:deploy': this.route('before:deploy:deploy').bind(this),
        'after:aws:info:displayServiceInfo': this.route('after:aws:info:displayServiceInfo').bind(
          this
        ),
        'after:deploy:finalize': this.route('after:deploy:finalize').bind(this),
        'after:deploy:deploy': this.route('after:deploy:deploy').bind(this),
        'before:info:info': this.route('before:info:info').bind(this),
        'after:info:info': this.route('after:info:info').bind(this),
        'before:logs:logs': this.route('before:logs:logs').bind(this),
        'before:metrics:metrics': this.route('before:metrics:metrics').bind(this),
        'before:remove:remove': this.route('before:remove:remove').bind(this),
        'after:remove:remove': this.route('after:remove:remove').bind(this),
        'after:invoke:local:invoke': this.route('after:invoke:local:invoke').bind(this),
        'before:offline:start:init': this.route('before:offline:start:init').bind(this),
        'before:step-functions-offline:start': this.route(
          'before:step-functions-offline:start'
        ).bind(this),
      };
      // Set Plugin hooks for authenticated Enteprise Plugin features
      Object.assign(this.hooks, this.sfeEnabledHooks);
    }
  }

  /*
   * Route
   */

  route(hook) {
    return async () => {
      // throw an error if SFE is disabled and running an SFE only hook
      if (!this.sls.enterpriseEnabled && _.keys(this.sfeEnabledHooks).includes(hook)) {
        throwAuthError(this.sls);
      }

      switch (hook) {
        case 'before:package:createDeploymentArtifacts': {
          const sdk = new ServerlessSDK();
          const { supportedRegions } = await sdk.metadata.get();
          const region = this.provider.getRegion();
          if (!supportedRegions.includes(region)) {
            throw new this.sls.classes.Error(
              `"${region}" region is not supported by dashboard`,
              'DASHBOARD_NOT_SUPPORTED_REGION'
            );
          }
          Object.assign(
            this.sls.service,
            await getAppUids(this.sls.service.org, this.sls.service.app)
          );
          createAndSetDeploymentUid(this);
          await wrap(this);
          await injectLogsIamRole(this);
          await injectOutputOutputs(this);
          await setApiGatewayAccessLogFormat(this);
          break;
        }
        case 'after:package:createDeploymentArtifacts':
          await wrapClean(this);
          break;
        case 'before:deploy:function:packageFunction':
          createAndSetDeploymentUid(this);
          await wrap(this);
          break;
        case 'after:deploy:function:packageFunction':
          await wrapClean(this);
          break;
        case 'before:deploy:deploy':
          this.enterprise = {
            errorHandler: errorHandler(this), // V.1 calls this when it crashes
          };
          if (
            this.sls.configurationInput &&
            this.sls.configurationInput.org &&
            this.sls.configurationInput.app
          ) {
            await this.monitoringIntegrationService.configureIntegrationContext();
            await this.monitoringIntegrationService.ensureIntegrationIsConfigured();
          }
          break;
        case 'after:deploy:deploy':
          if (
            this.sls.configurationInput &&
            this.sls.configurationInput.org &&
            this.sls.configurationInput.app
          ) {
            await this.monitoringIntegrationService.instrumentService();
          }
          break;
        case 'after:aws:info:displayServiceInfo':
          this.sls.serviceOutputs.set('dashboard', getDashboardUrl(this));
          break;
        case 'after:aws:deploy:finalize:cleanup':
          if (this.sls.enterpriseEnabled) {
            await saveDeployment(this);
          }
          break;
        case 'before:info:info':
          break;
        case 'after:info:info':
          break;
        case 'dashboard:dashboard':
          await dashboardHandler(this);
          break;
        case 'before:logs:logs':
          break;
        case 'before:metrics:metrics':
          break;
        case 'before:remove:remove':
          break;
        case 'after:remove:remove':
          Object.assign(
            this.sls.service,
            await getAppUids(this.sls.service.org, this.sls.service.app)
          );
          await removeDestination(this);
          await saveDeployment(this, true);
          break;
        case 'before:invoke:local:invoke':
          Object.assign(this.sls.service, {
            appUid: '000000000000000000',
            orgUid: '000000000000000000',
          });
          await wrap(this);
          break;
        case 'after:invoke:local:invoke':
          await wrapClean(this);
          break;
        case 'before:offline:start:init':
          // await wrap(this)
          break;
        case 'before:step-functions-offline:start':
          // await wrap(this)
          break;
        case 'generate-event:generate-event':
          await generate(this);
          break;
        case 'test:test':
          await test(this);
          break;
        case 'param:get:get':
          await paramCommand.get(this);
          break;
        case 'param:list:list':
          await paramCommand.list(this);
          break;
        case 'output:get:get':
          await outputCommand.get(this);
          break;
        case 'output:list:list':
          await outputCommand.list(this);
          break;

        default:
      }
    };
  }

  async asyncInit() {
    // this.provider, intentionally not set in constructor, as then it affects plugin validation
    // in serverless, which will discard plugin when command not run in service context:
    // https://github.com/serverless/serverless/blob/f0ccf6441ace7b5cc524e774f025a39c3c0667f2/lib/classes/PluginManager.js#L78
    this.provider = this.sls.getProvider('aws');

    if (
      this.sls.processedInput.options['help-interactive'] ||
      this.sls.processedInput.options.help
    ) {
      return;
    }

    const missingConfigSettings = [];
    if (!this.sls.service.org) {
      missingConfigSettings.push('org');
    }
    if (!this.sls.service.app) {
      missingConfigSettings.push('app');
    }
    if (!this.sls.service.service) {
      missingConfigSettings.push('service');
    }
    const currentCommand = this.sls.processedInput.commands[0];
    if (
      missingConfigSettings.length === 0 &&
      isAuthenticated() &&
      !unconditionalCommands.has(currentCommand)
    ) {
      // Support providers wih dashboard explicitly disabled (console case)
      await configureDeployProfile(this);
      this.sls.enterpriseEnabled = this.isDashboardEnabled;
      this.monitoringIntegrationService = monitoringIntegrationService(this.sls);
    }
  }

  get isDashboardEnabled() {
    const {
      service,
      processedInput: { options: cliOptions },
      isDashboardEnabled,
    } = this.sls;
    if (isDashboardEnabled != null) {
      return isDashboardEnabled && Boolean(service.app || cliOptions.app);
    }
    return Boolean((service.org || cliOptions.org) && (service.app || cliOptions.app));
  }
}

module.exports = ServerlessEnterprisePlugin;
