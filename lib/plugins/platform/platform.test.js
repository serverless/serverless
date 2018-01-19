'use strict';

/* eslint-disable no-console */

const expect = require('chai').expect;
const sinon = require('sinon');
const chalk = require('chalk');
const Platform = require('./platform');
const Serverless = require('../../Serverless');
const AwsProvider = require('../aws/provider/awsProvider');

describe('Platform', () => {
  let serverless;
  let platform;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless));
    platform = new Platform(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(platform.serverless).to.deep.equal(serverless);
    });

    it('should have a hook after the deploy', () => {
      expect(platform.hooks).to.have.property('after:deploy:deploy');
    });

    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(platform.provider).to.be.instanceof(AwsProvider);
    });
  });

  describe('#archiveService()', () => {
    let getAuthTokenStub;
    let archiveServiceRequestStub;
    let logStub;

    beforeEach(() => {
      archiveServiceRequestStub = sinon
        .stub(platform, 'archiveServiceRequest')
        .resolves({ data: {} });
      getAuthTokenStub = sinon.stub(platform, 'getAuthToken');
      logStub = sinon.stub(platform.serverless.cli, 'log');
    });

    afterEach(() => {
      platform.archiveServiceRequest.restore();
      platform.getAuthToken.restore();
    });

    it('should skip archiving if user opted out via "publish" config', () => {
      getAuthTokenStub.returns(
        // eslint-disable-next-line max-len
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE0OTc4ODMwMzMsImV4cCI6MTUyOTQxOTAzMywiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIm5pY2tuYW1lIjoiam9obmRvZSJ9.GD6sqQR3qLirnrvLKKrmOc7vgsHpqZ3TPwyG8ZI69ig'
      );
      platform.serverless.service.service = 'new-service-3';
      platform.serverless.service.serviceObject = {
        name: 'new-service-3',
        publish: false,
      };

      return platform.archiveService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(archiveServiceRequestStub.calledOnce).to.be.equal(false);
      });
    });

    it('should skip archiving if user is not logged in', () => {
      getAuthTokenStub.returns(undefined);

      platform.serverless.service.service = 'new-service-3';
      platform.serverless.service.serviceObject = {
        name: 'new-service-3',
      };

      return platform.archiveService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(archiveServiceRequestStub.calledOnce).to.be.equal(false);
      });
    });

    it('should archiving', () => {
      getAuthTokenStub.returns(
        // eslint-disable-next-line max-len
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE0OTc4ODMwMzMsImV4cCI6MTUyOTQxOTAzMywiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIm5pY2tuYW1lIjoiam9obmRvZSJ9.GD6sqQR3qLirnrvLKKrmOc7vgsHpqZ3TPwyG8ZI69ig'
      );
      platform.serverless.service.service = 'new-service-3';
      platform.serverless.service.serviceObject = {
        name: 'new-service-3',
      };

      return platform.archiveService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(archiveServiceRequestStub.calledOnce).to.be.equal(true);
        expect(
          logStub.calledWithExactly('Successfully archived your service on the Serverless Platform')
        ).to.be.equal(true);
      });
    });
  });

  describe('#publishService()', () => {
    let getAuthTokenStub;
    let getAccountInfoStub;
    let endpointsRequestStub;
    let publishServiceRequestStub;

    beforeEach(() => {
      getAuthTokenStub = sinon.stub(platform, 'getAuthToken').returns(
        // eslint-disable-next-line max-len
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE0OTc4ODMwMzMsImV4cCI6MTUyOTQxOTAzMywiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIm5pY2tuYW1lIjoiam9obmRvZSJ9.GD6sqQR3qLirnrvLKKrmOc7vgsHpqZ3TPwyG8ZI69ig'
      );
      getAccountInfoStub = sinon
                            .stub(platform.provider, 'getAccountInfo')
                            .resolves({ accountId: 'acountId123', partition: 'aws' });
      endpointsRequestStub = sinon.stub(platform.provider, 'request').resolves({
        Stacks: [
          {
            Outputs: [{ OutputKey: 'ServiceEndpoint', OutputValue: 'http://service-endpoint' }],
          },
        ],
      });
      publishServiceRequestStub = sinon.stub(platform, 'publishServiceRequest').resolves();
      sinon.spy(console, 'log');
    });

    afterEach(() => {
      platform.getAuthToken.restore();
      platform.provider.getAccountInfo.restore();
      platform.provider.request.restore();
      platform.publishServiceRequest.restore();
      console.log.restore();
    });

    it('should send a minimal service request to the platform', () => {
      platform.serverless.service.service = 'new-service-2';
      platform.serverless.service.serviceObject = {
        name: 'new-service-2',
      };
      platform.serverless.config.servicePath = '/path/to/service';

      return platform.publishService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(getAccountInfoStub.calledOnce).to.be.equal(true);
        expect(endpointsRequestStub.calledOnce).to.be.equal(true);
        expect(publishServiceRequestStub.calledOnce).to.be.equal(true);
        const expected = { name: 'new-service-2', stage: undefined, functions: [] };
        expect(publishServiceRequestStub.getCall(0).args[0]).to.deep.equal(expected);
        const url = chalk.green('https://platform.serverless.com/services/johndoe/new-service-2');
        const successLog = 'Service successfully published! Your service details are available at:';
        expect(console.log.calledWithExactly(successLog)).to.be.equal(true);
        expect(console.log.calledWithExactly(url)).to.be.equal(true);
      });
    });

    it('should send a full service request to the platform', () => {
      platform.serverless.service.service = 'new-service-2';
      platform.serverless.service.serviceObject = {
        name: 'new-service-2',
        description: 'test description',
        repository: 'https://example.com/repo',
        homepage: 'https://example.com',
        bugs: 'https://example.com/bugs',
        license: 'MIT',
      };
      platform.serverless.config.servicePath = '/path/to/service';
      platform.serverless.service.provider.name = 'aws';
      platform.serverless.service.functions = {
        hello: {
          handler: 'handler.hello',
          description: 'test desc',
          events: [{ http: { path: 'users/create', method: 'get', integration: 'AWS_PROXY' } }],
          name: 'test-service2-dev-hello',
          package: {},
          vpc: {},
        },
      };

      return platform.publishService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(getAccountInfoStub.calledOnce).to.be.equal(true);
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
        const url = chalk.green('https://platform.serverless.com/services/johndoe/new-service-2');
        const successLog = 'Service successfully published! Your service details are available at:';
        expect(console.log.calledWithExactly(successLog)).to.be.equal(true);
        expect(console.log.calledWithExactly(url)).to.be.equal(true);
      });
    });

    it('should skip publishing if user opted out via "publish" config', () => {
      platform.serverless.service.service = 'new-service-2';
      platform.serverless.service.serviceObject = {
        name: 'new-service-2',
        publish: false,
      };

      return platform.publishService().then(() => {
        expect(getAuthTokenStub.calledOnce).to.be.equal(true);
        expect(getAccountInfoStub.calledOnce).to.be.equal(false);
        expect(endpointsRequestStub.calledOnce).to.be.equal(false);
        expect(publishServiceRequestStub.calledOnce).to.be.equal(false);
      });
    });
  });
});
