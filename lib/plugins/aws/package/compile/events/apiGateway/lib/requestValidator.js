let _ = require('lodash')
let BbPromise = require("bluebird")
module.exports = {
  compileRequestValidators() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};
    let models = {};
    // Models are defined in the provider and can be used in http events later
    if (apiGateway.requestSchemas) {
      for (const [schemaId, schemaConfig] of _.entries(apiGateway.requestSchemas)) {
        let name;
        let description;
        let definition;

        // If schema is not defined this will try to map resourceDefinition as the schema
        if (!schemaConfig.schema) {
          definition = schemaConfig;
        } else {
          definition = schemaConfig.schema;
        }

        console.error(_.upperFirst(_.camelCase(schemaId)));
        const resourceName = _.upperFirst(_.camelCase(schemaId));
        modelLogicalId = this.provider.naming.getModelLogicalId(
          resourceName,
          "any",
          "application/json"
        );

        validatorLogicalId = this.provider.naming.getValidatorLogicalId(
          resourceName,
          "any"
        );

        if (schemaConfig.name) {
          name = schemaConfig.name;
        }

        if (schemaConfig.description) {
          description = schemaConfig.description;
        }

        models = apiGateway.models || {};
        models[schemaId] = {
          modelLogicalId,
          validatorLogicalId,
        };

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [modelLogicalId]: {
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
              Schema: definition,
              ContentType: 'application/json',
              Name: name,
              Description: description,
            },
          },
          [validatorLogicalId]: {
            Type: 'AWS::ApiGateway::RequestValidator',
            Properties: {
              RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
              ValidateRequestBody: true,
              ValidateRequestParameters: true,
              Name: `${name}Validator`,
            },
          },
        });
      }
    }
    this.validated.events.forEach(event => {
      const resourceName = this.getResourceName(event.http.path);
      const methodLogicalId = this.provider.naming.getMethodLogicalId(
        resourceName,
        event.http.method
      );

      let template = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[methodLogicalId];

      //Old functionality
      if (event.http.request && event.http.request.schema) {
        for (const [contentType, schema] of _.entries(event.http.request.schema)) {

          const modelLogicalId = this.provider.naming.getModelLogicalId(
            resourceName,
            event.http.method,
            contentType
          );

          template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
          template.Properties.RequestModels = template.Properties.RequestModels || {};
          template.Properties.RequestModels[contentType] = { Ref: modelLogicalId };

          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
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

      //New Functionality
      if (event.http.requestSchema) {
        for (const [contentType, schemaConfig] of _.entries(event.http.requestSchema)) {
          console.error(contentType);
          let modelName;
          let description;
          let definition;
          let validatorName;

          if (schemaConfig.schema) {
            modelName = schemaConfig.name ? schemaConfig.name : null;
            validatorName = modelName !== null ? (modelName + 'Validator') : null;
            description = schemaConfig.description ? schemaConfig.description : null;
            definition = schemaConfig.schema;
          }
          else {
            definition = schemaConfig
          }

          let modelLogicalId;
          let validatorLogicalId;

          // New resources need to be created
          if (typeof schemaConfig !== 'string' || !models[schemaConfig]) {
            modelLogicalId = this.provider.naming.getModelLogicalId(
              resourceName,
              event.http.method,
              contentType
            );

            validatorLogicalId = this.provider.naming.getValidatorLogicalId(
              resourceName,
              event.http.method
            );

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
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
                  ValidateRequestParameters: true
                },
              },
            });

            if(modelName != null) {
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources[modelLogicalId].Properties.Name = modelName
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources[validatorLogicalId].Properties.Name = validatorName
            }

            if(description != null) {
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources[modelLogicalId].Properties.Description = description
            }

          } else {
            modelLogicalId = models[schema].modelLogicalId;
            validatorLogicalId = models[schema].validatorLogicalId;
          }

          template.Properties.RequestValidatorId = { Ref: validatorLogicalId };
          template.Properties.RequestModels = template.Properties.RequestModels || {};
          template.Properties.RequestModels[contentType] = { Ref: modelLogicalId };
        }
      }
    });
  }
}
