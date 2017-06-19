'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const PlatformPlugin = require('./platform');
const Serverless = require('../../Serverless');
const AwsProvider = require('../aws/provider/awsProvider');

describe('platform', () => {
  let serverless;
  let plugin;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless));
    plugin = new PlatformPlugin(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(plugin.serverless).to.deep.equal(serverless);
    });

    it('should have a hook after the deploy', () => {
      expect(plugin.hooks).to.have.property('after:deploy:deploy');
    });

    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(plugin.provider).to.be.instanceof(AwsProvider);
    });
  });

  describe('#publishService()', () => {
    let getAuthTokenStub;
    let getAccountIdStub;
    let endpointsRequestStub;
    let publishServiceRequestStub;

    beforeEach(() => {
      getAuthTokenStub = sinon.stub(plugin, 'getAuthToken').returns(
        // eslint-disable-next-line max-len
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE0OTc4ODMwMzMsImV4cCI6MTUyOTQxOTAzMywiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIm5pY2tuYW1lIjoiam9obmRvZSJ9.GD6sqQR3qLirnrvLKKrmOc7vgsHpqZ3TPwyG8ZI69ig'
      );
      getAccountIdStub = sinon.stub(plugin.provider, 'getAccountId').resolves('acountId123');
      endpointsRequestStub = sinon.stub(plugin.provider, 'request').resolves({
        Stacks: [
          {
            Outputs: [{ OutputKey: 'ServiceEndpoint', OutputValue: 'http://service-endpoint' }],
          },
        ],
      });
      publishServiceRequestStub = sinon.stub(plugin, 'publishServiceRequest').resolves();
    });

    afterEach(() => {
      getAuthTokenStub.restore();
      getAccountIdStub.restore();
      endpointsRequestStub.restore();
      publishServiceRequestStub.restore();
    });

    it('should send a minimal service request to the platform', () => {
      plugin.serverless.service.service = 'new-service-2';
      plugin.serverless.service.serviceObject = {
        name: 'new-service-2',
      };
      plugin.serverless.config.servicePath = '/path/to/service';
      sinon.spy(plugin.serverless.cli, 'log');

      return plugin.publishService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(getAccountIdStub.calledOnce).to.be.equal(true);
        expect(endpointsRequestStub.calledOnce).to.be.equal(true);
        expect(publishServiceRequestStub.calledOnce).to.be.equal(true);
        const expected = { name: 'new-service-2', stage: undefined, functions: [] };
        expect(publishServiceRequestStub.getCall(0).args[0]).to.deep.equal(expected);
        const expectedLog =
          'Your service is available at https://platform.serverless.com/services/johndoe/new-service-2';
        expect(plugin.serverless.cli.log.calledWithExactly(expectedLog)).to.be.equal(true);
      });
    });

    it('should send a full service request to the platform', () => {
      plugin.serverless.service.service = 'new-service-2';
      plugin.serverless.service.serviceObject = {
        name: 'new-service-2',
        description: 'test description',
        repository: 'https://example.com/repo',
        homepage: 'https://example.com',
        bugs: 'https://example.com/bugs',
        license: 'MIT',
      };
      plugin.serverless.config.servicePath = '/path/to/service';
      plugin.serverless.service.provider.name = 'aws';
      plugin.serverless.service.functions = {
        hello: {
          handler: 'handler.hello',
          description: 'test desc',
          events: [{ http: { path: 'users/create', method: 'get', integration: 'AWS_PROXY' } }],
          name: 'test-service2-dev-hello',
          package: {},
          vpc: {},
        },
      };

      sinon.spy(plugin.serverless.cli, 'log');

      return plugin.publishService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(getAccountIdStub.calledOnce).to.be.equal(true);
        expect(endpointsRequestStub.calledOnce).to.be.equal(true);
        expect(publishServiceRequestStub.calledOnce).to.be.equal(true);
        const expected = {
          name: 'new-service-2',
          stage: undefined,
          repository: 'https://example.com/repo',
          bugs: 'https://example.com/bugs',
          description: 'test description',
          functions: [
            {
              description: 'test desc',
              endpoints: [
                {
                  method: 'GET',
                  url: 'http://service-endpoint/users/create',
                },
              ],
              memory: 1024,
              name: 'hello',
              originId: 'arn:aws:lambda:us-east-1:acountId123:function:test-service2-dev-hello',
              provider: 'aws',
              runtime: 'nodejs4.3',
              timeout: 6,
            },
          ],
          homepage: 'https://example.com',
          license: 'MIT',
        };
        expect(publishServiceRequestStub.getCall(0).args[0]).to.deep.equal(expected);
        const expectedLog =
          'Your service is available at https://platform.serverless.com/services/johndoe/new-service-2';
        expect(plugin.serverless.cli.log.calledWithExactly(expectedLog)).to.be.equal(true);
      });
    });
  });
});
