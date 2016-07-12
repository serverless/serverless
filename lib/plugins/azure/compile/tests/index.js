'use strict';

const expect = require('chai').expect;
const AzureCompile = require('../index');
const sinon = require('sinon');
const Serverless = require('../../../../Serverless');


describe('#compileFunctions()', () => {
  const serverless = new Serverless();
  const azureCompile = new AzureCompile(serverless);
  let getAllFunctionsStub;
  let getFunctionStub;

  azureCompile.serverless.service.resources.azure = {};

  function setupServerlessStubs(funcName, serverlessInstance, functionObject) {
    /* eslint-disable arrow-body-style */
    getAllFunctionsStub = sinon.stub(serverlessInstance.service, 'getAllFunctions', () => {
      return [funcName];
    });

    getFunctionStub = sinon.stub(serverlessInstance.service, 'getFunction', () => {
      return functionObject;
    });
    /* eslint-enable arrow-body-style */
  }

  it('should setup a map for keeping compiled function JSON', () => {
    azureCompile.setup();
    expect(Object.keys(azureCompile.serverless.service.resources.azure.functions).length)
      .to.be.equal(0);
  });

  it('should only compile functions if the functions map exists', () => {
    azureCompile.setup();
    azureCompile.serverless.service.resources.azure = {};
    try {
      azureCompile.compileFunctions();
    } catch (error) {
      expect(error.message).to.equal('This plugin needs access to the Resources' +
        ' section of the Azure Resource Manager template');
    }
  });

  it('should only compile functions if they provide an azure config', () => {
    const funcName = 'myFunc';
    const triggerConfiguration = {
      provider: {
        aws: {
          disabled: false,
        },
      },
      events: {
        aws: {},
      },
    };

    setupServerlessStubs(funcName, serverless, triggerConfiguration);
    azureCompile.setup();

    try {
      azureCompile.compileFunctions();
    } catch (error) {
      expect(error.message).to.include('does not have an azure trigger configuration');
    }

    getAllFunctionsStub.restore();
    getFunctionStub.restore();
  });

  it('should compile functions', () => {
    const funcName = 'myFunc';
    const triggerConfiguration = {
      provider: {
        azure: {
          disabled: false,
        },
      },
      events: {
        azure: {
          http: {
            name: 'test',
            authLevel: 'anonymous',
          },
        },
      },
    };

    setupServerlessStubs(funcName, serverless, triggerConfiguration);

    azureCompile.setup();
    azureCompile.compileFunctions();

    expect(
      Object.keys(serverless.service.resources.azure.functions).length
    ).to.be.equal(1);

    const functionJSON = serverless.service.resources.azure.functions[funcName];
    expect(functionJSON.bindings.length).to.equal(2);

    getAllFunctionsStub.restore();
    getFunctionStub.restore();
  });
});
