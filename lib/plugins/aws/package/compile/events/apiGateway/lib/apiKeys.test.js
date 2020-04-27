'use strict';

const _ = require('lodash');
const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileApiKeys()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.service = 'first-service';
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
  });

  it('should support api key notation', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = [
      '1234567890',
      { name: '2345678901' },
      { value: 'valueForKeyWithoutName', description: 'Api key description' },
      { name: '3456789012', value: 'valueForKey3456789012' },
    ];

    return awsCompileApigEvents.compileApiKeys().then(() => {
      const expectedApiKeys = [
        { name: '1234567890', value: undefined, description: undefined },
        { name: '2345678901', value: undefined, description: undefined },
        { name: undefined, value: 'valueForKeyWithoutName', description: 'Api key description' },
        { name: '3456789012', value: 'valueForKey3456789012', description: undefined },
      ];

      _.forEach(expectedApiKeys, (apiKey, index) => {
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Type
        ).to.equal('AWS::ApiGateway::ApiKey');

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Properties.Enabled
        ).to.equal(true);

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Properties.Name
        ).to.equal(apiKey.name);

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Properties.Description
        ).to.equal(apiKey.description);

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Properties.Value
        ).to.equal(apiKey.value);

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Properties.StageKeys[0].RestApiId.Ref
        ).to.equal('ApiGatewayRestApi');

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].Properties.StageKeys[0].StageName
        ).to.equal('dev');

        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
          ].DependsOn
        ).to.equal('ApiGatewayDeploymentTest');
      });
    });
  });

  describe('when using usage plan notation', () => {
    it('should support usage plan notation', () => {
      awsCompileApigEvents.serverless.service.provider.usagePlan = [{ free: [] }, { paid: [] }];
      awsCompileApigEvents.serverless.service.provider.apiKeys = [
        {
          free: [
            '1234567890',
            { name: '2345678901' },
            { value: 'valueForKeyWithoutName', description: 'Api key description' },
            { name: '3456789012', value: 'valueForKey3456789012' },
          ],
        },
        { paid: ['0987654321', 'jihgfedcba'] },
      ];

      return awsCompileApigEvents.compileApiKeys().then(() => {
        const expectedApiKeys = {
          free: [
            { name: '1234567890', value: undefined, description: undefined },
            { name: '2345678901', value: undefined, description: undefined },
            {
              name: undefined,
              value: 'valueForKeyWithoutName',
              description: 'Api key description',
            },
            { name: '3456789012', value: 'valueForKey3456789012', description: undefined },
          ],
          paid: [
            { name: '0987654321', value: undefined, description: undefined },
            { name: 'jihgfedcba', value: undefined, description: undefined },
          ],
        };
        _.forEach(awsCompileApigEvents.serverless.service.provider.apiKeys, plan => {
          const planName = _.first(_.keys(plan)); // free || paid
          const apiKeys = expectedApiKeys[planName];
          _.forEach(apiKeys, (apiKey, index) => {
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Type
            ).to.equal('AWS::ApiGateway::ApiKey');
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Properties.Enabled
            ).to.equal(true);
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Properties.Name
            ).to.equal(apiKey.name);
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Properties.Description
            ).to.equal(apiKey.description);
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Properties.Value
            ).to.equal(apiKey.value);
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Properties.StageKeys[0].RestApiId.Ref
            ).to.equal('ApiGatewayRestApi');
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].Properties.StageKeys[0].StageName
            ).to.equal('dev');
            expect(
              awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[
                awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
              ].DependsOn
            ).to.equal('ApiGatewayDeploymentTest');
          });
        });
      });
    });
  });

  it('throw error if an apiKey is not a valid object', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = [{ named: 'invalid' }];
    expect(() => awsCompileApigEvents.compileApiKeys()).to.throw(/must be a string or an object/);
  });

  it('throw error if one of the apiKeys types has a value with too few characters', () => {
    awsCompileApigEvents.serverless.service.provider.usagePlan = [{ free: [] }, { paid: [] }];
    awsCompileApigEvents.serverless.service.provider.apiKeys = [
      { free: [{ name: 'valuenottwentycharacterslong', value: 'tooshort' }] },
      { paid: [] },
    ];
    expect(() => awsCompileApigEvents.compileApiKeys()).to.throw(/having at least 20 characters/);
  });

  it('throw error if a single apiKey value does not have enough characters', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = [{ value: 'notlong' }];
    expect(() => awsCompileApigEvents.compileApiKeys()).to.throw(/having at least 20 characters/);
  });

  it('throw error if a the apiKeys is not an array', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = { name: 'notanarray' };
    expect(() => awsCompileApigEvents.compileApiKeys()).to.throw(/must be an array/);
  });
});
