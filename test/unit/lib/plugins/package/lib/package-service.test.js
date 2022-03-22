'use strict';

const path = require('path');
const fsp = require('fs').promises;
const chai = require('chai');
const sinon = require('sinon');
const { listFileProperties, listZipFiles } = require('../../../../../utils/fs');
const runServerless = require('../../../../../utils/run-serverless');
const fixtures = require('../../../../../fixtures/programmatic');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('test/unit/lib/plugins/package/lib/packageService.test.js', () => {
  const awsRequestStubMap = {
    S3: {
      headBucket: {},
    },
    CloudFormation: {
      describeStacks: {
        Stacks: [
          {
            Outputs: [
              { OutputKey: 'LayerLambdaLayerHash', OutputValue: '123' },
              { OutputKey: 'LayerLambdaLayerS3Key', OutputValue: 'path/to/layer.zip' },
            ],
          },
        ],
      },
    },
  };

  describe('service wide', () => {
    let serverless;
    let serviceZippedFiles;
    let fnIndividualZippedFiles;
    let fnFileProperties;
    let fnLayerFiles;

    before(async () => {
      const {
        fixtureData: {
          servicePath: serviceDir,
          serviceConfig: { service: serviceName },
        },
        serverless: serverlessInstance,
      } = await runServerless({
        fixture: 'packaging',
        command: 'package',
        awsRequestStubMap,
        configExt: {
          package: {
            patterns: [
              '!dir1/**',
              'dir1/subdir3/**',
              'dir1/subdir2/**',
              '!dir1/subdir2/subsubdir1',
            ],
          },
          functions: {
            fnIndividual: {
              package: { patterns: ['dir1/subdir4/**', '!dir3/**'] },
            },
          },
        },
      });
      serverless = serverlessInstance;

      serviceZippedFiles = await listZipFiles(
        path.join(serviceDir, '.serverless', `${serviceName}.zip`)
      );

      fnIndividualZippedFiles = await listZipFiles(
        path.join(serviceDir, '.serverless', 'fnIndividual.zip')
      );

      fnLayerFiles = await listZipFiles(path.join(serviceDir, '.serverless', 'layer.zip'));

      fnFileProperties = await listFileProperties(
        path.join(serviceDir, '.serverless', 'fnIndividual.zip')
      );
    });

    it('should exclude defaults', () => {
      expect(serviceZippedFiles).to.not.include('.gitignore');
    });

    it('should exclude service config', () => {
      expect(serviceZippedFiles).to.not.include('serverless.yml');
    });

    it('should exclude default plugins localPath', () => {
      expect(serviceZippedFiles).to.not.include('.serverless-plugins/index.js');
    });

    it('should support `package.exclude`', () => {
      expect(serviceZippedFiles, fnIndividualZippedFiles).to.not.include('dir1/subdir1/index.js');
      expect(serviceZippedFiles, fnIndividualZippedFiles).to.include('dir1/subdir3/index.js');
    });

    it('should support `package.include`', () => {
      expect(serviceZippedFiles, fnIndividualZippedFiles).to.include('dir1/subdir2/index.js');
      expect(serviceZippedFiles, fnIndividualZippedFiles).to.not.include(
        'dir1/subdir2/subsubdir1/index.js'
      );
      expect(serviceZippedFiles, fnIndividualZippedFiles).to.include(
        'dir1/subdir2/subsubdir2/index.js'
      );
    });

    it('should support `functions[].package.individually`', () => {
      expect(serverless.service.getFunction('fnIndividual').package.artifact).to.include(
        'fnIndividual.zip'
      );
    });

    it('should support `functions[].package.exclude`', () => {
      expect(fnIndividualZippedFiles).to.not.include('dir3/index.js');
    });

    it('should support `functions[].package.include`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir4/index.js');
    });

    (process.platform === 'win32' ? it : it.skip)(
      'should mark go runtime handler files as executable on windows',
      () => {
        expect(fnFileProperties['main.go'].unixPermissions).to.equal(Math.pow(2, 15) + 0o755);
      }
    );

    it('should package layer', () => {
      expect(fnLayerFiles).to.include('layer-module-1.js');
      expect(fnLayerFiles).to.include('layer-module-2.js');
    });
  });

  describe('with useDotenv', () => {
    it('should exclude .env files', async () => {
      const {
        fixtureData: {
          servicePath: serviceDir,
          serviceConfig: { service: serviceName },
        },
      } = await runServerless({
        fixture: 'packaging',
        command: 'package',
        awsRequestStubMap,
        configExt: {
          useDotenv: true,
        },
      });

      const zippedFiles = await listZipFiles(
        path.join(serviceDir, '.serverless', `${serviceName}.zip`)
      );

      expect(zippedFiles).to.not.include('.env');
      expect(zippedFiles).to.not.include('.env.stage');
    });
  });

  describe('individually', () => {
    let fnIndividualZippedFiles;
    let serverless;

    before(async () => {
      const {
        fixtureData: { servicePath: serviceDir },
        serverless: serverlessInstance,
      } = await runServerless({
        fixture: 'packaging',
        command: 'package',
        awsRequestStubMap,
        configExt: {
          package: {
            individually: true,
            patterns: [
              '!dir1/**',
              'dir1/subdir3/**',
              'dir1/subdir2/**',
              '!dir1/subdir2/subsubdir1',
            ],
          },
          functions: {
            fnIndividual: {
              package: { patterns: ['dir1/subdir4/**', '!dir3/**'] },
            },
          },
          plugins: {
            localPath: './custom-plugins',
            modules: ['index'],
          },
        },
      });
      serverless = serverlessInstance;

      fnIndividualZippedFiles = await listZipFiles(
        path.join(serviceDir, '.serverless', 'fnIndividual.zip')
      );
    });

    it('should exclude custom plugins localPath', () => {
      expect(fnIndividualZippedFiles).to.not.include('.custom-plugins/index.js');
    });

    it('should support `package.individually`', () => {
      expect(serverless.service.getFunction('fnIndividual').package.artifact).to.include(
        'fnIndividual.zip'
      );
      expect(serverless.service.getFunction('fnService').package.artifact).to.include(
        'fnService.zip'
      );
    });

    it('should support `package.exclude`', () => {
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir1/index.js');
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir1/index.js');
      expect(fnIndividualZippedFiles).to.include('dir1/subdir3/index.js');
    });

    it('should support `package.include`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/index.js');
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir2/subsubdir1/index.js');
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/subsubdir2/index.js');
      expect(fnIndividualZippedFiles).to.include('dir1/subdir4/index.js');
    });
  });

  describe('pre-prepared artifact', () => {
    let serverless;
    before(async () => {
      const { serverless: serverlessInstance } = await runServerless({
        fixture: 'packaging',
        command: 'package',
        awsRequestStubMap,
        configExt: {
          package: {
            artifact: 'artifact.zip',
            patterns: ['!dir1', 'dir1/subdir3/**', 'dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: { individually: true, patterns: ['dir1/subdir3/**', '!dir1/subdir2'] },
            },
            fnArtifact: {
              handler: 'index.handler',
              package: { artifact: 'artifact-function.zip' },
            },
          },
        },
      });
      serverless = serverlessInstance;
    });
    it('should support `package.artifact`', () => {
      expect(serverless.service.package.artifact).is.equal('artifact.zip');
    });

    it('should ignore `package.artifact` if `functions[].package.individually', () => {
      expect(serverless.service.getFunction('fnIndividual').package.artifact).is.not.equal(
        serverless.service.package.artifact
      );
    });

    it('should support `functions[].package.artifact`', () => {
      expect(serverless.service.getFunction('fnArtifact').package.artifact).is.equal(
        'artifact-function.zip'
      );
    });
  });

  describe('pre-prepared artifact with absolute artifact path', () => {
    describe('while deploying whole service', () => {
      const s3UploadStub = sinon.stub();
      const innerAwsRequestStubMap = {
        Lambda: {
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
            },
          },
        },
        S3: {
          upload: s3UploadStub,
          listObjectsV2: { Contents: [] },
          headBucket: {},
        },
        CloudFormation: {
          describeStacks: {},
          describeStackResource: { StackResourceDetail: { PhysicalResourceId: 'resource-id' } },
        },
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '999999999999',
            Arn: 'arn:aws:iam::999999999999:user/test',
          },
        },
      };

      beforeEach(() => {
        s3UploadStub.resetHistory();
      });

      it('for function', async () => {
        const { servicePath: serviceDir, updateConfig } = await fixtures.setup('package-artifact');
        const absoluteArtifactFilePath = path.join(serviceDir, 'absolute-artifact.zip');

        await updateConfig({
          functions: {
            other: {
              package: {
                artifact: absoluteArtifactFilePath,
              },
            },
          },
        });

        await runServerless({
          cwd: serviceDir,
          command: 'deploy',
          lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
          awsRequestStubMap: innerAwsRequestStubMap,
        });

        const callArgs = s3UploadStub.args.find((item) =>
          item[0].Key.endsWith('absolute-artifact.zip')
        );
        expect(callArgs[0].Body.path).to.equal(absoluteArtifactFilePath);
      });

      it('service-wide', async () => {
        const { servicePath: serviceDir, updateConfig } = await fixtures.setup('package-artifact');
        const absoluteArtifactFilePath = path.join(serviceDir, 'absolute-artifact.zip');

        await updateConfig({
          package: {
            artifact: absoluteArtifactFilePath,
          },
        });
        await runServerless({
          cwd: serviceDir,
          command: 'deploy',
          lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
          awsRequestStubMap: innerAwsRequestStubMap,
        });

        const callArgs = s3UploadStub.args.find((item) =>
          item[0].Key.endsWith('absolute-artifact.zip')
        );
        expect(callArgs[0].Body.path).to.equal(absoluteArtifactFilePath);
      });
    });

    describe('while deploying specific function', () => {
      const updateFunctionCodeStub = sinon.stub();
      const innerAwsRequestStubMap = {
        Lambda: {
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              State: 'Active',
              LastUpdateStatus: 'Successful',
            },
          },
          updateFunctionCode: updateFunctionCodeStub,
          updateFunctionConfiguration: {},
        },
      };

      beforeEach(() => {
        updateFunctionCodeStub.resetHistory();
      });

      it('for function', async () => {
        const { servicePath: serviceDir, updateConfig } = await fixtures.setup('package-artifact');
        const absoluteArtifactFilePath = path.join(serviceDir, 'absolute-artifact.zip');
        const zipContent = await fsp.readFile(absoluteArtifactFilePath);

        await updateConfig({
          functions: {
            other: {
              package: {
                artifact: absoluteArtifactFilePath,
              },
            },
          },
        });
        await runServerless({
          cwd: serviceDir,
          command: 'deploy function',
          options: { function: 'other' },
          awsRequestStubMap: innerAwsRequestStubMap,
        });
        expect(updateFunctionCodeStub).to.have.been.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ZipFile).to.deep.equal(Buffer.from(zipContent));
      });

      it('service-wide', async () => {
        const { servicePath: serviceDir, updateConfig } = await fixtures.setup('package-artifact');
        const absoluteArtifactFilePath = path.join(serviceDir, 'absolute-artifact.zip');
        const zipContent = await fsp.readFile(absoluteArtifactFilePath);

        await updateConfig({
          package: {
            artifact: absoluteArtifactFilePath,
          },
        });
        await runServerless({
          cwd: serviceDir,
          command: 'deploy function',
          options: { function: 'foo' },
          awsRequestStubMap: innerAwsRequestStubMap,
        });
        expect(updateFunctionCodeStub).to.have.been.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ZipFile).to.deep.equal(Buffer.from(zipContent));
      });
    });
  });
});
