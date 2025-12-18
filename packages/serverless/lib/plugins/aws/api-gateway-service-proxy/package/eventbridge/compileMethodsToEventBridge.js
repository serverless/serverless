import _ from 'lodash'

const exported = {
  compileMethodsToEventBridge() {
    this.validated.events.forEach((event) => {
      if (event.serviceName == 'eventbridge') {
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
          this.getEventBridgeMethodIntegration(event.http),
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

  getEventBridgeMethodIntegration(http) {
    const roleArn = http.roleArn || {
      'Fn::GetAtt': ['ApigatewayToEventBridgeRole', 'Arn'],
    }

    const integration = {
      IntegrationHttpMethod: 'POST',
      Type: 'AWS',
      Credentials: roleArn,
      Uri: {
        'Fn::Sub':
          'arn:${AWS::Partition}:apigateway:${AWS::Region}:events:action/PutEvents',
      },
      PassthroughBehavior: 'NEVER',
      RequestParameters: {
        'integration.request.header.X-Amz-Target': "'AWSEvents.PutEvents'",
        'integration.request.header.Content-Type':
          "'application/x-amz-json-1.1'",
      },
      RequestTemplates: this.getEventBridgeIntegrationRequestTemplates(http),
    }

    const integrationResponse = {
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

    this.addCors(http, integrationResponse)

    _.merge(integration, integrationResponse)

    return {
      Properties: {
        Integration: integration,
      },
    }
  },

  getEventBridgeIntegrationRequestTemplates(http) {
    const defaultRequestTemplates =
      this.getDefaultEventBridgeRequestTemplates(http)
    return Object.assign(
      defaultRequestTemplates,
      _.get(http, ['request', 'template']),
    )
  },

  getDefaultEventBridgeRequestTemplates(http) {
    return {
      'application/json': this.buildDefaultEventBridgeRequestTemplate(http),
      'application/x-www-form-urlencoded':
        this.buildDefaultEventBridgeRequestTemplate(http),
    }
  },

  getEventBridgeSource(http) {
    if (!_.has(http, 'source')) {
      return ''
    }

    if (http.source.pathParam) {
      return `$input.params().path.${http.source.pathParam}`
    }

    if (http.source.queryStringParam) {
      return `$input.params().querystring.${http.source.queryStringParam}`
    }

    if (http.source.bodyParam) {
      return `$util.parseJson($input.body).${http.source.bodyParam}`
    }

    return `${http.source}`
  },

  getEventBridgeDetailType(http) {
    if (!_.has(http, 'detailType')) {
      return '$context.requestId'
    }

    if (http.detailType.pathParam) {
      return `$input.params().path.${http.detailType.pathParam}`
    }

    if (http.detailType.queryStringParam) {
      return `$input.params().querystring.${http.detailType.queryStringParam}`
    }

    if (http.detailType.bodyParam) {
      return `$util.parseJson($input.body).${http.detailType.bodyParam}`
    }

    return `${http.detailType}`
  },

  getEventBridgeDetail(http) {
    if (!_.has(http, 'detail')) {
      return '$util.escapeJavaScript($input.body)'
    }

    if (http.detail.bodyParam) {
      return `$util.escapeJavaScript($util.parseJson($input.body).${http.detail.bodyParam})`
    }

    return '$util.escapeJavaScript($input.body)'
  },

  buildDefaultEventBridgeRequestTemplate(http) {
    const sourceParam = this.getEventBridgeSource(http)
    const detailTypeParam = this.getEventBridgeDetailType(http)
    const detailParam = this.getEventBridgeDetail(http)

    return {
      'Fn::Sub': [
        '{"Entries":[{"Detail": "${Detail}","DetailType": "${DetailType}","EventBusName": "${EventBusName}","Source": "${Source}"}]}',
        {
          EventBusName: http.eventBusName,
          Detail: `${detailParam}`,
          DetailType: `${detailTypeParam}`,
          Source: `${sourceParam}`,
        },
      ],
    }
  },
}

export default exported
