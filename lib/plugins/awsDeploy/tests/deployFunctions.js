'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const deployFunctions = require('../lib/deployFunctions');
const Serverless = require('../../../Serverless');

describe('deployFunctions', () => {
  let serverless;
  let awsDeployMock;

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
        expect(awsDeployMock.deployedFunctions[0].zipFileData)
          .to.be.not.empty;
        expect(awsDeployMock.deployedFunctions[0].zipFileKey)
          .to.equal(`${functionFileNameBase}.zip`);
      });
    });

    it('should zip nested code', () => {
      // set the deployedFunctions array
      awsDeployMock.deployedFunctions = nestedDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'nested');
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);

      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // add a lib directory on the same level where the "nested" directory lives
      const libDirectory = path.join(tmpDirPath, '..', 'lib');
      serverless.utils.writeFileSync(path.join(libDirectory, 'some-file'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {
        expect(awsDeployMock.deployedFunctions[0].zipFileData)
          .to.be.not.empty;
        expect(awsDeployMock.deployedFunctions[0].zipFileKey)
          .to.equal(`${functionFileNameBase}.zip`);
      });
    });

    xit('should exclude defined files and folders', () => {
      awsDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a folder with the name "foo" which also includes a file
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'foo', 'baz.txt'), 'content');

      // create a file with the name "bar.js"
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'bar.js'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {});
    });
  });

  describe('#uploadZipFilesToS3Bucket()', () => {
    it('should upload the zip files to the S3 bucket');
  });
});
