'use strict';

const expect = require('chai').expect;
const OpenWhiskDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');
const ClientFactory = require('../../util/client_factory');

require('chai').use(chaiAsPromised);

describe('deployFunctions', () => {
  let serverless;
  let openwhiskDeploy;
  let sandbox;

  const fileContents =
    `function main() {
      return {payload: 'Hello world'};
    }`;

  const mockFunctionObject = {
    actionName: 'serviceName_functionName',
    namespace: 'namespace',
    action: {
      exec: { kind: 'nodejs:default', code: fileContents },
      limits: { timeout: 60 * 1000, memory: 256 },
      parameters: [{ key: 'foo', value: 'bar' }],
    },
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskDeploy = new OpenWhiskDeploy(serverless, options);
    openwhiskDeploy.serverless.cli = new serverless.classes.CLI();
    openwhiskDeploy.serverless.service.defaults = {
      namespace: 'testing',
      apihost: 'openwhisk.org',
      auth: 'user:pass',
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#deployFunctionHandler()', () => {
    it('should deploy function handler to openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const create = params => {
          expect(params).to.be.deep.equal({
            actionName: mockFunctionObject.actionName,
            namespace: mockFunctionObject.namespace,
            action: mockFunctionObject.action,
          });
          return Promise.resolve();
        };

        return Promise.resolve({ actions: { create } });
      });
      return expect(openwhiskDeploy.deployFunctionHandler(mockFunctionObject))
        .to.eventually.be.resolved;
    });

    it('should reject when function handler fails to deploy with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const create = () => Promise.reject(err);

        return Promise.resolve({ actions: { create } });
      });
      return expect(openwhiskDeploy.deployFunctionHandler(mockFunctionObject))
        .to.eventually.be.rejectedWith(
          new RegExp(`${mockFunctionObject.actionName}.*${err.message}`)
        );
    });
  });
});
