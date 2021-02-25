'use strict';

const _ = require('lodash');

module.exports = {
  compileRequestValidators() {
    const apiGatewayConfig = this.serverless.service.provider.apiGateway || {};

    this.validated.events.forEach((event) => {
      const resourceName = this.getResourceName(event.http.path);
      const methodLogicalId = this.provider.naming.getMethodLogicalId(
        resourceName,
        event.http.method
      );

      if (event.http.request && event.http.request.schemas) {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          methodLogicalId
        ];
        for (const [contentType, schemaConfig] of _.entries(event.http.request.schemas)) {
          let modelLogicalId;
          let validatorLogicalId;

          const referencedDefinitionFromProvider =
            !_.isObject(schemaConfig) && _.get(apiGatewayConfig, `request.schemas.${schemaConfig}`);

          if (referencedDefinitionFromProvider) {
            const models = this.createProviderModel(
              schemaConfig,
              apiGatewayConfig.request.schemas[schemaConfig]
            );
            modelLogicalId = models.modelLogicalId;
            validatorLogicalId = models.validatorLogicalId;
          } else {
            // In this situation, we have two options - schema is defined as string that does not reference model from provider or as an object
            let modelName;
            let description;
            let definition;
            let validatorName;

            if (_.isObject(schemaConfig)) {
              if (schemaConfig.schema) {
                // In this case, schema is defined as an object with explicit properties
                modelName = schemaConfig.name;
                validatorName = modelName ? `${modelName}Validator` : null;
                description = schemaConfig.description;
                definition = schemaConfig.schema;
              } else {
                // In this case, schema is defined as an implicit object that stores whole schema definition
                definition = schemaConfig;
              }
            } else {
              // In this case, schema is defined as an implicit string
              definition = schemaConfig;
            }

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
                    Name: modelName,
                    Description: description,
                  },
                },

                [validatorLogicalId]: {
                  Type: 'AWS::ApiGateway::RequestValidator',
                  Properties: {
                    RestApiId: this.provider.getApiGatewayRestApiId(),
                    ValidateRequestBody: true,
                    ValidateRequestParameters: true,
                    Name: validatorName,
                  },
                },
              }
            );
          }

          template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
          template.Properties.RequestModels = template.Properties.RequestModels || {};
          template.Properties.RequestModels[contentType] = { Ref: modelLogicalId };
        }
      } else if (event.http.request && event.http.request.schema) {
        // Old functionality
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
      }
    });
  },

  createProviderModel(schemaId, schemaConfig) {
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
    return {
      modelLogicalId,
      validatorLogicalId,
    };
  },
};
