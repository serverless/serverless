'use strict';

const _ = require('lodash');
const d = require('d');
const lazy = require('d/lazy');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const fetch = require('node-fetch');
const tar = require('tar');
const filesize = require('filesize');
const provisionTmpDir = require('process-utils/tmpdir/provision');
const resolvePackageVersionMetadata = require('npm-registry-utilities/resolve-version-metadata');
const log = require('@serverless/utils/log').log.get('console');
const resolveAuthMode = require('@serverless/utils/auth/resolve-mode');
const backendUrl = require('@serverless/utils/lib/auth/urls').backend;
const apiRequest = require('@serverless/utils/api-request');

const ServerlessError = require('../serverless-error');
const ensureExists = require('../utils/ensure-exists');
const safeMoveFile = require('../utils/fs/safe-move-file');
const { setBucketName } = require('../plugins/aws/lib/set-bucket-name');
const { uploadZipFile } = require('../plugins/aws/lib/upload-zip-file');

const supportedCommands = new Set([
  'deploy',
  'deploy function',
  'info',
  'package',
  'remove',
  'rollback',
]);
const devVersionTimeBase = new Date(2022, 1, 17).getTime();
const extensionCachePath = path.resolve(os.homedir(), '.serverless/aws-lambda-otel-extension');
const ingestionServerUrl = `${backendUrl}/ingestion/kinesis`;

class Console {
  constructor(serverless) {
    this.serverless = serverless;
    // Used to confirm that we obtained compatible console state data for deployment
    this.stateSchemaVersion = '1';
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

  overrideSettings({ otelIngestionToken, extensionLayerVersionPostfix, service, stage, region }) {
    // Store at "_usedExtensionLayerVersionPostfix" for telemetry purposes
    this._usedExtensionLayerVersionPostfix = extensionLayerVersionPostfix;
    Object.defineProperties(this, {
      deferredOtelIngestionToken: d(Promise.resolve(otelIngestionToken)),
      deferredExtensionLayerVersionPostfix: d(Promise.resolve(extensionLayerVersionPostfix)),
      service: d('cew', service),
      stage: d('cew', stage),
      region: d('cew', region),
    });
  }

  async compileOtelExtensionLayer() {
    const layerName = await this.deferredExtensionLayerName;
    log.debug('compile extension resource (%s)', layerName);
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getConsoleExtensionLayerLogicalId()
    ] = {
      Type: 'AWS::Lambda::LayerVersion',
      Properties: {
        Content: {
          S3Bucket: this.serverless.service.package.deploymentBucket || {
            Ref: this.provider.naming.getDeploymentBucketLogicalId(),
          },
          S3Key: `${this.serverless.service.package.artifactsS3KeyDirname}/${await this
            .deferredExtensionLayerBasename}`,
        },
        LayerName: layerName,
      },
    };
  }

  async packageOtelExtensionLayer() {
    const layerFilename = await this.deferredExtensionLayerFilename;
    log.debug('copy extension file (%s) to package directory', layerFilename);
    await fse.ensureDir(path.join(this.serverless.serviceDir, '.serverless'));
    await fsp.copyFile(
      layerFilename,
      path.join(
        this.serverless.serviceDir,
        '.serverless',
        await this.deferredExtensionLayerBasename
      )
    );
  }

  async ensureLayerVersion() {
    const layerName = await this.deferredExtensionLayerName;
    let layerVersionMeta = (
      await this.provider.request('Lambda', 'listLayerVersions', {
        LayerName: layerName,
      })
    ).LayerVersions[0];
    if (!layerVersionMeta) {
      log.debug('publish layer version (%s)', layerName);
      await this.uploadOtelExtensionLayer({ readFromTheSource: true });
      await this.provider.request('Lambda', 'publishLayerVersion', {
        LayerName: layerName,
        Content: {
          S3Bucket: await this.deferredBucketName,
          S3Key: `${this.serverless.service.package.artifactsS3KeyDirname}/${await this
            .deferredExtensionLayerBasename}`,
        },
      });
      layerVersionMeta = (
        await this.provider.request('Lambda', 'listLayerVersions', {
          LayerName: layerName,
        })
      ).LayerVersions[0];
    } else {
      log.debug('layer version already published (%s)', layerName);
    }
    log.debug('retrieved layer version arn (%s)', layerVersionMeta.LayerVersionArn);
    return layerVersionMeta.LayerVersionArn;
  }

  async uploadOtelExtensionLayer(options = {}) {
    const layerBasename = await this.deferredExtensionLayerBasename;
    const bucketName = await this.deferredBucketName;
    const key = `${this.serverless.service.package.artifactsS3KeyDirname}/${layerBasename}`;
    log.debug(
      'check if extension file (%s) is already uploaded to S3 (%s/%s)',
      layerBasename,
      bucketName,
      key
    );
    try {
      await this.provider.request('S3', 'headObject', {
        Bucket: bucketName,
        Key: key,
      });
      // Extension layer is already available at S3, skip
      log.debug('extension file is already uploaded to S3');
      return;
    } catch (error) {
      if (error.code !== 'AWS_S3_HEAD_OBJECT_NOT_FOUND') throw error;
      const filename = options.readFromTheSource
        ? await this.deferredExtensionLayerFilename
        : path.join(this.packagePath, layerBasename);
      const stats = await fsp.stat(filename);
      log.info(`Uploading console otel extension file to S3 (${filesize(stats.size)})`);
      // bucketName is accessed by uploadZipFile
      this.bucketName = await this.deferredBucketName;
      await uploadZipFile.call(this, {
        filename,
        s3KeyDirname: this.serverless.service.package.artifactsS3KeyDirname,
        basename: layerBasename,
      });
    }
  }
}

Object.defineProperties(
  Console.prototype,
  lazy({
    deferredBucketName: d(async function () {
      const tmpObject = { provider: this.provider };
      await setBucketName.call(tmpObject);
      return tmpObject.bucketName;
    }),
    deferredFunctionEnvironmentVariables: d(function () {
      return this.deferredOtelIngestionToken.then((otelIngestionToken) => {
        const userSettings = _.merge({}, this.config.monitoring, {
          common: { destination: { requestHeaders: `serverless_token=${otelIngestionToken}` } },
          logs: { destination: `${ingestionServerUrl}/v1/logs` },
          metrics: { destination: `${ingestionServerUrl}/v1/metrics` },
          request: { destination: `${ingestionServerUrl}/v1/request-response` },
          response: { destination: `${ingestionServerUrl}/v1/request-response` },
          traces: { destination: `${ingestionServerUrl}/v1/traces` },
        });
        const result = {
          OTEL_RESOURCE_ATTRIBUTES:
            `sls_service_name=${this.service},sls_stage=${this.stage},` +
            `sls_org_id=${this.orgId}`,
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-extension-internal-node/exec-wrapper.sh',
          SLS_OTEL_USER_SETTINGS: JSON.stringify(userSettings),
        };
        if (process.env.SLS_OTEL_LAYER_DEV_BUILD) result.DEBUG_SLS_OTEL_LAYER = '1';
        return result;
      });
    }),
    deferredOtelIngestionToken: d(function () {
      return this.createOtelIngestionToken();
    }),
    deferredExtensionLayerFilename: d(async () => {
      if (process.env.SLS_OTEL_LAYER_FILENAME) {
        log.debug('target extension filename (overriden): %s', process.env.SLS_OTEL_LAYER_FILENAME);
        return process.env.SLS_OTEL_LAYER_FILENAME;
      }
      const extensionVersionMetadata = await resolvePackageVersionMetadata(
        '@serverless/aws-lambda-otel-extension-dist',
        '^0.4'
      );
      log.debug('target extension version: %s', extensionVersionMetadata.version);
      const extensionArtifactFilename = path.resolve(
        extensionCachePath,
        `${extensionVersionMetadata.version}.zip`
      );
      await ensureExists(extensionArtifactFilename, async () => {
        log.debug('resolving extension layer from npm registry');
        const tmpDir = await provisionTmpDir();
        const response = await fetch(extensionVersionMetadata.dist.tarball);
        await new Promise((resolve, reject) => {
          const stream = response.body.pipe(tar.x({ cwd: tmpDir, strip: 1 }));
          stream.on('error', reject);
          stream.on('end', resolve);
        });
        await safeMoveFile(path.resolve(tmpDir, 'extension.zip'), extensionArtifactFilename);
      });
      return extensionArtifactFilename;
    }),
    deferredExtensionLayerName: d(async function () {
      return `sls-console-otel-extension-${(
        await this.deferredExtensionLayerVersionPostfix
      ).replace(/\./g, '-')}`;
    }),
    deferredExtensionLayerBasename: d(async function () {
      return `sls-otel.${await this.deferredExtensionLayerVersionPostfix}.zip`;
    }),
    deferredExtensionLayerVersionPostfix: d(async function () {
      const extensionLayerVersionPostfix = process.env.SLS_OTEL_LAYER_FILENAME
        ? (Date.now() - devVersionTimeBase).toString(32)
        : path.basename(await this.deferredExtensionLayerFilename, '.zip');
      // Store at "_usedExtensionLayerVersionPostfix" for telemetry purposes
      this._usedExtensionLayerVersionPostfix = extensionLayerVersionPostfix;
      return extensionLayerVersionPostfix;
    }),
    url: d(function () {
      return (
        `https://console.serverless.com/${this.org}/metrics/functions` +
        `?globalEnvironments=${this.stage}&globalNamespaces=${this.service}` +
        `&globalRegions=${this.region}&globalScope=functions&globalTimeFrame=15m`
      );
    }),
  })
);

module.exports = Console;
