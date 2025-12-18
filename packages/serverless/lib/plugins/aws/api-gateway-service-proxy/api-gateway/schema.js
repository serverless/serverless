import _ from 'lodash'

const customErrorBuilder = (type, message) => (errors) => {
  for (const error of errors) {
    switch (error.code || error.type) {
      case type:
        error.message = _.isFunction(message) ? message(error) : message
        break
      default:
        break
    }
  }
  return errors
}

import Joi from 'joi'

const path = Joi.string().required()

const method = Joi.string()
  .required()
  .valid('get', 'post', 'put', 'patch', 'options', 'head', 'delete', 'any')
  .insensitive()

const privateField = Joi.boolean().default(false)

const cors = Joi.alternatives().try(
  Joi.boolean(),
  Joi.object({
    headers: Joi.array().items(Joi.string()),
    origin: Joi.string(),
    origins: Joi.array().items(Joi.string()),
    methods: Joi.array().items(method),
    maxAge: Joi.number().min(1),
    cacheControl: Joi.string(),
    allowCredentials: Joi.boolean(),
  })
    .oxor('origin', 'origins') // can have one of them, but not required
    .error(
      customErrorBuilder(
        'object.oxor',
        '"cors" can have "origin" or "origins" but not both',
      ),
    ),
)

const authorizerId = Joi.alternatives().try(
  Joi.string(),
  Joi.object().keys({
    Ref: Joi.string().required(),
  }),
)

const authorizationScopes = Joi.array()

// https://hapi.dev/family/joi/?v=15.1.0#anywhencondition-options
const authorizationType = Joi.alternatives().conditional('authorizerId', {
  is: authorizerId.required(),
  then: Joi.string().valid('CUSTOM', 'COGNITO_USER_POOLS').required(),
  otherwise: Joi.alternatives().conditional('authorizationScopes', {
    is: authorizationScopes.required(),
    then: Joi.string().valid('COGNITO_USER_POOLS').required(),
    otherwise: Joi.string().valid(
      'NONE',
      'AWS_IAM',
      'CUSTOM',
      'COGNITO_USER_POOLS',
    ),
  }),
})

// https://hapi.dev/family/joi/?v=15.1.0#objectpatternpattern-schema
const requestParameters = Joi.object().pattern(
  Joi.string(),
  Joi.string().required(),
)

const stringOrGetAtt = (propertyName, attributeName) =>
  Joi.alternatives().try(
    Joi.string(),
    Joi.object({
      'Fn::GetAtt': Joi.array()
        .length(2)
        .ordered(
          Joi.string().required(),
          Joi.string().valid(attributeName).required(),
        )
        .required(),
    }).error(
      customErrorBuilder(
        'object.child',
        `"${propertyName}" must be in the format "{ 'Fn::GetAtt': ['<ResourceId>', '${attributeName}'] }"`,
      ),
    ),
  )

const roleArn = stringOrGetAtt('roleArn', 'Arn')

const acceptParameters = Joi.object().pattern(
  Joi.string(),
  Joi.boolean().required(),
)

const pathOverride = Joi.string()

const proxy = Joi.object({
  path,
  pathOverride,
  method,
  cors,
  private: privateField,
  authorizationType,
  authorizerId,
  authorizationScopes,
  roleArn,
  acceptParameters,
}).required()

const stringOrRef = Joi.alternatives().try(
  Joi.string(),
  Joi.object().keys({
    Ref: Joi.string().required(),
  }),
)

const key = Joi.alternatives().try(
  Joi.string(),
  Joi.object()
    .keys({
      pathParam: Joi.string(),
      queryStringParam: Joi.string(),
    })
    .xor('pathParam', 'queryStringParam')
    .error(
      customErrorBuilder(
        'object.xor',
        'key must contain "pathParam" or "queryStringParam" but not both',
      ),
    ),
)

const partitionKey = Joi.alternatives().try(
  Joi.string(),
  Joi.object()
    .keys({
      pathParam: Joi.string(),
      queryStringParam: Joi.string(),
      bodyParam: Joi.string(),
    })
    .xor('pathParam', 'queryStringParam', 'bodyParam')
    .error(
      customErrorBuilder(
        'object.xor',
        'key must contain "pathParam" or "queryStringParam" or "bodyParam" and only one',
      ),
    ),
)

const allowedDynamodbActions = ['PutItem', 'GetItem', 'DeleteItem']
const dynamodbDefaultKeyScheme = Joi.object()
  .keys({
    pathParam: Joi.string(),
    queryStringParam: Joi.string(),
    attributeType: Joi.string().required(),
  })
  .xor('pathParam', 'queryStringParam')
  .error(
    customErrorBuilder(
      'object.xor',
      'key must contain "pathParam" or "queryStringParam" and only one',
    ),
  )

// EventBridge source parameter
const eventBridgeSource = Joi.alternatives().try(
  Joi.string(),
  Joi.object()
    .keys({
      pathParam: Joi.string(),
      queryStringParam: Joi.string(),
      bodyParam: Joi.string(),
    })
    .xor('pathParam', 'queryStringParam', 'bodyParam')
    .error(
      customErrorBuilder(
        'object.xor',
        'key must contain "pathParam" or "queryStringParam" or "bodyParam" and only one',
      ),
    ),
)

// EventBridge detailType parameter
const eventBridgeDetailType = Joi.alternatives().try(
  Joi.string(),
  Joi.object()
    .keys({
      pathParam: Joi.string(),
      queryStringParam: Joi.string(),
      bodyParam: Joi.string(),
    })
    .xor('pathParam', 'queryStringParam', 'bodyParam')
    .error(
      customErrorBuilder(
        'object.xor',
        'key must contain "pathParam" or "queryStringParam" or "bodyParam" and only one',
      ),
    ),
)

// EventBridge source parameter
const eventBridgeDetail = Joi.alternatives().try(
  Joi.object().keys({
    bodyParam: Joi.string(),
  }),
)

const request = Joi.object({
  contentHandling: Joi.string().valid('CONVERT_TO_BINARY', 'CONVERT_TO_TEXT'),
  passThrough: Joi.string().valid(
    'WHEN_NO_MATCH',
    'NEVER',
    'WHEN_NO_TEMPLATES',
  ),
  template: Joi.object().required(),
})

const response = Joi.object({
  template: Joi.object().keys({
    success: Joi.string(),
    clientError: Joi.string(),
    serverError: Joi.string(),
  }),
})

const extendedResponse = Joi.alternatives().try(
  Joi.object({
    template: Joi.object().keys({
      success: Joi.string(),
      clientError: Joi.string(),
      serverError: Joi.string(),
    }),
  }),
  Joi.array().items(
    Joi.object().keys({
      statusCode: Joi.alternatives().try(Joi.number(), Joi.string()),
      selectionPattern: Joi.alternatives().try(Joi.number(), Joi.string()),
      responseParameters: Joi.object(),
      responseTemplates: Joi.object(),
    }),
  ),
)

const allowedProxies = [
  'kinesis',
  'sqs',
  's3',
  'sns',
  'dynamodb',
  'eventbridge',
]

const proxiesSchemas = {
  kinesis: Joi.object({
    kinesis: proxy.append({
      action: Joi.string().valid('PutRecord', 'PutRecords'),
      streamName: stringOrRef.required(),
      partitionKey,
      request,
      response,
    }),
  }),
  s3: Joi.object({
    s3: proxy.append({
      action: Joi.string()
        .valid('GetObject', 'PutObject', 'DeleteObject')
        .required(),
      bucket: stringOrRef.required(),
      // key is
      //   - optional when using a request mapping template
      //   - forbidden if requestParameter has a 'integration.request.path.object' property
      //   - otherwise required
      key: Joi.when('request', {
        is: request.required(),
        then: key,
        otherwise: Joi.when('requestParameters', {
          is: requestParameters
            .keys({
              'integration.request.path.object': Joi.string().required(),
            })
            .required(),
          then: Joi.forbidden(),
          otherwise: key.required(),
        }),
      }),
      requestParameters,
      request,
      response: extendedResponse,
    }),
  }),
  sns: Joi.object({
    sns: proxy.append({
      topicName: stringOrGetAtt('topicName', 'TopicName').required(),
      request,
      response: extendedResponse,
    }),
  }),
  sqs: Joi.object({
    sqs: proxy.append({
      queueName: stringOrGetAtt('queueName', 'QueueName').required(),
      requestParameters,
      request,
      response: extendedResponse,
    }),
  }),
  dynamodb: Joi.object({
    dynamodb: proxy.append({
      action: Joi.string()
        .valid(...allowedDynamodbActions)
        .required(),
      tableName: stringOrRef.required(),
      condition: Joi.string(),
      hashKey: dynamodbDefaultKeyScheme.required(),
      rangeKey: dynamodbDefaultKeyScheme,
      requestParameters,
      request,
      response: extendedResponse,
    }),
  }),
  eventbridge: Joi.object({
    eventbridge: proxy.append({
      eventBusName: stringOrRef.required(),
      source: eventBridgeSource.required(),
      detailType: eventBridgeDetailType,
      detail: eventBridgeDetail,
      request,
    }),
  }),
}

const schema = Joi.array()
  .items(...allowedProxies.map((proxyKey) => proxiesSchemas[proxyKey]))
  .error(
    customErrorBuilder('array.includes', (error) => {
      // get a detailed error why the proxy object failed the schema validation
      // Joi default message is `"value" at position <i> does not match any of the allowed types`
      const contextValue = error.context?.value ?? error.local?.value
      if (!contextValue) {
        return error.message
      }
      const proxyKey = Object.keys(contextValue)[0]

      let message = ''
      if (proxiesSchemas[proxyKey]) {
        // e.g. value is { kinesis: { path: '/kinesis', method: 'xxxx' } }
        const { error: proxyError } =
          proxiesSchemas[proxyKey].validate(contextValue)
        message = proxyError.message
      } else {
        // e.g. value is { xxxxx: { path: '/kinesis', method: 'post' } }
        message = `Invalid APIG proxy "${proxyKey}". This plugin supported Proxies are: ${allowedProxies.join(
          ', ',
        )}.`
      }
      return message
    }),
  )

export default schema
