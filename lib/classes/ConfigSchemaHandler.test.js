'use strict';

const expect = require('chai').expect;
const ConfigSchemaHandler = require('./ConfigSchemaHandler');
const Serverless = require('../Serverless');
const { ServerlessError } = require('../classes/Error');
const runServerless = require('../../tests/utils/run-serverless');
const fixtures = require('../../tests/fixtures');

describe('ConfigSchemaHandler', () => {
  describe('#constructor', () => {
    it('should have schema property', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      expect(configSchemaHandler.schema).to.be.instanceOf(Object);
    });

    it('should have serverless property', () => {
      const serverless = new Serverless();
      const configSchemaHandler = new ConfigSchemaHandler(serverless);
      expect(configSchemaHandler.serverless).to.be.instanceOf(Serverless);
    });

    it('should freeze parts of schema', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const throwables = [
        () => {
          configSchemaHandler.defineProvider('someProvider');
          configSchemaHandler.schema.properties.newProp = { foo: 'bar' };
        },
        () => {
          configSchemaHandler.schema.properties.service.name = 'changed';
        },
        () => {
          configSchemaHandler.schema.properties.plugins.properties = 'changed';
        },
        () => {
          configSchemaHandler.schema.properties.plugins.properties.items = {
            type: 'object',
            properties: { newProp: { type: 'string' } },
          };
        },
        () => {
          configSchemaHandler.schema.properties.resources.anyOf[1].properties = {
            oneMore: { type: 'string' },
          };
        },
        () => {
          configSchemaHandler.schema.properties.package.properties.oneMore = { type: 'string' };
        },
        () => {
          configSchemaHandler.schema.properties.layers.properties = 'changed';
        },
      ];
      for (const throwable of throwables) {
        expect(throwable).to.throw(Error);
      }
    });
  });

  describe('#validateConfig', () => {
    it('should throw error for invalid config when config validation mode is set to error', () => {
      return fixtures
        .extend('validation', {
          service: { name: '1-invalid-name' },
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['info', '--configValidationMode', 'error'],
          })
            .then(() => expect(false).to.be.true)
            .catch(err => {
              expect(err).to.be.instanceOf(ServerlessError);
              expect(err.message).to.contain(
                '.service.name should match pattern "^[a-zA-Z][0-9a-zA-Z-]+$"'
              );
            })
        );
    });
  });

  describe('#defineFunctionEvent', () => {
    it('should extend schema with defineFunctionEvent method', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const newEventSchema = {
        type: 'string',
      };
      configSchemaHandler.defineFunctionEvent('newEvent', newEventSchema);
      const expectedPieceOfSchema = {
        type: 'object',
        properties: { newEvent: { type: 'string' } },
        required: ['newEvent'],
        additionalProperties: false,
      };
      expect(
        configSchemaHandler.schema.properties.functions.patternProperties['^[a-zA-Z0-9-_]+$']
          .properties.events.items.anyOf[0]
      ).to.deep.equal(expectedPieceOfSchema);
    });
  });

  describe('#defineCustomProperty', () => {
    it('should extend schema with defineCustomProperty method', () => {
      const configSchemaHandler = new ConfigSchemaHandler();
      const newCustomPropSchema = {
        type: 'string',
      };
      configSchemaHandler.defineCustomProperty('newCustomProp', newCustomPropSchema);
      expect(configSchemaHandler.schema.properties.custom.properties.newCustomProp).to.deep.equal(
        newCustomPropSchema
      );
    });
  });
});
