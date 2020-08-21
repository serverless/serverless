'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../../../../tests/fixtures');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

describe('#compileRequestValidators()', () => {
  let serverlessInstance;

  before(() => {
    return Promise.resolve(
      runServerless({
        cwd: fixtures.map.requestSchema,
        cliArgs: ['package'],
      })
    ).then(serverless => (serverlessInstance = serverless));
  });

  after(() => {
    fixtures.cleanup();
  });

  describe(' reusable schemas ', () => {
    it('Should process schema from apiGateway provider, full config', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getModelLogicalId('TestModel');
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
    });

    it('Should process schema from apiGateway provider, missing name and description', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getModelLogicalId('TestModelSimple');
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
    });

    it('Should not create a model that is never referenced in the events', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getModelLogicalId('UnusedModel');
      const modelResource = cfResources[modelLogicalId] || null;

      expect(modelResource).to.be.null;
    });
  });

  describe('functionConfiguration', () => {
    /** We have already validated that Models exist in the API Provider so this test will
     ** ensure the model can be referenced in the http requestSchema. i.e. not running expect against
     ** api provider models
     **/
    it('should reference model from provider:apiGateway:requestSchemas', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getModelLogicalId('test-model');
      const validatorLogicalId = naming.getValidatorLogicalId(modelLogicalId);
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
    });

    it('should create a new model from a schema only', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getEndpointModelLogicalId('Test2', 'get', 'application/json');
      const validatorLogicalId = naming.getValidatorLogicalId(naming.getModelLogicalId('Test2'));
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
    });

    it('should create a new model from a schma with name and description', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getEndpointModelLogicalId('Test3', 'get', 'application/json');
      const validatorLogicalId = naming.getValidatorLogicalId(naming.getModelLogicalId('Test3'));
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
    });

    it('should allow multiple schemas to be defined', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelJsonLogicalId = naming.getEndpointModelLogicalId(
        'Test5',
        'get',
        'application/json'
      );
      const modelPlainTextLogicalId = naming.getEndpointModelLogicalId(
        'Test5',
        'get',
        'text/plain'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(naming.getModelLogicalId('Test5'));
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
    });

    it('should support existing request:schema property for regression', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelLogicalId = naming.getEndpointModelLogicalId('Test4', 'get', 'application/json');
      const validatorLogicalId = naming.getValidatorLogicalId(naming.getModelLogicalId('Test4'));
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
    });

    it('should support multiple request:schema property for regression', () => {
      const cfResources =
        serverlessInstance.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverlessInstance.serverless.getProvider('aws').naming;
      const modelJsonLogicalId = naming.getEndpointModelLogicalId(
        'Test6',
        'get',
        'application/json'
      );
      const modelPlainTextLogicalId = naming.getEndpointModelLogicalId(
        'Test6',
        'get',
        'text/plain'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(naming.getModelLogicalId('Test6'));
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
    });
  });
});
