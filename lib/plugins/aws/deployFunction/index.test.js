'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const AwsProvider = require('../provider/awsProvider');
const AwsDeployFunction = require('./index');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

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
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsDeployFunction = new AwsDeployFunction(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeployFunction.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsDeployFunction.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsDeployFunctionWithEmptyOptions = new AwsDeployFunction(serverless);

      expect(awsDeployFunctionWithEmptyOptions.options).to.deep.equal({});
    });
  });

  describe('#checkIfFunctionExists()', () => {
    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsDeployFunction.checkIfFunctionExists()).to.throw(Error);
    });

    it('should check if the function is deployed', () => {
      const getFunctionStub = sinon
        .stub(awsDeployFunction.provider, 'request').resolves();

      awsDeployFunction.serverless.service.functions = {
        first: {
          name: 'first',
          handler: 'handler.first',
        },
      };

      return awsDeployFunction.checkIfFunctionExists().then(() => {
        expect(getFunctionStub.calledOnce).to.be.equal(true);
        expect(getFunctionStub.calledWithExactly(
          'Lambda',
          'getFunction',
          {
            FunctionName: 'first',
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });
  });

  describe('#deployFunction()', () => {
    let artifactFilePath;

    beforeEach(() => {
      // write a file to disc to simulate that the deployment artifact exists
      awsDeployFunction.packagePath = testUtils.getTmpDirPath();
      artifactFilePath = path.join(awsDeployFunction.packagePath, 'first.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'first.zip file content');
    });

    it('should deploy the function', () => {
      // deploy the function artifact not the service artifact
      const updateFunctionCodeStub = sinon
        .stub(awsDeployFunction.provider, 'request').resolves();

      return awsDeployFunction.deployFunction().then(() => {
        const data = fs.readFileSync(artifactFilePath);

        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'first',
            ZipFile: data,
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });

    it('should log artifact size', () => {
      sinon.stub(fs, 'statSync').returns({ size: 1024 });
      sinon.stub(awsDeployFunction.provider, 'request').resolves();
      sinon.spy(awsDeployFunction.serverless.cli, 'log');

      return awsDeployFunction.deployFunction().then(() => {
        const expected = 'Uploading function: first (1 KB)...';
        expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);

        awsDeployFunction.provider.request.restore();
        fs.statSync.restore();
      });
    });
  });
});
