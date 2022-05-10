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
      const template =
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[methodLogicalId];
      let validatorLogicalId;

      if (
        event.http.request &&
        event.http.request.parameters &&
        // check if any parameters are marked as required
        Object.values(event.http.request.parameters || {}).some((x) => {
          if (!_.isObject(x)) return x;
          return x.required != null ? x.required : true;
        })
      ) {
        if (!validatorLogicalId) {
          const requestValidator = this.createRequestValidator();
          validatorLogicalId = requestValidator.validatorLogicalId;
        }

        template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
      }

      if (event.http.request && event.http.request.schemas) {
        for (const [contentType, schemaConfig] of _.entries(event.http.request.schemas)) {
          let modelLogicalId;

          const referencedDefinitionFromProvider =
            !_.isObject(schemaConfig) && _.get(apiGatewayConfig, `request.schemas.${schemaConfig}`);

          if (!validatorLogicalId) {
            const requestValidator = this.createRequestValidator();
            validatorLogicalId = requestValidator.validatorLogicalId;
          }

          if (referencedDefinitionFromProvider) {
            modelLogicalId = this.createProviderModel(
              schemaConfig,
              apiGatewayConfig.request.schemas[schemaConfig]
            );
          } else {
            // In this situation, we have two options - schema is defined as string that does not reference model from provider or as an object
            let modelName;
            let description;
            let definition;

            if (_.isObject(schemaConfig)) {
              if (schemaConfig.schema) {
                // In this case, schema is defined as an object with explicit properties
                modelName = schemaConfig.name;
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
              }
            );
          }

          template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
          template.Properties.RequestModels = template.Properties.RequestModels || {};
          template.Properties.RequestModels[contentType] = { Ref: modelLogicalId };
        }
      }
    });
  },

  createProviderModel(schemaId, schemaConfig) {
    let modelName;
    let description;
    let definition;

    // If schema is not defined this will try to map resourceDefinition as the schema
    if (!schemaConfig.schema) {
      definition = schemaConfig;
    } else {
      definition = schemaConfig.schema;
    }

    const modelLogicalId = this.provider.naming.getModelLogicalId(schemaId);

    if (schemaConfig.name) {
      modelName = schemaConfig.name;
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
    });

    if (modelName) {
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        modelLogicalId
      ].Properties.Name = modelName;
    }

    if (description) {
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        modelLogicalId
      ].Properties.Description = description;
    }
    return modelLogicalId;
  },

  createRequestValidator() {
    const validatorLogicalId = this.provider.naming.getValidatorLogicalId();
    const validatorName = `${
      this.serverless.service.service
    }-${this.provider.getStage()} | Validate request body and querystring parameters`;
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources[validatorLogicalId] =
      {
        Type: 'AWS::ApiGateway::RequestValidator',
        Properties: {
          RestApiId: this.provider.getApiGatewayRestApiId(),
          ValidateRequestBody: true,
          ValidateRequestParameters: true,
          Name: validatorName,
        },
      };
    return {
      validatorLogicalId,
      validatorName,
    };
  },
};
