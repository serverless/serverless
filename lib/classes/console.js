'use strict';

const _ = require('lodash');
const d = require('d');
const lazy = require('d/lazy');
const path = require('path');
const fsp = require('fs').promises;
const fetch = require('node-fetch');
const filesize = require('filesize');
const log = require('@serverless/utils/log').log.get('console');
const isAuthenticated = require('@serverless/dashboard-plugin/lib/is-authenticated');
const { getPlatformClientWithAccessKey } = require('@serverless/dashboard-plugin/lib/client-utils');
const ServerlessError = require('../serverless-error');
const { setBucketName } = require('../plugins/aws/lib/set-bucket-name');
const { uploadZipFile } = require('../plugins/aws/lib/upload-zip-file');

const supportedCommands = new Set(['deploy', 'deploy function', 'package', 'remove', 'rollback']);
const devVersionTimeBase = new Date(2022, 1, 17).getTime();

class Console {
  constructor(serverless) {
    this.serverless = serverless;
    // Used to confirm that we obtained compatible console state data for deployment
    this.stateSchemaVersion = '1';
  }

  async initialize() {
    this.isEnabled = (() => {
      const {
        configurationInput: configuration,
        processedInput: { commands, options },
      } = this.serverless;
      if (!_.get(configuration, 'console')) return false;
      this.org = options.org || configuration.org;
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
    if (!isAuthenticated()) {
      const errorMessage = process.env.CI
        ? 'You are not currently logged in. Follow instructions in http://slss.io/run-in-cicd to setup env vars for authentication.'
        : 'You are not currently logged in. To log in, run "serverless login"';
      throw new ServerlessError(errorMessage, 'CONSOLE_NOT_AUTHENTICATED');
    }
    this.packagePath =
      this.serverless.processedInput.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir, '.serverless');
    this.provider = this.serverless.getProvider('aws');
    this.sdk = await getPlatformClientWithAccessKey(this.org);
    this.orgId = (await this.sdk.getOrgByName(this.org)).orgUid;
    this.service = this.serverless.service.service;
    this.stage = this.provider.getStage();
    this.otelIngestionUrl = (() => {
      if (process.env.SLS_CONSOLE_OTEL_INGESTION_URL) {
        return process.env.SLS_CONSOLE_OTEL_INGESTION_URL;
      }
      return process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
        ? 'https://core.serverless-dev.com/ingestion/kinesis'
        : 'https://core.serverless.com/ingestion/kinesis';
    })();
  }

  isFunctionSupported({ handler, runtime }) {
    if (!handler) return false; // Docker container image (not supported yet)
    if (!runtime) return true; // Default is supported nodejs runtime
    return runtime.startsWith('nodejs');
  }

  async createOtelIngestionToken() {
    const url = `${this.otelIngestionUrl}/org/${this.orgId}/service/${this.service}/stage/${this.stage}`;
    const data = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sdk.accessKey}`,
        'Content-Type': 'application/json',
      },
    };
    log.debug('get token: %s %o', url, data);
    const response = await fetch(url, data);
    if (!response.ok) {
      throw new ServerlessError(
        `Cannot deploy to the Console: Cannot retrieve token (${
          response.status
        }: ${await response.text()})`,
        'CONSOLE_TOKEN_GENERATION_FAILURE'
      );
    }
    const responseBody = await response.json();
    log.debug('get token response: %o', responseBody);
    if (!_.get(responseBody, 'token.accessToken')) {
      throw new Error(
        `Cannot deploy to the Console: Unexpected server response (${JSON.stringify(responseBody)})`
      );
    }
    if (responseBody.status === 'new_token') {
      this.isFreshOtelIngestionToken = true;
      if (this.serverless.processedInput.commands.join(' ') === 'deploy') {
        log.notice(
          'Generated a new access token for the Console (deployment may take longer than' +
            ' anticipated as the configuration of all functions will be updated)'
        );
      }
    }
    return responseBody.token.accessToken;
  }

  async activateOtelIngestionToken() {
    const url = `${this.otelIngestionUrl}/token`;
    const data = {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.sdk.accessKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orgId: this.orgId,
        serviceId: this.service,
        stage: this.stage,
        token: await this.deferredOtelIngestionToken,
      }),
    };
    log.debug('activate token %s %o', url, data);
    const response = await fetch(url, data);
    if (!response.ok) {
      throw new ServerlessError(
        `Cannot deploy to the Console: Cannot activate token (${
          response.status
        }: ${await response.text()})`,
        'CONSOLE_TOKEN_CREATION_FAILURE'
      );
    }
    await response.text();
  }

  async deactivateOtherOtelIngestionTokens() {
    const searchParams = new URLSearchParams();
    searchParams.set('orgId', this.orgId);
    searchParams.set('serviceId', this.service);
    searchParams.set('stage', this.stage);
    searchParams.set('token', await this.deferredOtelIngestionToken);
    const url = `${this.otelIngestionUrl}/tokens?${searchParams}`;
    const data = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.sdk.accessKey}`,
      },
    };
    log.debug('deactivate other tokens %s %o', url, data);
    const response = await fetch(url, data);
    if (!response.ok) {
      log.error(
        'Console communication problem ' +
          'when deactivating no longer used otel ingestion tokens: %d %s',
        response.status,
        await response.text()
      );
      return;
    }
    await response.text();
  }

  async deactivateAllOtelIngestionTokens() {
    const searchParams = new URLSearchParams();
    searchParams.set('orgId', this.orgId);
    searchParams.set('serviceId', this.service);
    searchParams.set('stage', this.stage);
    const url = `${this.otelIngestionUrl}/tokens?${searchParams}`;
    const data = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.sdk.accessKey}`,
      },
    };
    log.debug('deactivate all tokens %s %o', url, data);
    const response = await fetch(url, data);
    if (!response.ok) {
      log.error(
        'Console communication problem when deactivating otel ingestion tokens: %d %s',
        response.status,
        await response.text()
      );
      return;
    }
    await response.text();
  }

  async deactivateOtelIngestionToken() {
    const url = `${this.otelIngestionUrl}/token?token=${await this.deferredOtelIngestionToken}`;
    const data = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.sdk.accessKey}`,
      },
    };
    log.debug('deactivate token %s %o', url, data);
    const response = await fetch(url, data);
    if (!response.ok) {
      log.error(
        'Console communication problem when deactivating otel ingestion token: %d %s',
        response.status,
        await response.text()
      );
      return;
    }
    await response.text();
  }

  overrideSettings({ otelIngestionToken, extensionLayerVersionPostfix, service, stage }) {
    Object.defineProperties(this, {
      deferredOtelIngestionToken: d(Promise.resolve(otelIngestionToken)),
      extensionLayerVersionPostfix: d(extensionLayerVersionPostfix),
      service: d('cew', service),
      stage: d('cew', stage),
    });
  }

  compileOtelExtensionLayer() {
    log.debug('compile extension resource (%s)', this.extensionLayerName);
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getConsoleExtensionLayerLogicalId()
    ] = {
      Type: 'AWS::Lambda::LayerVersion',
      Properties: {
        Content: {
          S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          S3Key: `${this.serverless.service.package.artifactsS3KeyDirname}/${this.extensionLayerFilename}`,
        },
        LayerName: this.extensionLayerName,
      },
    };
  }

  async packageOtelExtensionLayer() {
    log.debug('copy extension file (%s) to package directory', this.extensionLayerFilename);
    await fsp.copyFile(
      require.resolve('@serverless/aws-lambda-otel-extension-dist/extension.zip'),
      path.join(this.serverless.serviceDir, '.serverless', this.extensionLayerFilename)
    );
  }

  async ensureLayerVersion() {
    let layerVersionMeta = (
      await this.provider.request('Lambda', 'listLayerVersions', {
        LayerName: this.extensionLayerName,
      })
    ).LayerVersions[0];
    if (!layerVersionMeta) {
      log.debug('publish layer version (%s)', this.extensionLayerName);
      await this.uploadOtelExtensionLayer({ readFromTheSource: true });
      await setBucketName.call(this);
      await this.provider.request('Lambda', 'publishLayerVersion', {
        LayerName: this.extensionLayerName,
        Content: {
          S3Bucket: this.bucketName,
          S3Key: `${this.serverless.service.package.artifactsS3KeyDirname}/${this.extensionLayerFilename}`,
        },
      });
      layerVersionMeta = (
        await this.provider.request('Lambda', 'listLayerVersions', {
          LayerName: this.extensionLayerName,
        })
      ).LayerVersions[0];
    } else {
      log.debug('layer version already published (%s)', this.extensionLayerName);
    }
    log.debug('retrieved layer version arn (%s)', layerVersionMeta.LayerVersionArn);
    return layerVersionMeta.LayerVersionArn;
  }

  async uploadOtelExtensionLayer(options = {}) {
    log.debug(
      'check if extension file (%s) is already uploaded to S3',
      this.extensionLayerFilename
    );
    await setBucketName.call(this);
    try {
      await this.provider.request('S3', 'headObject', {
        Bucket: this.bucketName,
        Key: `${this.serverless.service.package.artifactsS3KeyDirname}/${this.extensionLayerFilename}`,
      });
      // Extension layer is already available at S3, skip
      log.debug('extension file is already uploaded to S3');
      return;
    } catch (error) {
      if (error.code !== 'AWS_S3_HEAD_OBJECT_NOT_FOUND') throw error;
      const filename = options.readFromTheSource
        ? require.resolve('@serverless/aws-lambda-otel-extension-dist/extension.zip')
        : path.join(this.packagePath, this.extensionLayerFilename);
      const stats = await fsp.stat(filename);
      log.info(`Uploading console otel extension file to S3 (${filesize(stats.size)})`);
      await uploadZipFile.call(this, {
        filename,
        s3KeyDirname: this.serverless.service.package.artifactsS3KeyDirname,
        basename: this.extensionLayerFilename,
      });
    }
  }
}

Object.defineProperties(
  Console.prototype,
  lazy({
    deferredFunctionEnvironmentVariables: d(function () {
      return this.deferredOtelIngestionToken.then((otelIngestionToken) => {
        const result = {
          SLS_OTEL_REPORT_REQUEST_HEADERS: `serverless-token=${otelIngestionToken}`,
          SLS_OTEL_REPORT_METRICS_URL: `${this.otelIngestionUrl}/v1/metrics`,
          SLS_OTEL_REPORT_TRACES_URL: `${this.otelIngestionUrl}/v1/traces`,
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-extension/otel-handler',
        };
        if (process.env.SLS_OTEL_LAYER_DEV_BUILD) result.DEBUG_SLS_OTEL_LAYER = '1';
        return result;
      });
    }),
    deferredOtelIngestionToken: d(function () {
      return this.createOtelIngestionToken();
    }),
    extensionLayerName: d(function () {
      return `sls-console-otel-extension-${this.extensionLayerVersionPostfix.replace(/\./g, '-')}`;
    }),
    extensionLayerFilename: d(function () {
      return `sls-otel.${this.extensionLayerVersionPostfix}.zip`;
    }),
    extensionLayerVersionPostfix: d(() => {
      if (process.env.SLS_OTEL_LAYER_VERSION) return process.env.SLS_OTEL_LAYER_VERSION;
      const installedVersion =
        require('@serverless/aws-lambda-otel-extension-dist/package').version;
      if (installedVersion) return installedVersion;
      // If we link to package in repository, then there's no version exposed
      return (Date.now() - devVersionTimeBase).toString(32);
    }),
  })
);

module.exports = Console;
