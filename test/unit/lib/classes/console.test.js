'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const fsp = require('fs').promises;
const _ = require('lodash');
const fetch = require('node-fetch');
const log = require('log').get('serverless:test');
const runServerless = require('../../../utils/run-serverless');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

const createFetchStub = () => {
  const requests = [];
  return {
    requests,
    stub: sinon.stub().callsFake(async (url, { method } = { method: 'GET' }) => {
      log.debug('fetch request %s %o', url, method);
      if (url.includes('/org/')) {
        if (method.toUpperCase() === 'GET') {
          requests.push('get-token');
          return {
            ok: true,
            json: async () => ({
              status: 'existing_token',
              token: { accessToken: 'accesss-token' },
            }),
          };
        }
      } else if (url.endsWith('/token')) {
        if (method.toUpperCase() === 'PATCH') {
          requests.push('activate-token');
          return { ok: true, text: async () => '' };
        }
      } else if (url.includes('/tokens?')) {
        if (method.toUpperCase() === 'DELETE') {
          requests.push(
            url.includes('token=') ? 'deactivate-other-tokens' : 'deactivate-all-tokens'
          );
          return { ok: true, text: async () => '' };
        }
      } else if (url.includes('/token?')) {
        if (method.toUpperCase() === 'DELETE') {
          requests.push('deactivate-token');
          return { ok: true, text: async () => '' };
        }
      }
      if (url.startsWith('https://registry.npmjs.org')) return fetch(url, { method });
      throw new Error(`Unexpected request: ${url} method: ${method}`);
    }),
  };
};

const createApiStub = () => {
  const requests = [];
  return {
    requests,
    stub: sinon.stub().callsFake(async (pathname) => {
      log.debug('api request %s', pathname);
      if (pathname.includes('orgs/name/')) {
        requests.push('/orgs/name/{org}');
        const orgName = pathname.split('/').filter(Boolean).pop();
        return { orgId: `${orgName}id` };
      }
      throw new Error(`Unexpected request: ${pathname}`);
    }),
  };
};

let serviceName = 'irrelevant';
const createAwsRequestStubMap = () => ({
  CloudFormation: {
    describeStacks: { Stacks: [{ Outputs: [] }] },
    describeStackResource: {
      StackResourceDetail: { PhysicalResourceId: 'deployment-bucket' },
    },
  },
  Lambda: {
    getFunction: {
      Configuration: {
        LastModified: '2020-05-20T15:34:16.494+0000',
      },
    },
  },
  S3: {
    headObject: async ({ Key: s3Key }) => {
      if (s3Key.includes('sls-otel.')) {
        throw Object.assign(new Error('Not found'), {
          code: 'AWS_S3_HEAD_OBJECT_NOT_FOUND',
        });
      }
      return {
        Metadata: { filesha256: 'RRYyTm4Ri8mocpvx44pvas4JKLYtdJS3Z8MOlrZrDXA=' },
      };
    },
    listObjectsV2: () => ({
      Contents: [
        {
          Key: `serverless/${serviceName}/dev/1589988704359-2020-05-20T15:31:44.359Z/artifact.zip`,
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
        {
          Key: `serverless/${serviceName}/dev/1589988704359-2020-05-20T15:31:44.359Z/compiled-cloudformation-template.json`,
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
        {
          Key: `serverless/${serviceName}/dev/1589988704359-2020-05-20T15:31:44.359Z/serverless-state.json`,
          LastModified: new Date(),
          ETag: '"5102a4cf710cae6497dba9e61b85d0a4"',
          Size: 356,
          StorageClass: 'STANDARD',
        },
      ],
    }),
    headBucket: {},
    upload: sinon.stub().callsFake(async ({ Body: body }) => {
      if (typeof body.destroy === 'function') {
        // Ensure to drain eventual file streams, otherwise file remain locked and
        // on Windows they cannot be removed, resulting with homedir being dirty for next test runs
        await new Promise((resolve, reject) => {
          body.on('data', () => {});
          body.on('end', resolve);
          body.on('error', reject);
        });
      }
      return {};
    }),
  },
  STS: {
    getCallerIdentity: {
      ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
      UserId: 'XXXXXXXXXXXXXXXXXXXXX',
      Account: '999999999999',
      Arn: 'arn:aws:iam::999999999999:user/test',
    },
  },
});

describe('test/unit/lib/classes/console.test.js', () => {
  describe('enabled', () => {
    describe('deploy', () => {
      let serverless;
      let servicePath;
      let cfTemplate;
      let awsNaming;
      let uploadStub;
      let fetchStub;
      let otelIngenstionRequests;
      before(async () => {
        const awsRequestStubMap = createAwsRequestStubMap();
        uploadStub = awsRequestStubMap.S3.upload;
        ({ requests: otelIngenstionRequests, stub: fetchStub } = createFetchStub());

        ({
          serverless,
          cfTemplate,
          awsNaming,
          fixtureData: { servicePath },
        } = await runServerless({
          fixture: 'packaging',
          command: 'deploy',
          lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
          configExt: { console: true, org: 'testorg' },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
          awsRequestStubMap,
        }));
      });

      it('should setup needed environment variables on supported functions', () => {
        const fnVariablesList = [
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('fnService')].Properties.Environment
            .Variables,
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('fnIndividual')].Properties.Environment
            .Variables,
        ];
        for (const fnVariables of fnVariablesList) {
          expect(fnVariables).to.have.property('SLS_OTEL_REPORT_REQUEST_HEADERS');
          expect(fnVariables).to.have.property('SLS_OTEL_REPORT_METRICS_URL');
          expect(fnVariables).to.have.property('SLS_OTEL_REPORT_LOGS_URL');
          expect(fnVariables).to.have.property('AWS_LAMBDA_EXEC_WRAPPER');
        }

        const notSupportedFnVariables = _.get(
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('fnGo')].Properties,
          'Environment.Variables',
          {}
        );
        expect(notSupportedFnVariables).to.not.have.property('SLS_OTEL_REPORT_REQUEST_HEADERS');
        expect(notSupportedFnVariables).to.not.have.property('SLS_OTEL_REPORT_METRICS_URL');
        expect(notSupportedFnVariables).to.not.have.property('AWS_LAMBDA_EXEC_WRAPPER');
      });

      it('should reflect default userSettings', () => {
        const userSettingsString =
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('fnService')].Properties.Environment
            .Variables.SLS_OTEL_USER_SETTINGS;
        if (!userSettingsString) return;
        expect(JSON.parse(userSettingsString)).to.deep.equal({});
      });

      it('should package extension layer', async () => {
        expect(cfTemplate.Resources).to.have.property(
          awsNaming.getConsoleExtensionLayerLogicalId()
        );
        await fsp.access(
          path.resolve(
            servicePath,
            '.serverless',
            await serverless.console.deferredExtensionLayerBasename
          )
        );
      });

      it('should upload extension layer to S3', async () => {
        const consoleExtensionLayerBasename = await serverless.console
          .deferredExtensionLayerBasename;
        log.debug(
          'layer basename: %s, s3Keys: %o',
          consoleExtensionLayerBasename,
          uploadStub.args.map(([{ Key: s3Key }]) => s3Key)
        );
        const uploadArgs = uploadStub.args.find(([{ Key: s3Key }]) =>
          s3Key.endsWith(consoleExtensionLayerBasename)
        )[0];
        // Confirm that Bucket is properly resolved in outer `uploadZipFile` method
        expect(typeof uploadArgs.Bucket).to.equal('string');
      });

      it('should activate otel ingestion token', () => {
        otelIngenstionRequests.includes('activate-token');
      });
    });

    describe('package', () => {
      let userSettings;
      before(async () => {
        const { stub: fetchStub } = createFetchStub();

        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            console: {
              disableLogsCollection: true,
              disableRequestResponseCollection: true,
            },
            org: 'testorg',
          },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
        });
        userSettings = JSON.parse(
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties.Environment
            .Variables.SLS_OTEL_USER_SETTINGS
        );
      });

      it('should propagate `disableLogsCollection`', () => {
        expect(userSettings.disableLogsMonitoring).to.be.true;
      });

      it('should propagate `disableRequestResponseCollection`', () => {
        expect(userSettings.disableRequestResponseMonitoring).to.be.true;
      });
    });

    describe('package with "provider.layers" configuration', () => {
      it('should setup console wihout errors', async () => {
        const fetchStub = createFetchStub().stub;
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function-layers',
          command: 'package',
          configExt: {
            console: true,
            org: 'testorg',
            layers: {
              extra1: { path: 'test-layer' },
              extra2: { path: 'test-layer' },
            },
            package: {
              individually: true,
            },
            provider: { layers: [{ Ref: 'Extra1LambdaLayer' }, { Ref: 'Extra2LambdaLayer' }] },
            functions: { layerFunc: { layers: null }, capitalLayerFunc: { layers: null } },
          },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
          awsRequestStubMap: createAwsRequestStubMap(),
          env: { SLS_ORG_TOKEN: 'dummy' },
        });

        const configuredLayers =
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('layerFunc')].Properties.Layers;
        expect(
          configuredLayers.some(
            ({ Ref: logicalId }) => logicalId === awsNaming.getConsoleExtensionLayerLogicalId()
          )
        ).to.be.true;
      });
    });

    describe('disable logs collection', () => {
      it('should not setup report logs url', async () => {
        const fetchStub = createFetchStub().stub;
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            console: { disableLogsCollection: true },
            org: 'testorg',
          },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
          awsRequestStubMap: createAwsRequestStubMap(),
          env: { SLS_ORG_TOKEN: 'dummy' },
        });

        const fnVariables =
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties.Environment
            .Variables;
        expect(fnVariables).to.have.property('SLS_OTEL_REPORT_REQUEST_HEADERS');
        expect(fnVariables).to.not.have.property('SLS_OTEL_REPORT_LOGS_URL');
        expect(fnVariables).to.have.property('AWS_LAMBDA_EXEC_WRAPPER');
      });
    });

    describe('package for custom deployment bucket', () => {
      let cfTemplate;
      let awsNaming;
      before(async () => {
        const { stub: fetchStub } = createFetchStub();

        ({ cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: { console: true, org: 'testorg', provider: { deploymentBucket: 'custom' } },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
        }));
      });

      it('should not reference default deployment bucket anywhere', () => {
        expect(JSON.stringify(cfTemplate.Resources)).to.not.contain('ServerlessDeploymentBucket');
      });
      it('should reference custom S3 bucket at layer version', () => {
        expect(
          cfTemplate.Resources[awsNaming.getConsoleExtensionLayerLogicalId()].Properties.Content
            .S3Bucket
        ).to.equal('custom');
      });
    });
  });

  describe('deploy --package', () => {
    let consolePackage;
    let consoleDeploy;
    let servicePath;
    let uploadStub;
    let fetchStub;
    let otelIngenstionRequests;
    before(async () => {
      ({ requests: otelIngenstionRequests, stub: fetchStub } = createFetchStub());

      ({
        serverless: { console: consolePackage },
        fixtureData: { servicePath },
      } = await runServerless({
        fixture: 'function',
        command: 'package',
        options: { package: 'package-dir' },
        configExt: { console: true, org: 'testorg' },
        env: { SLS_ORG_TOKEN: 'dummy' },
        modulesCacheStub: {
          [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
          [require.resolve('node-fetch')]: fetchStub,
        },
      }));

      const awsRequestStubMap = createAwsRequestStubMap();
      uploadStub = awsRequestStubMap.S3.upload;

      ({
        serverless: { console: consoleDeploy },
      } = await runServerless({
        cwd: servicePath,
        command: 'deploy',
        lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
        options: { package: 'package-dir' },
        configExt: { console: true, org: 'testorg' },
        env: { SLS_ORG_TOKEN: 'dummy' },
        modulesCacheStub: {
          [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
          [require.resolve('node-fetch')]: fetchStub,
        },
        awsRequestStubMap,
      }));
    });

    it('should use service id as stored in the state', () => {
      expect(consoleDeploy.serviceId).to.equal(consolePackage.serviceId);
    });

    it('should upload extension layer to S3', async () => {
      const extensionLayerFilename = await consoleDeploy.deferredExtensionLayerBasename;
      expect(uploadStub.args.some(([{ Key: s3Key }]) => s3Key.endsWith(extensionLayerFilename))).to
        .be.true;
    });

    it('should activate otel ingestion token', () => {
      otelIngenstionRequests.includes('activate-token');
    });
  });

  describe('deploy function', () => {
    let serverless;
    let uploadStub;
    let updateFunctionStub;
    let publishLayerStub;
    let fetchStub;
    let otelIngenstionRequests;
    before(async () => {
      updateFunctionStub = sinon.stub().resolves({});
      publishLayerStub = sinon.stub().resolves({});
      const awsRequestStubMap = createAwsRequestStubMap();
      uploadStub = awsRequestStubMap.S3.upload;
      let isFirstLayerVersionsQuery = true;
      ({ requests: otelIngenstionRequests, stub: fetchStub } = createFetchStub());

      ({ serverless } = await runServerless({
        fixture: 'function',
        command: 'deploy function',
        options: { function: 'basic' },
        configExt: { console: true, org: 'testorg' },
        env: { SLS_ORG_TOKEN: 'dummy' },
        modulesCacheStub: {
          [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
          [require.resolve('node-fetch')]: fetchStub,
        },
        awsRequestStubMap: {
          ...awsRequestStubMap,
          Lambda: {
            getFunction: { Configuration: { State: 'Active', LastUpdateStatus: 'Successful' } },
            listLayerVersions() {
              if (isFirstLayerVersionsQuery) {
                isFirstLayerVersionsQuery = false;
                return { LayerVersions: [] };
              }
              return { LayerVersions: [{ LayerVersionArn: 'extension-arn' }] };
            },
            publishLayerVersion: publishLayerStub,
            updateFunctionConfiguration: updateFunctionStub,
            updateFunctionCode: {},
          },
        },
      }));
    });

    it('should setup needed environment variables', () => {
      const fnVariables = updateFunctionStub.args[0][0].Environment.Variables;
      expect(fnVariables).to.have.property('SLS_OTEL_REPORT_REQUEST_HEADERS');
      expect(fnVariables).to.have.property('SLS_OTEL_REPORT_METRICS_URL');
      expect(fnVariables).to.have.property('AWS_LAMBDA_EXEC_WRAPPER');
    });

    it('should upload extension layer to S3', async () => {
      const extensionLayerFilename = await serverless.console.deferredExtensionLayerBasename;
      expect(uploadStub.args.some(([{ Key: s3Key }]) => s3Key.endsWith(extensionLayerFilename))).to
        .be.true;
    });

    it('should activate otel ingestion token', () => {
      otelIngenstionRequests.includes('activate-token');
    });
  });

  describe('rollback', () => {
    let slsConsole;
    let fetchStub;
    let otelIngenstionRequests;
    before(async () => {
      const awsRequestStubMap = createAwsRequestStubMap();
      ({ requests: otelIngenstionRequests, stub: fetchStub } = createFetchStub());

      ({
        serverless: { console: slsConsole },
      } = await runServerless({
        fixture: 'function',
        command: 'rollback',
        options: { timestamp: '2020-05-20T15:31:44.359Z' },
        configExt: { console: true, org: 'testorg' },
        env: { SLS_ORG_TOKEN: 'dummy' },
        modulesCacheStub: {
          [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
          [require.resolve('node-fetch')]: fetchStub,
        },
        awsRequestStubMap: {
          ...awsRequestStubMap,
          S3: {
            ...awsRequestStubMap.S3,
            getObject: async ({ Key: s3Key }) => {
              if (s3Key.endsWith('/serverless-state.json')) {
                return {
                  Body: JSON.stringify({
                    console: {
                      schemaVersion: '1',
                      otelIngestionToken: 'rollback-token',
                      service: 'test-console',
                      stage: 'dev',
                      orgId: 'testorgid',
                    },
                  }),
                };
              }
              throw new Error(`Unexpected request: ${s3Key}`);
            },
          },
          CloudFormation: {
            ...awsRequestStubMap.CloudFormation,
            deleteChangeSet: {},
            createChangeSet: {},
            describeChangeSet: {
              Status: 'CREATE_COMPLETE',
            },
            executeChangeSet: {},
            describeStackEvents: {
              StackEvents: [
                {
                  EventId: '1',
                  ResourceType: 'AWS::CloudFormation::Stack',
                  ResourceStatus: 'UPDATE_COMPLETE',
                },
              ],
            },
          },
        },
        hooks: {
          beforeInstanceRun: (serverless) => {
            serviceName = serverless.service.service;
          },
        },
      }));
    });

    it('should resolve otel ingestion token from the state', async () => {
      expect(await slsConsole.deferredOtelIngestionToken).to.equal('rollback-token');
    });

    it('should activate otel ingestion token', () => {
      otelIngenstionRequests.includes('activate-token');
    });
  });

  describe('remove', () => {
    let otelIngenstionRequests;
    let fetchStub;
    before(async () => {
      const awsRequestStubMap = createAwsRequestStubMap();
      ({ requests: otelIngenstionRequests, stub: fetchStub } = createFetchStub());

      await runServerless({
        fixture: 'function',
        command: 'remove',
        configExt: { console: true, org: 'testorg' },
        env: { SLS_ORG_TOKEN: 'dummy' },
        modulesCacheStub: {
          [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
          [require.resolve('node-fetch')]: fetchStub,
        },
        awsRequestStubMap: {
          ...awsRequestStubMap,
          CloudFormation: {
            ...awsRequestStubMap.CloudFormation,
            deleteStack: {},
            describeStackEvents: {
              StackEvents: [
                {
                  EventId: '1',
                  ResourceType: 'AWS::CloudFormation::Stack',
                  ResourceStatus: 'DELETE_COMPLETE',
                },
              ],
            },
          },
          ECR: {
            async describeRepositories() {
              throw Object.assign(new Error('RepositoryNotFoundException'), {
                providerError: { code: 'RepositoryNotFoundException' },
              });
            },
          },
          S3: {
            ...awsRequestStubMap.S3,
            deleteObjects: {},
          },
        },
      });
    });

    it('should deactivate all ingestion tokens', () => {
      otelIngenstionRequests.includes('deactivate-all-token');
    });
  });

  describe('errors', () => {
    it('should abort when console enabled but not authenticated', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: { console: true, org: 'testorg' },
        })
      ).to.eventually.be.rejected.and.have.property('code', 'CONSOLE_NOT_AUTHENTICATED');
    });

    it('should abort when function has already maximum numbers of layers configured', async () => {
      const fetchStub = createFetchStub().stub;
      await expect(
        runServerless({
          fixture: 'function-layers',
          command: 'package',
          configExt: {
            console: true,
            org: 'testorg',
            layers: {
              extra1: { path: 'test-layer' },
              extra2: { path: 'test-layer' },
            },
            functions: {
              layerFuncWithConfig: {
                layers: [
                  { Ref: 'TestLayerLambdaLayer' },
                  { Ref: 'TestLayerWithCapitalsLambdaLayer' },
                  { Ref: 'TestLayerWithNoNameLambdaLayer' },
                  { Ref: 'Extra1LambdaLayer' },
                  { Ref: 'Extra2LambdaLayer' },
                ],
              },
            },
          },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
          awsRequestStubMap: createAwsRequestStubMap(),
          env: { SLS_ORG_TOKEN: 'dummy' },
        })
      ).to.eventually.be.rejected.and.have.property('code', 'TOO_MANY_LAYERS_TO_SETUP_CONSOLE');
    });

    it(
      'should throw integration error when attempting to deploy package, ' +
        'packaged with different console integration version',
      async () => {
        const fetchStub = createFetchStub().stub;
        const {
          fixtureData: { servicePath },
        } = await runServerless({
          fixture: 'function',
          command: 'package',
          options: { package: 'package-dir' },
          configExt: { console: true, org: 'testorg' },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
          awsRequestStubMap: createAwsRequestStubMap(),
        });
        const stateFilename = path.resolve(servicePath, 'package-dir', 'serverless-state.json');
        const state = JSON.parse(await fsp.readFile(stateFilename, 'utf-8'));
        state.console.schemaVersion = 'other';
        await fsp.writeFile(stateFilename, JSON.stringify(state));
        await expect(
          runServerless({
            cwd: servicePath,
            command: 'deploy',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { package: 'package-dir' },
            configExt: { console: true, org: 'testorg' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: createAwsRequestStubMap(),
          })
        ).to.eventually.be.rejected.and.have.property('code', 'CONSOLE_INTEGRATION_MISMATCH');
      }
    );
    it(
      'should throw mismatch error when attempting to deploy package, ' +
        'packaged with different org',
      async () => {
        const fetchStub = createFetchStub().stub;
        const {
          fixtureData: { servicePath, updateConfig },
        } = await runServerless({
          fixture: 'function',
          command: 'package',
          options: { package: 'package-dir' },
          configExt: { console: true, org: 'other' },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
        });

        await updateConfig({ org: 'testorg' });

        await expect(
          runServerless({
            cwd: servicePath,
            command: 'deploy',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { package: 'package-dir' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: createAwsRequestStubMap(),
          })
        ).to.eventually.be.rejected.and.have.property('code', 'CONSOLE_ORG_MISMATCH');
      }
    );
    it(
      'should throw mismatch error when attempting to deploy package, ' +
        'packaged with different region',
      async () => {
        const fetchStub = createFetchStub().stub;
        const {
          fixtureData: { servicePath, updateConfig },
        } = await runServerless({
          fixture: 'function',
          command: 'package',
          options: { package: 'package-dir' },
          configExt: { console: true, org: 'testorg' },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
        });

        await updateConfig({ provider: { region: 'us-east-2' } });

        await expect(
          runServerless({
            cwd: servicePath,
            command: 'deploy',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { package: 'package-dir' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: createAwsRequestStubMap(),
          })
        ).to.eventually.be.rejected.and.have.property('code', 'CONSOLE_REGION_MISMATCH');
      }
    );
    it(
      'should throw activation mismatch error when attempting to deploy with ' +
        'console integration off, but packaged with console integration on',
      async () => {
        const fetchStub = createFetchStub().stub;
        const {
          fixtureData: { servicePath, updateConfig },
        } = await runServerless({
          fixture: 'function',
          command: 'package',
          options: { package: 'package-dir' },
          configExt: { console: true, org: 'testorg' },
          env: { SLS_ORG_TOKEN: 'dummy' },
          modulesCacheStub: {
            [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
            [require.resolve('node-fetch')]: fetchStub,
          },
        });
        const stateFilename = path.resolve(servicePath, 'package-dir', 'serverless-state.json');
        const state = JSON.parse(await fsp.readFile(stateFilename, 'utf-8'));
        state.console.orgId = 'other';
        await fsp.writeFile(stateFilename, JSON.stringify(state));
        await updateConfig({ org: null, console: null });
        await expect(
          runServerless({
            cwd: servicePath,
            command: 'deploy',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { package: 'package-dir' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: createAwsRequestStubMap(),
          })
        ).to.eventually.be.rejected.and.have.property('code', 'CONSOLE_ACTIVATION_MISMATCH');
      }
    );

    it(
      'should throw integration error when attempting to rollback deployment, ' +
        'to one deployed with different console integration version',
      async () => {
        const fetchStub = createFetchStub().stub;
        const awsRequestStubMap = createAwsRequestStubMap();
        await expect(
          runServerless({
            fixture: 'function',
            command: 'rollback',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { timestamp: '2020-05-20T15:31:44.359Z' },
            configExt: { console: true, org: 'testorg' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: {
              ...awsRequestStubMap,
              S3: {
                ...awsRequestStubMap.S3,
                getObject: async ({ Key: s3Key }) => {
                  if (s3Key.endsWith('/serverless-state.json')) {
                    return {
                      Body: JSON.stringify({
                        console: {
                          schemaVersion: '2',
                          otelIngestionToken: 'rollback-token',
                          service: 'test-console',
                          stage: 'dev',
                          orgId: 'testorgid',
                        },
                      }),
                    };
                  }
                  throw new Error(`Unexpected request: ${s3Key}`);
                },
              },
              CloudFormation: {
                ...awsRequestStubMap.CloudFormation,
                deleteChangeSet: {},
                createChangeSet: {},
                describeChangeSet: {
                  Status: 'CREATE_COMPLETE',
                },
                executeChangeSet: {},
                describeStackEvents: {
                  StackEvents: [
                    {
                      EventId: '1',
                      ResourceType: 'AWS::CloudFormation::Stack',
                      ResourceStatus: 'UPDATE_COMPLETE',
                    },
                  ],
                },
              },
            },
            hooks: {
              beforeInstanceRun: (serverless) => {
                serviceName = serverless.service.service;
              },
            },
          })
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'CONSOLE_INTEGRATION_MISMATCH_ROLLBACK'
        );
      }
    );
    it(
      'should throw integration error when attempting to rollback deployment, ' +
        'to one deployed with different org',
      async () => {
        const fetchStub = createFetchStub().stub;
        const awsRequestStubMap = createAwsRequestStubMap();
        await expect(
          runServerless({
            fixture: 'function',
            command: 'rollback',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { timestamp: '2020-05-20T15:31:44.359Z' },
            configExt: { console: true, org: 'testorg' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: {
              ...awsRequestStubMap,
              S3: {
                ...awsRequestStubMap.S3,
                getObject: async ({ Key: s3Key }) => {
                  if (s3Key.endsWith('/serverless-state.json')) {
                    return {
                      Body: JSON.stringify({
                        console: {
                          schemaVersion: '1',
                          otelIngestionToken: 'rollback-token',
                          service: 'test-console',
                          stage: 'dev',
                          orgId: 'othertestorgid',
                        },
                      }),
                    };
                  }
                  throw new Error(`Unexpected request: ${s3Key}`);
                },
              },
              CloudFormation: {
                ...awsRequestStubMap.CloudFormation,
                deleteChangeSet: {},
                createChangeSet: {},
                describeChangeSet: {
                  Status: 'CREATE_COMPLETE',
                },
                executeChangeSet: {},
                describeStackEvents: {
                  StackEvents: [
                    {
                      EventId: '1',
                      ResourceType: 'AWS::CloudFormation::Stack',
                      ResourceStatus: 'UPDATE_COMPLETE',
                    },
                  ],
                },
              },
            },
            hooks: {
              beforeInstanceRun: (serverless) => {
                serviceName = serverless.service.service;
              },
            },
          })
        ).to.eventually.be.rejected.and.have.property('code', 'CONSOLE_ORG_MISMATCH_ROLLBACK');
      }
    );

    it(
      'should throw integration error when attempting to rollback deployment, ' +
        'deployed with console, while having console disabled',
      async () => {
        const fetchStub = createFetchStub().stub;
        const awsRequestStubMap = createAwsRequestStubMap();
        await expect(
          runServerless({
            fixture: 'function',
            command: 'rollback',
            lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
            options: { timestamp: '2020-05-20T15:31:44.359Z' },
            env: { SLS_ORG_TOKEN: 'dummy' },
            modulesCacheStub: {
              [require.resolve('@serverless/utils/api-request')]: createApiStub().stub,
              [require.resolve('node-fetch')]: fetchStub,
            },
            awsRequestStubMap: {
              ...awsRequestStubMap,
              S3: {
                ...awsRequestStubMap.S3,
                getObject: async ({ Key: s3Key }) => {
                  if (s3Key.endsWith('/serverless-state.json')) {
                    return {
                      Body: JSON.stringify({
                        console: {
                          schemaVersion: '1',
                          otelIngestionToken: 'rollback-token',
                          service: 'test-console',
                          stage: 'dev',
                          orgId: 'othertestorgid',
                        },
                      }),
                    };
                  }
                  throw new Error(`Unexpected request: ${s3Key}`);
                },
              },
              CloudFormation: {
                ...awsRequestStubMap.CloudFormation,
                deleteChangeSet: {},
                createChangeSet: {},
                describeChangeSet: {
                  Status: 'CREATE_COMPLETE',
                },
                executeChangeSet: {},
                describeStackEvents: {
                  StackEvents: [
                    {
                      EventId: '1',
                      ResourceType: 'AWS::CloudFormation::Stack',
                      ResourceStatus: 'UPDATE_COMPLETE',
                    },
                  ],
                },
              },
            },
            hooks: {
              beforeInstanceRun: (serverless) => {
                serviceName = serverless.service.service;
              },
            },
          })
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'CONSOLE_ACTIVATION_MISMATCH_ROLLBACK'
        );
      }
    );
  });

  describe('disabled', () => {
    it('should not enable console when no `console: true`', async () => {
      const { serverless } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: { org: 'testorg' },
      });
      expect(serverless.console.isEnabled).to.be.false;
    });
    it('should not enable console when not supported command', async () => {
      const { serverless } = await runServerless({
        fixture: 'function',
        command: 'print',
        configExt: { console: true, org: 'testorg' },
      });
      expect(serverless.console.isEnabled).to.be.false;
    });
    it('should not enable when no supported functions', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'package',
        configExt: { console: true, org: 'testorg' },
      });
      expect(serverless.console.isEnabled).to.be.false;
    });
  });
});
