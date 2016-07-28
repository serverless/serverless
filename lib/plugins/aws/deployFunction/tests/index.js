'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Zip = require('node-zip');
const AwsDeployFunction = require('../');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('AwsDeployFunction', () => {
  let serverless;
  let awsDeployFunction;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.servicePath = true;
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };
    serverless.service.functions = {
      first: {
        handler: true,
      },
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
    };
    serverless.init();
    awsDeployFunction = new AwsDeployFunction(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeployFunction.hooks).to.be.not.empty);

    it('should set the provider variable to "aws"', () => expect(awsDeployFunction.provider)
      .to.equal('aws'));

    it('should run promise chain in order', () => {
      const checkIfFunctionExistsInServiceStub = sinon
        .stub(awsDeployFunction, 'checkIfFunctionExistsInService').returns(BbPromise.resolve());
      const checkIfFunctionIsDeployedStub = sinon
        .stub(awsDeployFunction, 'checkIfFunctionIsDeployed').returns(BbPromise.resolve());
      const zipFunctionStub = sinon
        .stub(awsDeployFunction, 'zipFunction').returns(BbPromise.resolve());
      const deployFunctionStub = sinon
        .stub(awsDeployFunction, 'deployFunction').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['deploy:function:deploy']().then(() => {
        expect(checkIfFunctionExistsInServiceStub.calledOnce).to.be.equal(true);
        expect(checkIfFunctionIsDeployedStub.calledAfter(checkIfFunctionExistsInServiceStub))
          .to.be.equal(true);
        expect(zipFunctionStub.calledAfter(checkIfFunctionIsDeployedStub))
          .to.be.equal(true);
        expect(deployFunctionStub.calledAfter(zipFunctionStub))
          .to.be.equal(true);

        awsDeployFunction.checkIfFunctionExistsInService.restore();
        awsDeployFunction.checkIfFunctionIsDeployed.restore();
        awsDeployFunction.zipFunction.restore();
        awsDeployFunction.deployFunction.restore();
      });
    });
  });

  describe('#checkIfFunctionExistsInService()', () => {
    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsDeployFunction.checkIfFunctionExistsInService()).to.throw(Error);
    });
  });

  describe('#checkIfFunctionIsDeployed()', () => {
    it('should check if the function is deployed', () => {
      const getFunctionStub = sinon
        .stub(awsDeployFunction.sdk, 'request').returns(BbPromise.resolve());

      awsDeployFunction.functionName = 'first';

      return awsDeployFunction.checkIfFunctionIsDeployed().then(() => {
        expect(getFunctionStub.calledOnce).to.be.equal(true);
        expect(getFunctionStub.calledWith(
          awsDeployFunction.options.stage, awsDeployFunction.options.region)
        );
        expect(getFunctionStub.args[0][0]).to.be.equal('Lambda');
        expect(getFunctionStub.args[0][1]).to.be.equal('getFunction');
        expect(getFunctionStub.args[0][2].FunctionName).to.be.equal('first');
        awsDeployFunction.sdk.request.restore();
      });
    });
  });

  describe('#zipFunction()', () => {
    let zip;
    const functionFileNameBase = 'function';
    const functionCodeMock = `
      'use strict';

      module.exports.handler = function(event, context, cb) {
        return cb(null, {
          message: 'First function'
        });
      };
    `;

    beforeEach(() => {
      zip = new Zip();
      awsDeployFunction.functionName = 'first';
    });

    it('should zip a simple function', () => {
      awsDeployFunction.serverless.service.functions = {
        first: {
          handler: 'handler.first',
        },
      };

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployFunction.zipFunction().then((data) => {
        expect(typeof data).to.not.equal('undefined');

        const unzippedFileData = zip.load(data);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);
      });
    });

    it('should zip nested code', () => {
      awsDeployFunction.serverless.service.functions = {
        first: {
          handler: 'nested/handler.first',
        },
      };

      // create a function in a temporary directory --> nested/function.js
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'nested');
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);

      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // add a lib directory on the same level where the "nested" directory lives --> lib/some-file
      const libDirectory = path.join(tmpDirPath, '..', 'lib');
      serverless.utils.writeFileSync(path.join(libDirectory, 'some-file'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployFunction.zipFunction().then((data) => {
        expect(typeof data).to.not.equal('undefined');

        const unzippedFileData = zip.load(data);

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

    it('should keep file permissions', () => {
      awsDeployFunction.serverless.service.functions = {
        first: {
          handler: 'handler.first',
        },
      };

      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      // create a function in a temporary directory
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a executable file
      const executableFilePath = path.join(tmpDirPath, 'some-binary');
      serverless.utils.writeFileSync(executableFilePath, 'some-binary executable file content');
      fs.chmodSync(executableFilePath, 777);

      // create a readonly file
      const readOnlyFilePath = path.join(tmpDirPath, 'read-only');
      serverless.utils.writeFileSync(readOnlyFilePath, 'read-only executable file content');
      fs.chmodSync(readOnlyFilePath, 444);

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeployFunction.zipFunction().then((data) => {
        expect(typeof data).to.not.equal('undefined');

        const unzippedFileData = zip.load(data);

        expect(unzippedFileData.files['some-binary'].unixPermissions)
          .to.equal(Math.pow(2, 15) + 777);
        expect(unzippedFileData.files['read-only'].unixPermissions)
          .to.equal(Math.pow(2, 15) + 444);
      });
    });
  });

  describe('#deployFunction()', () => {
    it('should deploy the function', () => {
      const updateFunctionCodeStub = sinon
        .stub(awsDeployFunction.sdk, 'request').returns(BbPromise.resolve());

      awsDeployFunction.functionName = 'first';

      const data = 'some-buffer';

      return awsDeployFunction.deployFunction(data).then(() => {
        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(updateFunctionCodeStub.calledWith(
          awsDeployFunction.options.stage, awsDeployFunction.options.region)
        );
        expect(updateFunctionCodeStub.args[0][0]).to.be.equal('Lambda');
        expect(updateFunctionCodeStub.args[0][1]).to.be.equal('updateFunctionCode');
        expect(updateFunctionCodeStub.args[0][2].FunctionName).to.be.equal('first');
        expect(updateFunctionCodeStub.args[0][2].ZipFile).to.be.equal('some-buffer');
        awsDeployFunction.sdk.request.restore();
      });
    });
  });
});
