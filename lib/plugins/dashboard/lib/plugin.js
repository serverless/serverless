'use strict';

const errorHandler = require('./error-handler');
const injectOutputOutputs = require('./inject-output-outputs');
const { saveDeployment, createAndSetDeploymentUid } = require('./deployment');
const variables = require('./variables');
const { getDashboardUrl, dashboardHandler } = require('./dashboard');
const paramCommand = require('./param-command');
const outputCommand = require('./output-command');
const monitoringIntegrationService = require('./monitoring/monitoring-integration-service');

const unconditionalCommands = new Set([
  'dashboard',
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
      // Org name
      sls.configSchemaHandler.defineTopLevelProperty('org', {
        type: 'string',
        pattern: '^[a-z0-9]{5,39}$',
      });
      // Org ID (Added in V.4)
      sls.configSchemaHandler.defineTopLevelProperty('orgId', {
        type: 'string',
        pattern: '^[a-zA-Z0-9-]{5,250}$',
      });
      // App name
      sls.configSchemaHandler.defineTopLevelProperty('app', {
        type: 'string',
        pattern: '^[a-z0-9][a-z0-9-]{1,37}[a-z0-9]$',
      });
      // App ID (Added in V.4)
      sls.configSchemaHandler.defineTopLevelProperty('appId', {
        type: 'string',
        pattern: '^[a-zA-Z0-9-]{5,250}$',
      });
      // Outputs
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
      // Monitoring
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

      switch (hook) {
        case 'before:package:createDeploymentArtifacts': {
          createAndSetDeploymentUid(this);
          await injectOutputOutputs(this);
          break;
        }
        case 'before:deploy:function:packageFunction':
          createAndSetDeploymentUid(this);
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
            await this.monitoringIntegrationService.configureIntegrationContext({
              accessKey: this.sls.accessKey,
              orgId: this.sls.orgId,
              orgName: this.sls.orgName,
            });
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
          await saveDeployment(this, true);
          break;
        case 'before:invoke:local:invoke':
          Object.assign(this.sls.service, {
            appUid: '000000000000000000',
            orgUid: '000000000000000000',
          });
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
      !unconditionalCommands.has(currentCommand)
    ) {
      this.sls.enterpriseEnabled = this.isDashboardEnabled;
      this.monitoringIntegrationService = await monitoringIntegrationService(this.sls);
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
