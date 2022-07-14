'use strict';

const _ = require('lodash');
const d = require('d');
const lazy = require('d/lazy');
const path = require('path');
const semver = require('semver');
const log = require('@serverless/utils/log').log.get('console');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const urls = require('@serverless/utils/lib/auth/urls');
const apiRequest = require('@serverless/utils/api-request');

const ServerlessError = require('../serverless-error');

const supportedCommands = new Set([
  'deploy',
  'deploy function',
  'info',
  'package',
  'remove',
  'rollback',
]);

class Console {
  constructor(serverless) {
    this.serverless = serverless;
    // Used to confirm that we obtained compatible console state data for deployment
    this.stateSchemaVersion = '2';
  }

  async initialize() {
    const { configurationInput: configuration } = this.serverless;
    this.isEnabled = (() => {
      const {
        processedInput: { commands, options },
      } = this.serverless;
      if (!_.get(configuration, 'console')) return false;
      this.org = options.org || configuration.console.org || configuration.org;
      if (!this.org) return false;
      const command = commands.join(' ');
      if (!supportedCommands.has(command)) return false;

      const providerName = configuration.provider.name || configuration.provider;
      if (providerName !== 'aws') {
        log.error(`Provider "${providerName}" is currently not supported by the console`);
        return false;
      }

      if (command !== 'rollback' && (command !== 'deploy' || !options.package)) {
        if (
          !Object.values(this.serverless.service.functions).some((functionConfig) =>
            this.isFunctionSupported(functionConfig)
          )
        ) {
          log.warning(
            "Cannot enable console: Service doesn't configure any function with the supported runtime"
          );
          return false;
        }
      }
      return true;
    })();
    if (!this.isEnabled) return;
    if (!(await resolveAuthMode())) {
      const errorMessage = process.env.CI
        ? 'You are not currently logged in. Follow instructions in http://slss.io/run-in-cicd to setup env vars for authentication.'
        : 'You are not currently logged in. To log in, run "serverless login --console"';
      throw new ServerlessError(errorMessage, 'CONSOLE_NOT_AUTHENTICATED');
    }
    this.packagePath =
      this.serverless.processedInput.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir, '.serverless');
    this.provider = this.serverless.getProvider('aws');
    try {
      this.orgId = (await apiRequest(`/api/identity/orgs/name/${this.org}`)).orgId;
    } catch (error) {
      if (error.httpStatusCode === 404) {
        throw new ServerlessError(
          `You are not authenticated to deploy into the org "${this.org}"`,
          'CONSOLE_ORG_MISMATCH'
        );
      }
      throw error;
    }
    this.service = this.serverless.service.service;
    this.stage = this.provider.getStage();
    this.region = this.provider.getRegion();
    this.config = configuration.console;
  }

  isFunctionSupported({ handler, runtime }) {
    if (!handler) return false; // Docker container image (not supported yet)
    if (!runtime) return true; // Default is supported nodejs runtime
    return runtime.startsWith('nodejs');
  }

  async createOtelIngestionToken() {
    const responseBody = await apiRequest(
      `/ingestion/kinesis/org/${this.orgId}/service/${this.service}/stage/${this.stage}`
    );
    if (!_.get(responseBody, 'token.accessToken')) {
      throw new Error(
        `Cannot deploy to the Console: Unexpected server response (${JSON.stringify(responseBody)})`
      );
    }
    if (responseBody.status === 'new_token') {
      this.isFreshOtelIngestionToken = true;
      if (this.serverless.processedInput.commands.join(' ') === 'deploy') {
        log.info(
          'Generated a new access token for the Console (deployment may take longer than' +
            ' anticipated as the configuration of all functions will be updated)'
        );
      }
    }
    return responseBody.token.accessToken;
  }

  async activateOtelIngestionToken() {
    await apiRequest('/ingestion/kinesis/token', {
      method: 'PATCH',
      body: {
        orgId: this.orgId,
        serviceId: this.service,
        stage: this.stage,
        token: await this.deferredOtelIngestionToken,
      },
    });
  }

  async deactivateOtherOtelIngestionTokens() {
    const searchParams = new URLSearchParams();
    searchParams.set('orgId', this.orgId);
    searchParams.set('serviceId', this.service);
    searchParams.set('stage', this.stage);
    searchParams.set('token', await this.deferredOtelIngestionToken);
    await apiRequest(`/ingestion/kinesis/tokens?${searchParams}`, { method: 'DELETE' });
  }

  async deactivateAllOtelIngestionTokens() {
    const searchParams = new URLSearchParams();
    searchParams.set('orgId', this.orgId);
    searchParams.set('serviceId', this.service);
    searchParams.set('stage', this.stage);

    await apiRequest(`/ingestion/kinesis/tokens?${searchParams}`, { method: 'DELETE' });
  }

  async deactivateOtelIngestionToken() {
    await apiRequest(`/ingestion/kinesis/token?token=${await this.deferredOtelIngestionToken}`, {
      method: 'DELETE',
    });
  }

  overrideSettings({ otelIngestionToken, layerVersion, service, stage, region }) {
    this.layerVersion = layerVersion;
    Object.defineProperties(this, {
      deferredOtelIngestionToken: d(Promise.resolve(otelIngestionToken)),
      service: d('cew', service),
      stage: d('cew', stage),
      region: d('cew', region),
    });
  }
}

Object.defineProperties(
  Console.prototype,
  lazy({
    deferredLayerArn: d(async function () {
      if (process.env.SLS_OTEL_LAYER_ARN) {
        if (!process.env.SLS_OTEL_LAYER_ARN.includes(':layer:sls-otel-extension-')) {
          throw new ServerlessError(
            'Cannot rely on custom extension layer ARN: ' +
              'For compatibility reasons layer name must be prefixed with "sls-otel-extension-"',
            'CONSOLE_INCOMPATIBLE_CUSTOM_LAYER_ARN'
          );
        }
        this.layerVersion = 'custom';
        return process.env.SLS_OTEL_LAYER_ARN;
      }
      const data = JSON.parse(
        String(
          (
            await this.provider.request('S3', 'getObject', {
              Bucket: 'sls-layers-registry',
              Key: 'sls-otel-extension-node.json',
            })
          ).Body
        )
      );
      if (!data[this.region]) {
        throw new ServerlessError(
          `Region "${this.region} is not supported by the Console"`,
          'CONSOLE_UNSUPPORTED_REGION'
        );
      }
      const version = semver.maxSatisfying(Object.keys(data[this.region]), '^0.5.0');
      if (!version) {
        throw new ServerlessError(
          `Region "${this.region} is not supported by the Console"`,
          'CONSOLE_UNSUPPORTED_VERSION_IN_REGION'
        );
      }
      this.layerVersion = version;
      return data[this.region][version];
    }),
    deferredFunctionEnvironmentVariables: d(function () {
      return this.deferredOtelIngestionToken.then((otelIngestionToken) => {
        const userSettings = _.merge({}, this.config.monitoring, {
          ingestToken: otelIngestionToken,
          orgId: this.orgId,
          namespace: this.service,
          environment: this.stage,
        });
        const result = {
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-extension-internal-node/exec-wrapper.sh',
          SLS_EXTENSION: JSON.stringify(userSettings),
        };
        if (process.env.SERVERLESS_PLATFORM_STAGE) {
          result.SERVERLESS_PLATFORM_STAGE = process.env.SERVERLESS_PLATFORM_STAGE;
        }
        if (process.env.SLS_OTEL_LAYER_DEV_BUILD) result.SLS_DEBUG_EXTENSION = '1';
        return result;
      });
    }),
    deferredOtelIngestionToken: d(function () {
      return this.createOtelIngestionToken();
    }),
    url: d(function () {
      return (
        `${urls.frontend}/${this.org}/metrics/functions` +
        `?globalEnvironments=${this.stage}&globalNamespaces=${this.service}` +
        `&globalRegions=${this.region}&globalScope=functions&globalTimeFrame=15m`
      );
    }),
  })
);

module.exports = Console;
