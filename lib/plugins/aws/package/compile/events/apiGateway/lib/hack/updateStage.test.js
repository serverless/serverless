'use strict';

/* eslint-disable max-len */
/* eslint-disable no-unused-expressions */

const expect = require('chai').expect;
const sinon = require('sinon');
const Serverless = require('../../../../../../../../Serverless');
const AwsProvider = require('../../../../../../provider/awsProvider');
const updateStage = require('./updateStage');

describe('#updateStage()', () => {
  let serverless;
  let options;
  let awsProvider;
  let providerGetAccountIdStub;
  let providerRequestStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'my-service';
    options = { stage: 'dev', region: 'us-east-1' };
    awsProvider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', awsProvider);
    providerGetAccountIdStub = sinon.stub(awsProvider, 'getAccountId')
      .resolves(123456);
    providerRequestStub = sinon.stub(awsProvider, 'request');

    updateStage.serverless = serverless;
    updateStage.options = options;
    updateStage.provider = awsProvider;

    providerRequestStub.withArgs('APIGateway', 'getRestApis', { limit: 500 })
      .resolves({
        items: [{ name: 'dev-my-service', id: 'someRestApiId' }],
      });

    providerRequestStub.withArgs('CloudWatchLogs', 'deleteLogGroup', {
      logGroupName: '/aws/api-gateway/my-service-dev',
    }).resolves();
  });

  afterEach(() => {
    awsProvider.getAccountId.restore();
    awsProvider.request.restore();
  });

  it('should update the stage based on the serverless file configuration', () => {
    providerRequestStub.withArgs('APIGateway', 'getStage', {
      restApiId: 'someRestApiId', stageName: 'dev',
    }).resolves({
      variables: {
        old: 'tag',
      },
    });

    updateStage.serverless.service.provider.tags = {
      foo: 'bar',
      bar: 'baz',
    };
    updateStage.serverless.service.provider.stackTags = {
      baz: 'qux',
      num: 123,
    };
    updateStage.serverless.service.provider.tracing = {
      apiGateway: true,
    };
    updateStage.serverless.service.provider.logs = {
      restApi: true,
    };

    return updateStage.updateStage().then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'true' },
        { op: 'replace', path: '/accessLogSettings/destinationArn', value: 'arn:aws:logs:us-east-1:123456:log-group:/aws/api-gateway/my-service-dev' },
        { op: 'replace', path: '/accessLogSettings/format', value: 'requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'true' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'INFO' },
        { op: 'replace', path: '/variables/baz', value: 'qux' },
        { op: 'replace', path: '/variables/num', value: '123' },
        { op: 'replace', path: '/variables/foo', value: 'bar' },
        { op: 'replace', path: '/variables/bar', value: 'baz' },
        { op: 'remove', path: '/variables/old' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(3);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({ limit: 500 });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({ restApiId: 'someRestApiId', stageName: 'dev' });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
        patchOperations,
      });
    });
  });

  it('should perform default actions if settings are not configure', () => {
    providerRequestStub.withArgs('APIGateway', 'getStage', {
      restApiId: 'someRestApiId', stageName: 'dev',
    }).resolves({
      variables: {
        old: 'tag',
      },
    });

    return updateStage.updateStage().then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
        { op: 'remove', path: '/variables/old' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(4);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({ limit: 500 });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({ restApiId: 'someRestApiId', stageName: 'dev' });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[3][0]).to.equal('CloudWatchLogs');
      expect(providerRequestStub.args[3][1]).to.equal('deleteLogGroup');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        logGroupName: '/aws/api-gateway/my-service-dev',
      });
    });
  });

  it('should create a new stage and proceed as usual if none can be found', () => {
    providerRequestStub.withArgs('APIGateway', 'getStage', {
      restApiId: 'someRestApiId', stageName: 'dev',
    }).rejects();

    providerRequestStub.withArgs('APIGateway', 'getDeployments', {
      restApiId: 'someRestApiId',
      limit: 500,
    }).resolves({
      items: [{ id: 'someDeploymentId' }],
    });

    providerRequestStub.withArgs('APIGateway', 'createStage', {
      deploymentId: 'someDeploymentId',
      restApiId: 'someRestApiId',
      stageName: 'dev',
    }).resolves();

    return updateStage.updateStage().then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(6);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({ limit: 500 });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({ restApiId: 'someRestApiId', stageName: 'dev' });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('getDeployments');
      expect(providerRequestStub.args[2][2]).to.deep.equal({ restApiId: 'someRestApiId', limit: 500 });
      expect(providerRequestStub.args[3][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[3][1]).to.equal('createStage');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        deploymentId: 'someDeploymentId',
        restApiId: 'someRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[4][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[4][1]).to.equal('updateStage');
      expect(providerRequestStub.args[4][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[5][0]).to.equal('CloudWatchLogs');
      expect(providerRequestStub.args[5][1]).to.equal('deleteLogGroup');
      expect(providerRequestStub.args[5][2]).to.deep.equal({
        logGroupName: '/aws/api-gateway/my-service-dev',
      });
    });
  });
});
