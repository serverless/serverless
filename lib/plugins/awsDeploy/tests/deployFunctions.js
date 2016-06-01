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

  const rawFunctionObjectsMock = {
    name_template: 'name-template-name',
    first: {
      handler: 'first.function.handler',
    },
    second: {
      handler: 'second.function.handler',
    },
  };

  const simpleDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'function.handler',
    },
  ];

  const nestedDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'nested/function.handler',
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

  describe('#validateForDeployFunctions', () => {
    it('should throw an error if the service name is not set', () => {
      awsDeployMock.serverless.service.service = '';
      expect(() => awsDeployMock.validateForDeployFunctions().to.throw(Error));
    });

    it('should throw an error if the region is not set', () => {
      awsDeployMock.options.region = '';
      expect(() => awsDeployMock.validateForDeployFunctions().to.throw(Error));
    });
  });

  describe('#extractHandlers()', () => {
    it('should extract all the handlers in the function definitions', () => {
      serverless.service.functions = rawFunctionObjectsMock;

      return awsDeployMock.extractFunctionHandlers().then(() => {
        expect(
          awsDeployMock.deployedFunctions[0].handler
        ).to.equal(rawFunctionObjectsMock.first.handler);
        expect(
          awsDeployMock.deployedFunctions[1].handler
        ).to.equal(rawFunctionObjectsMock.second.handler);
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
  });

  describe('#uploadZipFilesToS3Bucket()', () => {
    it('should upload the zip files to the S3 bucket');
  });
});
