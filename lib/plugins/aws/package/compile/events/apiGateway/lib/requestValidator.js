'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRequestValidators() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};
    const models = {};
    // Models are defined in the provider and can be used in http events later
    if (apiGateway.requestSchemas) {
      for (const [schemaId, schemaConfig] of _.entries(apiGateway.requestSchemas)) {
        let modelName;
        let validatorName;
        let description;
        let definition;

        // If schema is not defined this will try to map resourceDefinition as the schema
        if (!schemaConfig.schema) {
          definition = schemaConfig;
        } else {
          definition = schemaConfig.schema;
        }

        const modelLogicalId = this.provider.naming.getModelLogicalId(schemaId);

        const validatorLogicalId = this.provider.naming.getValidatorLogicalId(modelLogicalId);

        if (schemaConfig.name) {
          modelName = schemaConfig.name;
          validatorName = `${modelName}Validator`;
        }

        if (schemaConfig.description) {
          description = schemaConfig.description;
        }

        models[schemaId] = {
          modelLogicalId,
          validatorLogicalId,
        };

        Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [modelLogicalId]: {
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
              Schema: definition,
              ContentType: 'application/json',
            },
          },
          [validatorLogicalId]: {
            Type: 'AWS::ApiGateway::RequestValidator',
            Properties: {
              RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
              ValidateRequestBody: true,
              ValidateRequestParameters: true,
            },
          },
        });

        if (modelName) {
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            modelLogicalId
          ].Properties.Name = modelName;
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            validatorLogicalId
          ].Properties.Name = validatorName;
        }

        if (description) {
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            modelLogicalId
          ].Properties.Description = description;
        }
      }
    }
    this.validated.events.forEach(event => {
      const resourceName = this.getResourceName(event.http.path);
      const methodLogicalId = this.provider.naming.getMethodLogicalId(
        resourceName,
        event.http.method
      );

      // Old functionality
      if (event.http.request && event.http.request.schema) {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          methodLogicalId
        ];
        for (const [contentType, schema] of _.entries(event.http.request.schema)) {
          const modelLogicalId = this.provider.naming.getEndpointModelLogicalId(
            resourceName,
            event.http.method,
            contentType
          );

          const validatorLogicalId = this.provider.naming.getValidatorLogicalId(
            this.provider.naming.getModelLogicalId(resourceName)
          );

          template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
          template.Properties.RequestModels = template.Properties.RequestModels || {};
          template.Properties.RequestModels[contentType] = { Ref: modelLogicalId };

          Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
            [modelLogicalId]: {
              Type: 'AWS::ApiGateway::Model',
              Properties: {
                RestApiId: this.provider.getApiGatewayRestApiId(),
                ContentType: contentType,
                Schema: schema,
              },
            },
            [validatorLogicalId]: {
              Type: 'AWS::ApiGateway::RequestValidator',
              Properties: {
                RestApiId: this.provider.getApiGatewayRestApiId(),
                ValidateRequestBody: true,
                ValidateRequestParameters: true,
              },
            },
          });
        }
      } else if (event.http.requestSchema) {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          methodLogicalId
        ];
        for (const [contentType, schemaConfig] of _.entries(event.http.requestSchema)) {
          let modelName;
          let description;
          let definition;
          let validatorName;

          if (schemaConfig.schema) {
            modelName = schemaConfig.name ? schemaConfig.name : null;
            validatorName = modelName ? `${modelName}Validator` : null;
            description = schemaConfig.description ? schemaConfig.description : null;
            definition = schemaConfig.schema;
          } else {
            definition = schemaConfig;
          }

          let modelLogicalId;
          let validatorLogicalId;

          // New resources need to be created
          if (_.isObject(schemaConfig) || !models[schemaConfig]) {
            modelLogicalId = this.provider.naming.getEndpointModelLogicalId(
              resourceName,
              event.http.method,
              contentType
            );

            validatorLogicalId = this.provider.naming.getValidatorLogicalId(
              this.provider.naming.getModelLogicalId(resourceName)
            );

            Object.assign(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              {
                [modelLogicalId]: {
                  Type: 'AWS::ApiGateway::Model',
                  Properties: {
                    RestApiId: this.provider.getApiGatewayRestApiId(),
                    ContentType: contentType,
                    Schema: definition,
                  },
                },

                [validatorLogicalId]: {
                  Type: 'AWS::ApiGateway::RequestValidator',
                  Properties: {
                    RestApiId: this.provider.getApiGatewayRestApiId(),
                    ValidateRequestBody: true,
                    ValidateRequestParameters: true,
                  },
                },
              }
            );

            if (modelName) {
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
                modelLogicalId
              ].Properties.Name = modelName;
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
                validatorLogicalId
              ].Properties.Name = validatorName;
            }

            if (description) {
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
                modelLogicalId
              ].Properties.Description = description;
            }
          } else if (models[schemaConfig]) {
            modelLogicalId = models[schemaConfig].modelLogicalId;
            validatorLogicalId = models[schemaConfig].validatorLogicalId;
          }

          template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
          template.Properties.RequestModels = template.Properties.RequestModels || {};
          template.Properties.RequestModels[contentType] = { Ref: modelLogicalId };
        }
      }
    });

    return BbPromise.resolve();
  },
};
