'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const Package = require('../../package');
const AwsProvider = require('../provider/awsProvider');
const AwsDeployFunction = require('./index');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');
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

  describe('hooks', () => {
    it('should run "deploy:function:initialize" promise chain in order', () => {
      const validateStub = sinon
        .stub(awsDeployFunction, 'validate').returns(BbPromise.resolve());
      const checkIfFunctionExistsStub = sinon
        .stub(awsDeployFunction, 'checkIfFunctionExists').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['deploy:function:initialize']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(checkIfFunctionExistsStub.calledAfter(validateStub)).to.equal(true);
        awsDeployFunction.checkIfFunctionExists.restore();
      });
    });

    it('should run "deploy:function:packageFunction" promise chain in order', () => {
      const packageFunctionStub = sinon
        .stub(awsDeployFunction, 'packageFunction').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['deploy:function:packageFunction']().then(() => {
        expect(packageFunctionStub.calledOnce).to.equal(true);
        awsDeployFunction.packageFunction.restore();
      });
    });

    it('should run "deploy:function:deploy" promise chain in order', () => {
      const deployFunctionStub = sinon
        .stub(awsDeployFunction, 'deployFunction').returns(BbPromise.resolve());
      const cleanupStub = sinon
        .stub(awsDeployFunction, 'cleanup').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['deploy:function:deploy']().then(() => {
        expect(deployFunctionStub.calledOnce).to.equal(true);
        expect(cleanupStub.calledAfter(deployFunctionStub))
          .to.equal(true);

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
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());

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

  describe('#packageFunction()', () => {
    it('should zip the function', () => {
      const pkg = new Package();

      awsDeployFunction.pkg = pkg;

      const packageFunctionStub = sinon
        .stub(pkg, 'packageFunction').returns(BbPromise.resolve());

      return awsDeployFunction.packageFunction().then(() => {
        expect(packageFunctionStub.calledOnce).to.be.equal(true);
        expect(packageFunctionStub.args[0][0]).to.be.equal(awsDeployFunction.options.function);

        awsDeployFunction.pkg.packageFunction.restore();
      });
    });
  });

  describe('#deployFunction()', () => {
    let artifactFilePath;

    beforeEach(() => {
      // write a file to disc to simulate that the deployment artifact exists
      artifactFilePath = path.join(testUtils.getTmpDirPath(), 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      awsDeployFunction.options.functionObj.artifact = artifactFilePath;
    });

    it('should deploy the function', () => {
      // deploy the function artifact not the service artifact
      const updateFunctionCodeStub = sinon
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());

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
      sinon.stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());
      sinon.spy(awsDeployFunction.serverless.cli, 'log');

      return awsDeployFunction.deployFunction().then(() => {
        const expected = 'Uploading function: first (1 KB)...';
        expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);

        awsDeployFunction.provider.request.restore();
        fs.statSync.restore();
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
