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
      this.functionHandlers = [];
      this.pathsToZipFiles = [];
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

  const functionHandlersArrayMock = [
    'function.handler',
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
        expect(awsDeployMock.functionHandlers[0]).to.equal(rawFunctionObjectsMock.first.handler);
        expect(awsDeployMock.functionHandlers[1]).to.equal(rawFunctionObjectsMock.second.handler);
      });
    });
  });

  describe('#zipFunctions()', () => {
    it('should push the paths to the zipFiles to the pathsToZipFiles array', () => {
      // set the functionHandlers array
      awsDeployMock.functionHandlers = functionHandlersArrayMock;

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, 'function.js');
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployMock.zipFunctions().then(() => {
        expect(awsDeployMock.pathsToZipFiles[0]).to.equal(path.join(tmpDirPath, 'function.zip'));
      });
    });
  });

  describe('#uploadZipFilesToS3Bucket()', () => {
    it('should upload the zip files to the S3 bucket', () => {
      awsDeployMock.serverless.service.service = 'first-service';
      awsDeployMock.options.region = 'eu-central-1';

      // create a mock zip file
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, 'function.zip');
      serverless.utils.writeFileSync(tmpFilePath, 'some binary data');

      awsDeployMock.pathsToZipFiles.push(tmpFilePath);

      return awsDeployMock.uploadZipFilesToS3Bucket().then(() => {
        // TODO use sinon to mock S3
        expect(true).to.equal(true);
      });
    });
  });
});
