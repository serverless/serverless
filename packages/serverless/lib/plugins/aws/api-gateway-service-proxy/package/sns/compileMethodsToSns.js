import _ from 'lodash'

const exported = {
  compileMethodsToSns() {
    this.validated.events.forEach((event) => {
      if (event.serviceName == 'sns') {
        const resourceId = this.getResourceId(event.http.path)
        const resourceName = this.getResourceName(event.http.path)

        const template = {
          Type: 'AWS::ApiGateway::Method',
          Properties: {
            HttpMethod: event.http.method.toUpperCase(),
            RequestParameters: event.http.acceptParameters || {},
            AuthorizationType: event.http.auth.authorizationType,
            AuthorizationScopes: event.http.auth.authorizationScopes,
            AuthorizerId: event.http.auth.authorizerId,
            ApiKeyRequired: Boolean(event.http.private),
            ResourceId: resourceId,
            RestApiId: this.provider.getApiGatewayRestApiId(),
          },
        }

        _.merge(
          template,
          this.getSnsMethodIntegration(event.http),
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

  getSnsMethodIntegration(http) {
    const roleArn = http.roleArn || {
      'Fn::GetAtt': ['ApigatewayToSnsRole', 'Arn'],
    }

    const integration = {
      IntegrationHttpMethod: 'POST',
      Type: 'AWS',
      Credentials: roleArn,
      Uri: {
        'Fn::Sub': 'arn:${AWS::Partition}:apigateway:${AWS::Region}:sns:path//',
      },
      PassthroughBehavior: 'NEVER',
      RequestParameters: {
        'integration.request.header.Content-Type':
          "'application/x-www-form-urlencoded'",
      },
      RequestTemplates: this.getSnsIntegrationRequestTemplates(http),
    }

    if ('request' in http) {
      if ('passThrough' in http.request) {
        integration.PassthroughBehavior = http.request.passThrough
      }
      if ('contentHandling' in http.request) {
        integration.ContentHandling = http.request.contentHandling
      }
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
            ResponseTemplates: this.getSnsIntegrationResponseTemplate(
              http,
              'success',
            ),
          },
          {
            StatusCode: 400,
            SelectionPattern: 400,
            ResponseParameters: {},
            ResponseTemplates: this.getSnsIntegrationResponseTemplate(
              http,
              'clientError',
            ),
          },
          {
            StatusCode: 500,
            SelectionPattern: 500,
            ResponseParameters: {},
            ResponseTemplates: this.getSnsIntegrationResponseTemplate(
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

  getSnsIntegrationRequestTemplates(http) {
    const defaultRequestTemplates = this.getDefaultSnsRequestTemplates(http)
    return Object.assign(
      defaultRequestTemplates,
      _.get(http, ['request', 'template']),
    )
  },

  getDefaultSnsRequestTemplates(http) {
    return {
      'application/json': this.buildDefaultSnsRequestTemplate(http),
      'application/x-www-form-urlencoded':
        this.buildDefaultSnsRequestTemplate(http),
    }
  },

  buildDefaultSnsRequestTemplate(http) {
    const { topicName } = http

    const topicArn = {
      'Fn::Sub': [
        'arn:${AWS::Partition}:sns:${AWS::Region}:${AWS::AccountId}:${topicName}',
        { topicName },
      ],
    }

    return {
      'Fn::Join': [
        '',
        [
          "Action=Publish&Message=$util.urlEncode($input.body)&TopicArn=$util.urlEncode('",
          topicArn,
          "')",
        ],
      ],
    }
  },

  getSnsIntegrationResponseTemplate(http, statusType) {
    const template = _.get(http, ['response', 'template', statusType])
    return Object.assign({}, template && { 'application/json': template })
  },
}

export default exported
