'use strict';

/* eslint-disable max-len */
/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const _ = require('lodash');
const Serverless = require('../../../../../../../../Serverless');
const AwsProvider = require('../../../../../../provider/awsProvider');
const updateStage = require('./updateStage').updateStage;

chai.use(require('sinon-chai'));

const { expect } = chai;

describe('#updateStage()', () => {
  let serverless;
  let options;
  let awsProvider;
  let providerGetAccountIdStub;
  let providerRequestStub;
  let context;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.service = 'my-service';
    options = { stage: 'dev', region: 'us-east-1' };
    awsProvider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', awsProvider);
    providerGetAccountIdStub = sinon.stub(awsProvider, 'getAccountId').resolves(123456);
    providerRequestStub = sinon.stub(awsProvider, 'request');

    context = {
      serverless,
      options,
      state: _.cloneDeep(serverless),
      provider: awsProvider,
    };

    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: undefined,
      })
      .resolves({
        items: [{ name: 'dev-my-service', id: 'someRestApiId' }],
      });
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'someRestApiId',
        stageName: 'dev',
      })
      .resolves({
        tags: {
          old: 'tag',
        },
      });

    providerRequestStub
      .withArgs('CloudWatchLogs', 'deleteLogGroup', {
        logGroupName: '/aws/api-gateway/my-service-dev',
      })
      .resolves();
  });

  afterEach(() => {
    awsProvider.getAccountId.restore();
    awsProvider.request.restore();
  });

  it('should update the stage based on the serverless file configuration', () => {
    context.state.service.provider.tags = {
      'Containing Space': 'bar',
      'bar': 'high-priority',
    };
    context.state.service.provider.stackTags = {
      bar: 'low-priority',
      num: 123,
    };
    context.state.service.provider.tracing = {
      apiGateway: true,
    };
    context.state.service.provider.logs = {
      restApi: true,
    };

    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'true' },
        {
          op: 'replace',
          path: '/accessLogSettings/destinationArn',
          value: 'arn:aws:logs:us-east-1:123456:log-group:/aws/api-gateway/my-service-dev',
        },
        {
          op: 'replace',
          path: '/accessLogSettings/format',
          value:
            'requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength',
        },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'true' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'INFO' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(5);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('updateStage');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
        patchOperations,
      });
      expect(providerRequestStub.args[3][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[3][1]).to.equal('tagResource');
      expect(providerRequestStub.args[3][2]).to.deep.equal({
        resourceArn: 'arn:aws:apigateway:us-east-1::/restapis/someRestApiId/stages/dev',
        tags: {
          'Containing Space': 'bar',
          'bar': 'high-priority',
          'num': '123',
        },
      });
      expect(providerRequestStub.args[4][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[4][1]).to.equal('untagResource');
      expect(providerRequestStub.args[4][2]).to.deep.equal({
        resourceArn: 'arn:aws:apigateway:us-east-1::/restapis/someRestApiId/stages/dev',
        tagKeys: ['old'],
      });
    });
  });

  it('should perform default actions if settings are not configure', () => {
    context.state.service.provider.tags = {
      old: 'tag',
    };
    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(4);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
      });
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
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'someRestApiId',
        stageName: 'dev',
      })
      .rejects();

    providerRequestStub
      .withArgs('APIGateway', 'getDeployments', {
        restApiId: 'someRestApiId',
        limit: 500,
      })
      .resolves({
        items: [{ id: 'someDeploymentId' }],
      });

    providerRequestStub
      .withArgs('APIGateway', 'createStage', {
        deploymentId: 'someDeploymentId',
        restApiId: 'someRestApiId',
        stageName: 'dev',
      })
      .resolves();

    return updateStage.call(context).then(() => {
      const patchOperations = [
        { op: 'replace', path: '/tracingEnabled', value: 'false' },
        { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
        { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
      ];

      expect(providerGetAccountIdStub).to.be.calledOnce;
      expect(providerRequestStub.args).to.have.length(6);
      expect(providerRequestStub.args[0][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[0][1]).to.equal('getRestApis');
      expect(providerRequestStub.args[0][2]).to.deep.equal({
        limit: 500,
        position: undefined,
      });
      expect(providerRequestStub.args[1][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[1][1]).to.equal('getStage');
      expect(providerRequestStub.args[1][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        stageName: 'dev',
      });
      expect(providerRequestStub.args[2][0]).to.equal('APIGateway');
      expect(providerRequestStub.args[2][1]).to.equal('getDeployments');
      expect(providerRequestStub.args[2][2]).to.deep.equal({
        restApiId: 'someRestApiId',
        limit: 500,
      });
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

  it('should resolve custom restApiId', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'foobarfoo1',
        stageName: 'dev',
      })
      .resolves({
        variables: {
          old: 'tag',
        },
      });
    context.state.service.provider.apiGateway = { restApiId: 'foobarfoo1' };
    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('foobarfoo1');
    });
  });

  it('should resolve custom APIGateway name', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: undefined,
      })
      .resolves({
        items: [{ name: 'custom-api-gateway-name', id: 'restapicus' }],
      });
    providerRequestStub
      .withArgs('APIGateway', 'getStage', {
        restApiId: 'restapicus',
        stageName: 'dev',
      })
      .resolves({
        variables: {
          old: 'tag',
        },
      });
    context.state.service.provider.apiName = 'custom-api-gateway-name';
    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('restapicus');
    });
  });

  it('should resolve expected restApiId when beyond 500 APIs are deployed', () => {
    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: undefined,
      })
      .resolves({
        items: [],
        position: 'foobarfoo1',
      });
    providerRequestStub
      .withArgs('APIGateway', 'getRestApis', {
        limit: 500,
        position: 'foobarfoo1',
      })
      .resolves({
        items: [{ name: 'dev-my-service', id: 'someRestApiId' }],
      });

    return updateStage.call(context).then(() => {
      expect(context.apiGatewayRestApiId).to.equal('someRestApiId');
    });
  });

  it(
    'should not apply hack when restApiId could not be resolved and ' +
      'no custom settings are applied',
    () => {
      context.state.service.provider.apiGateway = {
        restApiId: { 'Fn::ImportValue': 'RestApiId-${self:custom.stage}' },
      };
      return updateStage.call(context).then(() => {
        expect(providerRequestStub.callCount).to.equal(0);
      });
    }
  );
});
