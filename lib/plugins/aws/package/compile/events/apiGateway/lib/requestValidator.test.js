'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../../../../tests/fixtures');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

describe('#compileRequestValidators()', () => {
  after(fixtures.cleanup);

  describe(' - provider configuration -', () => {
    it('Should process schema from apiGateway provider, full config', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelLogicalId = naming.getModelLogicalId('TestModel', 'any', 'application/json');
          const modelResource = cfResources[modelLogicalId];
          expect(modelResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              Description: 'Test Description',
              Name: 'TestModel',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });
        })
      ));

    it('Should process schema from apiGateway provider, missing name and description', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelLogicalId = naming.getModelLogicalId(
            'TestModelSimple',
            'any',
            'application/json'
          );
          const modelResource = cfResources[modelLogicalId];

          expect(modelResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });
        })
      ));
  });

  describe(' - function configuration ', () => {
    /** We have already validated that Models exist in the API Provider so this test will
     ** ensure the model can be referenced in the http requestSchema. i.e. not running expect against
     ** api provider models
     **/
    it('should reference model from provider:apiGateway:requestSchemas', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelLogicalId = naming.getModelLogicalId('TestModel', 'any', 'application/json');
          const validatorLogicalId = naming.getValidatorLogicalId('TestModel', 'any');
          const methodLogicalId = naming.getMethodLogicalId('Test', 'get');
          const methodResource = cfResources[methodLogicalId];

          expect(methodResource.Properties).to.have.property('RequestModels');
          expect(methodResource.Properties).to.have.property('RequestValidatorId');

          expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
            Ref: modelLogicalId,
          });

          expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
            Ref: validatorLogicalId,
          });
        })
      ));

    it('should create a new model from a schema only', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelLogicalId = naming.getModelLogicalId('Test2', 'get', 'application/json');
          const validatorLogicalId = naming.getValidatorLogicalId('Test2', 'get');
          const methodLogicalId = naming.getMethodLogicalId('Test2', 'get');
          const methodResource = cfResources[methodLogicalId];

          expect(methodResource.Properties).to.have.property('RequestModels');
          expect(methodResource.Properties).to.have.property('RequestValidatorId');

          expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
            Ref: modelLogicalId,
          });

          expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
            Ref: validatorLogicalId,
          });

          const modelResource = cfResources[modelLogicalId];

          expect(modelResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });
        })
      ));

    it('should create a new model from a schma with name and description', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelLogicalId = naming.getModelLogicalId('Test3', 'get', 'application/json');
          const validatorLogicalId = naming.getValidatorLogicalId('Test3', 'get');
          const methodLogicalId = naming.getMethodLogicalId('Test3', 'get');
          const methodResource = cfResources[methodLogicalId];

          expect(methodResource.Properties).to.have.property('RequestModels');
          expect(methodResource.Properties).to.have.property('RequestValidatorId');

          expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
            Ref: modelLogicalId,
          });

          expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
            Ref: validatorLogicalId,
          });

          const modelResource = cfResources[modelLogicalId];

          expect(modelResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Name: 'TestMethodModel',
              Description: 'Test Method Model Desc',
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });
        })
      ));

    it('should allow multiple schemas to be defined', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelJsonLogicalId = naming.getModelLogicalId('Test5', 'get', 'application/json');
          const modelPlainTextLogicalId = naming.getModelLogicalId('Test5', 'get', 'text/plain');
          const validatorLogicalId = naming.getValidatorLogicalId('Test5', 'get');
          const methodLogicalId = naming.getMethodLogicalId('Test5', 'get');
          const methodResource = cfResources[methodLogicalId];

          expect(methodResource.Properties).to.have.property('RequestModels');
          expect(methodResource.Properties).to.have.property('RequestValidatorId');

          expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
            Ref: modelJsonLogicalId,
          });

          expect(methodResource.Properties.RequestModels['text/plain']).to.deep.equal({
            Ref: modelPlainTextLogicalId,
          });

          expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
            Ref: validatorLogicalId,
          });

          const modelJsonResource = cfResources[modelJsonLogicalId];
          const modelPlainTextResource = cfResources[modelPlainTextLogicalId];

          expect(modelJsonResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });

          expect(modelPlainTextResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'text/plain',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: 'foo',
            },
          });
        })
      ));

    it('should support existing request:schema property for regression', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelLogicalId = naming.getModelLogicalId('Test4', 'get', 'application/json');
          const validatorLogicalId = naming.getValidatorLogicalId('Test4', 'get');
          const methodLogicalId = naming.getMethodLogicalId('Test4', 'get');
          const methodResource = cfResources[methodLogicalId];

          expect(methodResource.Properties).to.have.property('RequestModels');
          expect(methodResource.Properties).to.have.property('RequestValidatorId');

          expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
            Ref: modelLogicalId,
          });

          expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
            Ref: validatorLogicalId,
          });

          const modelResource = cfResources[modelLogicalId];

          expect(modelResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });
        })
      ));

    it('should support multiple request:schema property for regression', () =>
      fixtures.extend('requestSchema', {}).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(serverless => {
          const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
          const naming = serverless.getProvider('aws').naming;
          const modelJsonLogicalId = naming.getModelLogicalId('Test6', 'get', 'application/json');
          const modelPlainTextLogicalId = naming.getModelLogicalId('Test6', 'get', 'text/plain');
          const validatorLogicalId = naming.getValidatorLogicalId('Test6', 'get');
          const methodLogicalId = naming.getMethodLogicalId('Test6', 'get');
          const methodResource = cfResources[methodLogicalId];

          expect(methodResource.Properties).to.have.property('RequestModels');
          expect(methodResource.Properties).to.have.property('RequestValidatorId');

          expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
            Ref: modelJsonLogicalId,
          });

          expect(methodResource.Properties.RequestModels['text/plain']).to.deep.equal({
            Ref: modelPlainTextLogicalId,
          });

          expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
            Ref: validatorLogicalId,
          });

          const modelJsonResource = cfResources[modelJsonLogicalId];
          const modelPlainTextResource = cfResources[modelPlainTextLogicalId];

          expect(modelJsonResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'application/json',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                definitions: {},
                properties: {
                  id: {
                    pattern: '[0-9]+',
                    title: 'ID for object',
                    type: 'number',
                  },
                },
                required: ['id'],
                title: 'Test Validation Schema',
                type: 'object',
              },
            },
          });

          expect(modelPlainTextResource).to.deep.equal({
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              ContentType: 'text/plain',
              RestApiId: {
                Ref: 'ApiGatewayRestApi',
              },
              Schema: 'foo',
            },
          });
        })
      ));
  });
});
