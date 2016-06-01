'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const deployFunctions = require('../lib/deployFunctions');
const Serverless = require('../../../Serverless');
const Zip = require('node-zip');
const sinon = require('sinon');
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');

describe('deployFunctions', () => {
  let serverless;
  let awsDeployMock;
  let zip;

  class AwsDeployMock {
    constructor(serverless) {
      Object.assign(this, deployFunctions);
      this.serverless = serverless;
      this.options = {};
      this.deployedFunctions = [];
    }
  }

  const functionsObjectMock = {
    name_template: 'name-template-name',
    first: {
      handler: 'first.function.handler',
      exclude: [
        'foo',
        'bar.js',
      ],
    },
    second: {
      handler: 'second.function.handler',
      exclude: [
        'baz',
        'qux.js',
      ],
    },
  };

  const simpleDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'function.handler',
      exclude: [
        'foo',
        'bar.js',
      ],
    },
  ];

  const nestedDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'nested/function.handler',
      exclude: [
        'foo',
        'bar.js',
      ],
    },
  ];

  const functionCodeMock = `
    'use strict';

    module.exports.handler = function(event, context, cb) {
      return cb(null, {
        message: 'First function'
      });
    };
  `;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    awsDeployMock = new AwsDeployMock(serverless);
    zip = new Zip();
  });

  describe('#extractHandlers()', () => {
    beforeEach(() => {
      serverless.service.functions = functionsObjectMock;
    });

    it('should extract all the handlers in the function definitions', () => {
      return awsDeployMock.extractFunctionHandlers().then(() => {
        expect(
          awsDeployMock.deployedFunctions[0].handler
        ).to.equal(functionsObjectMock.first.handler);
        expect(
          awsDeployMock.deployedFunctions[1].handler
        ).to.equal(functionsObjectMock.second.handler);
      });
    });

    it('should extract the excludes array in the function definitions', () => {
      return awsDeployMock.extractFunctionHandlers().then(() => {
        expect(
          awsDeployMock.deployedFunctions[0].exclude
        ).to.include('foo');
        expect(
          awsDeployMock.deployedFunctions[0].exclude
        ).to.include('bar.js');

        expect(
          awsDeployMock.deployedFunctions[1].exclude
        ).to.include('baz');
        expect(
          awsDeployMock.deployedFunctions[1].exclude
        ).to.include('qux.js');
      });
    });
  });

  describe('#zipFunctions()', () => {
    it('should zip a simple function', () => {
      awsDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {
        expect(awsDeployMock.deployedFunctions[0].zipFileData).to.be.not.empty;

        expect(awsDeployMock.deployedFunctions[0].zipFileKey)
          .to.equal(`${functionFileNameBase}.zip`);

        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);
      });
    });

    it('should zip nested code', () => {
      // set the deployedFunctions array
      awsDeployMock.deployedFunctions = nestedDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory --> nested/function.js
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'nested');
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);

      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // add a lib directory on the same level where the "nested" directory lives --> lib/some-file
      const libDirectory = path.join(tmpDirPath, '..', 'lib');
      serverless.utils.writeFileSync(path.join(libDirectory, 'some-file'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {
        expect(awsDeployMock.deployedFunctions[0].zipFileData).to.be.not.empty;

        expect(awsDeployMock.deployedFunctions[0].zipFileKey)
          .to.equal(`${functionFileNameBase}.zip`);

        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`nested/${functionFileNameBase}.js`].name)
          .to.equal(`nested/${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`nested/${functionFileNameBase}.js`].dir)
          .to.equal(false);

        expect(unzippedFileData.files['lib/some-file'].name)
          .to.equal('lib/some-file');
        expect(unzippedFileData.files['lib/some-file'].dir)
          .to.equal(false);
      });
    });

    it('should exclude defined files and folders', () => {
      awsDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a folder with the name "foo" which also includes a file --> foo/baz.txt
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'foo', 'baz.txt'), 'content');

      // create a file with the name "bar.js" --> bar.js
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'bar.js'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['foo/baz.txt']).to.equal(undefined);
        expect(unzippedFileData.files['bar.js']).to.equal(undefined);
      });
    });

    it('should exclude predefined files and folders (e.g. like .git)', () => {
      awsDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create the files and folder which should be ignored
      // .gitignore
      const gitignoreFilePath = path.join(tmpDirPath, '.gitignore');
      serverless.utils.writeFileSync(gitignoreFilePath, 'content');

      // .DS_Store
      const dsStoreFilePath = path.join(tmpDirPath, '.DS_Store');
      serverless.utils.writeFileSync(dsStoreFilePath, 'content');

      // serverless.yaml
      const serverlessYamlFilePath = path.join(tmpDirPath, 'serverless.yaml');
      serverless.utils.writeFileSync(serverlessYamlFilePath, 'content');

      // serverless.env.yaml
      const serverlessEnvYamlFilePath = path.join(tmpDirPath, 'serverless.env.yaml');
      serverless.utils.writeFileSync(serverlessEnvYamlFilePath, 'content');

      const gitFilePath = path.join(path.join(tmpDirPath, '.git'), 'some-random-git-file');
      serverless.utils.writeFileSync(gitFilePath, 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['.gitignore']).to.equal(undefined);
        expect(unzippedFileData.files['.DS_Store']).to.equal(undefined);
        expect(unzippedFileData.files['.serverless.yaml']).to.equal(undefined);
        expect(unzippedFileData.files['.serverless.env.yaml']).to.equal(undefined);
        expect(unzippedFileData.files['.git']).to.equal(undefined);
      });
    });
  });

  describe('#uploadZipFilesToS3Bucket()', () => {
    it('should upload the zip files to the S3 bucket', () => {
      awsDeployMock.deployedFunctions = [
        {
          zipFileKey: true,
          zipFileData: true,
        },
      ];

      awsDeployMock.S3 = new AWS.S3();
      BbPromise.promisifyAll(awsDeployMock.S3, { suffix: 'Promised' });

      const putObjectStub = sinon.stub(awsDeployMock.S3, 'putObjectPromised');

      return awsDeployMock.uploadZipFilesToS3Bucket().then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
      });
    });
  });
});
