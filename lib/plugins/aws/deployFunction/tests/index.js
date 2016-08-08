'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Package = require('../../../package');
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
      functionObj: {
        name: 'first',
      },
    };
    serverless.init();
    awsDeployFunction = new AwsDeployFunction(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeployFunction.hooks).to.be.not.empty);

    it('should set the provider variable to "aws"', () => expect(awsDeployFunction.provider)
      .to.equal('aws'));

    it('should run promise chain in order', () => {
      const checkIfFunctionExistsStub = sinon
        .stub(awsDeployFunction, 'checkIfFunctionExists').returns(BbPromise.resolve());
      const zipFunctionStub = sinon
        .stub(awsDeployFunction, 'zipFunction').returns(BbPromise.resolve());
      const deployFunctionStub = sinon
        .stub(awsDeployFunction, 'deployFunction').returns(BbPromise.resolve());
      const cleanupStub = sinon
        .stub(awsDeployFunction, 'cleanup').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['deploy:function:deploy']().then(() => {
        expect(checkIfFunctionExistsStub.calledOnce).to.be.equal(true);
        expect(zipFunctionStub.calledAfter(checkIfFunctionExistsStub))
          .to.be.equal(true);
        expect(deployFunctionStub.calledAfter(zipFunctionStub))
          .to.be.equal(true);
        expect(cleanupStub.calledAfter(deployFunctionStub))
          .to.be.equal(true);

        awsDeployFunction.checkIfFunctionExists.restore();
        awsDeployFunction.zipFunction.restore();
        awsDeployFunction.deployFunction.restore();
        awsDeployFunction.cleanup.restore();
      });
    });
  });

  describe('#checkIfFunctionExists()', () => {
    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsDeployFunction.checkIfFunctionExists()).to.throw(Error);
    });

    it('should check if the function is deployed', () => {
      const getFunctionStub = sinon
        .stub(awsDeployFunction.sdk, 'request').returns(BbPromise.resolve());

      awsDeployFunction.serverless.service.functions = {
        first: {
          name: 'first',
          handler: 'handler.first',
        },
      };

      return awsDeployFunction.checkIfFunctionExists().then(() => {
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
    it('should zip the function', () => {
      const pkg = new Package();

      awsDeployFunction.pkg = pkg;

      const zipServiceStub = sinon
        .stub(pkg, 'zipService').returns(BbPromise.resolve());

      return awsDeployFunction.zipFunction().then(() => {
        expect(zipServiceStub.calledOnce).to.be.equal(true);
        awsDeployFunction.pkg.zipService.restore();
      });
    });
  });

  describe('#deployFunction()', () => {
    it('should deploy the function', () => {
      // write a file to disc to simulate that the deployment artifact exists
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      awsDeployFunction.serverless.service.package.artifact = artifactFilePath;

      const updateFunctionCodeStub = sinon
        .stub(awsDeployFunction.sdk, 'request').returns(BbPromise.resolve());

      return awsDeployFunction.deployFunction().then(() => {
        const data = fs.readFileSync(artifactFilePath);

        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(updateFunctionCodeStub.calledWith(
          awsDeployFunction.options.stage, awsDeployFunction.options.region)
        );
        expect(updateFunctionCodeStub.args[0][0]).to.be.equal('Lambda');
        expect(updateFunctionCodeStub.args[0][1]).to.be.equal('updateFunctionCode');
        expect(updateFunctionCodeStub.args[0][2].FunctionName).to.be.equal('first');
        expect(updateFunctionCodeStub.args[0][2].ZipFile).to.deep.equal(data);
        awsDeployFunction.sdk.request.restore();
      });
    });
  });

  describe('#cleanup()', () => {
    it('should remove the temporary .serverless directory', () => {
      const pkg = new Package();

      awsDeployFunction.pkg = pkg;

      const cleanupStub = sinon
        .stub(pkg, 'cleanup').returns(BbPromise.resolve());

      return awsDeployFunction.cleanup().then(() => {
        expect(cleanupStub.calledOnce).to.be.equal(true);
        awsDeployFunction.pkg.cleanup.restore();
      });
    });
  });
});
