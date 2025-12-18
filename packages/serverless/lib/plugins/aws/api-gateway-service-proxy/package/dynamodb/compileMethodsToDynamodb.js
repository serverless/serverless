import _ from 'lodash'

const exported = {
  compileMethodsToDynamodb() {
    this.validated.events.forEach((event) => {
      if (event.serviceName == 'dynamodb') {
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
          this.getDynamodbMethodIntegration(event.http),
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

  getDynamodbMethodIntegration(http) {
    const integration = {
      IntegrationHttpMethod: 'POST',
      Type: 'AWS',
      Credentials: {
        'Fn::GetAtt': ['ApigatewayToDynamodbRole', 'Arn'],
      },
      Uri: {
        'Fn::Sub': [
          'arn:${AWS::Partition}:apigateway:${AWS::Region}:dynamodb:action/${action}',
          { action: http.action },
        ],
      },
      PassthroughBehavior: 'NEVER',
      RequestParameters: this.getDynamodbIntegrationRequestParameters(http),
      RequestTemplates: this.getDynamodbIntegrationRequestTemplates(http),
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
            ResponseTemplates: this.getDynamodbResponseTemplates(
              http,
              'success',
            ),
          },
          {
            StatusCode: 400,
            SelectionPattern: 400,
            ResponseParameters: {},
            ResponseTemplates: this.getDynamodbResponseTemplates(
              http,
              'clientError',
            ),
          },
          {
            StatusCode: 500,
            SelectionPattern: 500,
            ResponseParameters: {},
            ResponseTemplates: this.getDynamodbResponseTemplates(
              http,
              'serverError',
            ),
          },
        ],
      }
    } else if (_.isArray(http.response)) {
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
            SelectionPattern: '2\\d{2}',
            ResponseParameters: {},
            ResponseTemplates: this.getDefaultDynamodbResponseTemplates(
              http,
              'success',
            ),
          },
          {
            StatusCode: 400,
            SelectionPattern: '4\\d{2}',
            ResponseParameters: {},
            ResponseTemplates: {},
          },
          {
            StatusCode: 500,
            SelectionPattern: '5\\d{2}',
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

  getDynamodbIntegrationRequestTemplates(http) {
    const defaultRequestTemplates =
      this.buildDefaultDynamodbRequestTemplates(http)
    return Object.assign(
      defaultRequestTemplates,
      _.get(http, ['request', 'template']),
    )
  },

  buildDefaultDynamodbRequestTemplates(http) {
    return {
      'application/json': this.buildDefaultDynamodbRequestTemplate(http),
      'application/x-www-form-urlencoded':
        this.buildDefaultDynamodbRequestTemplate(http),
    }
  },

  getDynamodbIntegrationRequestParameters(http) {
    const defaultRequestParameters =
      this.buildDefaultDynamodbRequestParameters(http)
    return Object.assign(
      defaultRequestParameters,
      _.get(http, ['requestParameters']),
    )
  },

  buildDefaultDynamodbRequestParameters(http) {
    return _.merge({}, http.requestParameters)
  },

  getDynamodbObjectHashkeyParameter(http) {
    if (http.hashKey.pathParam) {
      return {
        key: http.hashKey.pathParam,
        attributeType: http.hashKey.attributeType,
        attributeValue: `$input.params().path.${http.hashKey.pathParam}`,
      }
    }

    if (http.hashKey.queryStringParam) {
      return {
        key: http.hashKey.queryStringParam,
        attributeType: http.hashKey.attributeType,
        attributeValue: `$input.params().querystring.${http.hashKey.queryStringParam}`,
      }
    }
  },

  getDynamodbObjectRangekeyParameter(http) {
    if (http.rangeKey.pathParam) {
      return {
        key: http.rangeKey.pathParam,
        attributeType: http.rangeKey.attributeType,
        attributeValue: `$input.params().path.${http.rangeKey.pathParam}`,
      }
    }

    if (http.rangeKey.queryStringParam) {
      return {
        key: http.rangeKey.queryStringParam,
        attributeType: http.rangeKey.attributeType,
        attributeValue: `$input.params().querystring.${http.rangeKey.queryStringParam}`,
      }
    }
  },

  getDynamodbResponseTemplates(http, statusType) {
    const template = _.get(http, ['response', 'template', statusType])
    return Object.assign(
      {},
      template && {
        'application/json': template,
        'application/x-www-form-urlendcoded': template,
      },
    )
  },

  getDefaultDynamodbResponseTemplates(http) {
    if (http.action === 'GetItem') {
      return {
        'application/json': this.getGetItemDefaultDynamodbResponseTemplate(),
        'application/x-www-form-urlencoded':
          this.getGetItemDefaultDynamodbResponseTemplate(),
      }
    }

    return {}
  },

  getGetItemDefaultDynamodbResponseTemplate() {
    return '#set($item = $input.path(\'$.Item\')){#foreach($key in $item.keySet())#set ($value = $item.get($key))#foreach( $type in $value.keySet())"$key":"$value.get($type)"#if($foreach.hasNext()),#end#end#if($foreach.hasNext()),#end#end}'
  },

  buildDefaultDynamodbRequestTemplate(http) {
    switch (http.action) {
      case 'PutItem':
        return this.buildDefaultDynamodbPutItemRequestTemplate(http)
      case 'GetItem':
        return this.buildDefaultDynamodbGetItemRequestTemplate(http)
      case 'DeleteItem':
        return this.buildDefaultDynamodbDeleteItemRequestTemplate(http)
    }
  },

  buildDefaultDynamodbDeleteItemRequestTemplate(http) {
    const fuSubValues = {
      TableName: http.tableName,
    }

    let requestTemplate = '{"TableName": "${TableName}","Key":{'
    if (_.has(http, 'hashKey')) {
      requestTemplate +=
        '"${HashKey}": {"${HashAttributeType}": "${HashAttributeValue}"}'
      Object.assign(fuSubValues, this.getDynamodbHashkeyFnSubValues(http))
    }

    if (_.has(http, 'rangeKey')) {
      requestTemplate +=
        ',"${RangeKey}": {"${RangeAttributeType}": "${RangeAttributeValue}"}'
      Object.assign(fuSubValues, this.getDynamodbRangekeyFnSubValues(http))
    }
    requestTemplate += '}'
    if (_.has(http, 'condition')) {
      requestTemplate += ',"ConditionExpression": "${ConditionExpression}"'
      fuSubValues['ConditionExpression'] = http.condition
    }
    requestTemplate += '}'
    return {
      'Fn::Sub': [`${requestTemplate}`, fuSubValues],
    }
  },

  buildDefaultDynamodbGetItemRequestTemplate(http) {
    const fuSubValues = {
      TableName: http.tableName,
    }

    let requestTemplate = '{"TableName": "${TableName}","Key":{'
    if (_.has(http, 'hashKey')) {
      requestTemplate +=
        '"${HashKey}": {"${HashAttributeType}": "${HashAttributeValue}"}'
      Object.assign(fuSubValues, this.getDynamodbHashkeyFnSubValues(http))
    }

    if (_.has(http, 'rangeKey')) {
      requestTemplate +=
        ',"${RangeKey}": {"${RangeAttributeType}": "${RangeAttributeValue}"}'
      Object.assign(fuSubValues, this.getDynamodbRangekeyFnSubValues(http))
    }

    requestTemplate += '}}'
    return {
      'Fn::Sub': [`${requestTemplate}`, fuSubValues],
    }
  },

  buildDefaultDynamodbPutItemRequestTemplate(http) {
    const fuSubValues = {
      TableName: http.tableName,
    }

    let requestTemplate = '{"TableName": "${TableName}","Item": {'
    if (_.has(http, 'hashKey')) {
      requestTemplate +=
        '"${HashKey}": {"${HashAttributeType}": "${HashAttributeValue}"},'
      Object.assign(fuSubValues, this.getDynamodbHashkeyFnSubValues(http))
    }

    if (_.has(http, 'rangeKey')) {
      requestTemplate +=
        '"${RangeKey}": {"${RangeAttributeType}": "${RangeAttributeValue}"},'
      Object.assign(fuSubValues, this.getDynamodbRangekeyFnSubValues(http))
    }

    requestTemplate += `
      #set ($body = $util.parseJson($input.body))
      #foreach( $key in $body.keySet())
        #set ($item = $body.get($key))
        #foreach( $type in $item.keySet())
          "$key":{"$type" : "$item.get($type)"}
        #if($foreach.hasNext()),#end
        #end
      #if($foreach.hasNext()),#end
      #end
    }
    `
    if (_.has(http, 'condition')) {
      requestTemplate += ',"ConditionExpression": "${ConditionExpression}"'
      fuSubValues['ConditionExpression'] = http.condition
    }

    requestTemplate += '}'
    return {
      'Fn::Sub': [`${requestTemplate}`, fuSubValues],
    }
  },

  getDynamodbHashkeyFnSubValues(http) {
    const objectHashKeyParam = this.getDynamodbObjectHashkeyParameter(http)
    return {
      HashKey: objectHashKeyParam.key,
      HashAttributeType: objectHashKeyParam.attributeType,
      HashAttributeValue: objectHashKeyParam.attributeValue,
    }
  },

  getDynamodbRangekeyFnSubValues(http) {
    const objectRangeKeyParam = this.getDynamodbObjectRangekeyParameter(http)
    return {
      RangeKey: objectRangeKeyParam.key,
      RangeAttributeType: objectRangeKeyParam.attributeType,
      RangeAttributeValue: objectRangeKeyParam.attributeValue,
    }
  },
}

export default exported
