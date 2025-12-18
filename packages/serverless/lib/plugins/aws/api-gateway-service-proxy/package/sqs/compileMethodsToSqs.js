import _ from 'lodash'

const requestParameterIsQuerystring = (_value, parameter) =>
  parameter.trim().startsWith('integration.request.querystring.')

const exported = {
  compileMethodsToSqs() {
    this.validated.events.forEach((event) => {
      if (event.serviceName == 'sqs') {
        const resourceId = this.getResourceId(event.http.path)
        const resourceName = this.getResourceName(event.http.path)

        const template = {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: event.http.method.toUpperCase(),
            RequestParameters: event.http.acceptParameters || {},
            AuthorizationScopes: event.http.auth.authorizationScopes,
            AuthorizationType: event.http.auth.authorizationType,
            AuthorizerId: event.http.auth.authorizerId,
            ApiKeyRequired: Boolean(event.http.private),
            ResourceId: resourceId,
            RestApiId: this.provider.getApiGatewayRestApiId(),
          },
        }

        _.merge(
          template,
          this.getSqsMethodIntegration(event.http),
          this.getMethodResponses(event.http),
        )

        const methodLogicalId = this.provider.naming.getMethodLogicalId(
          resourceName,
          event.http.method,
        )

        this.apiGatewayMethodLogicalIds.push(methodLogicalId)

        _.merge(
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources,
          {
            [methodLogicalId]: template,
          },
        )
      }
    })
  },

  getSqsMethodIntegration(http) {
    const roleArn = http.roleArn || {
      'Fn::GetAtt': ['ApigatewayToSqsRole', 'Arn'],
    }

    const integration = {
      IntegrationHttpMethod: 'POST',
      Type: 'AWS',
      Credentials: roleArn,
      Uri: {
        'Fn::Sub': [
          'arn:${AWS::Partition}:apigateway:${AWS::Region}:sqs:path//${AWS::AccountId}/${queueName}',
          { queueName: http.queueName },
        ],
      },
    }

    const customRequestTemplates = _.get(http, ['request', 'template'])

    if (_.isEmpty(customRequestTemplates)) {
      integration.RequestParameters = _.merge(
        {
          'integration.request.querystring.Action': "'SendMessage'",
          'integration.request.querystring.MessageBody': 'method.request.body',
        },
        http.requestParameters,
      )
      integration.RequestTemplates = { 'application/json': '{statusCode:200}' }
    } else {
      integration.PassthroughBehavior = 'NEVER'
      integration.RequestParameters = _.merge(
        {
          'integration.request.header.Content-Type':
            "'application/x-www-form-urlencoded'",
        },
        _.omitBy(http.requestParameters, requestParameterIsQuerystring),
      )
      integration.RequestTemplates =
        this.getSqsIntegrationRequestTemplates(http)
    }

    let integrationResponse

    if (_.get(http.response, 'template.success')) {
      // support a simplified model
      integrationResponse = {
        IntegrationResponses: [
          {
            StatusCode: 200,
            SelectionPattern: 200,
            ResponseParameters: {},
            ResponseTemplates: this.getSQSIntegrationResponseTemplate(
              http,
              'success',
            ),
          },
          {
            StatusCode: 400,
            SelectionPattern: 400,
            ResponseParameters: {},
            ResponseTemplates: this.getSQSIntegrationResponseTemplate(
              http,
              'clientError',
            ),
          },
          {
            StatusCode: 500,
            SelectionPattern: 500,
            ResponseParameters: {},
            ResponseTemplates: this.getSQSIntegrationResponseTemplate(
              http,
              'serverError',
            ),
          },
        ],
      }
    } else if (_.isArray(http.response)) {
      // support full usage
      integrationResponse = {
        IntegrationResponses: http.response.map((i) => ({
          StatusCode: i.statusCode,
          SelectionPattern: i.selectionPattern || i.statusCode,
          ResponseParameters: i.responseParameters || {},
          ResponseTemplates: i.responseTemplates || {},
        })),
      }
    } else {
      integrationResponse = {
        IntegrationResponses: [
          {
            StatusCode: 200,
            SelectionPattern: 200,
            ResponseParameters: {},
            ResponseTemplates: {},
          },
          {
            StatusCode: 400,
            SelectionPattern: 400,
            ResponseParameters: {},
            ResponseTemplates: {},
          },
          {
            StatusCode: 500,
            SelectionPattern: 500,
            ResponseParameters: {},
            ResponseTemplates: {},
          },
        ],
      }
    }

    this.addCors(http, integrationResponse)

    _.merge(integration, integrationResponse)

    return {
      Properties: {
        Integration: integration,
      },
    }
  },

  getSqsIntegrationRequestTemplates(http) {
    const defaultRequestTemplates = this.getDefaultSqsRequestTemplates(http)
    const customRequestTemplates = _.get(http, ['request', 'template'])
    return Object.assign(defaultRequestTemplates, customRequestTemplates)
  },

  getDefaultSqsRequestTemplates() {
    return {
      'application/json': this.buildDefaultSqsRequestTemplate(),
    }
  },

  buildDefaultSqsRequestTemplate() {
    return 'Action=SendMessage&MessageBody=$util.urlEncode($input.body)'
  },

  getSQSIntegrationResponseTemplate(http, statusType) {
    const template = _.get(http, ['response', 'template', statusType])
    return Object.assign({}, template && { 'application/json': template })
  },
}

export default exported
