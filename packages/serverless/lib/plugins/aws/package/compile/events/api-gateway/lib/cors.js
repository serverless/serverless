import _ from 'lodash'
import { log } from '@serverless/util'

// Gateway response types that API Gateway itself can emit for a REST API.
// `DEFAULT_4XX` / `DEFAULT_5XX` are the catch-alls for every gateway-generated
// 4xx / 5xx response; the specific types are listed explicitly so they also
// carry CORS headers even where a default would not be applied to them.
const corsGatewayResponseTypes = {
  DEFAULT_4XX: 'Default4XX',
  DEFAULT_5XX: 'Default5XX',
  UNAUTHORIZED: 'Unauthorized',
  ACCESS_DENIED: 'AccessDenied',
  INVALID_API_KEY: 'InvalidApiKey',
  MISSING_AUTHENTICATION_TOKEN: 'MissingAuthenticationToken',
  RESOURCE_NOT_FOUND: 'ResourceNotFound',
  EXPIRED_TOKEN: 'ExpiredToken',
  THROTTLED: 'Throttled',
  QUOTA_EXCEEDED: 'QuotaExceeded',
  AUTHORIZER_FAILURE: 'AuthorizerFailure',
  INTEGRATION_FAILURE: 'IntegrationFailure',
}

// Specific gateway response types grouped by the `DEFAULT_*` fallback API
// Gateway applies when no response is defined for the specific type. A
// user-defined default therefore already covers its specific types.
const corsGatewayResponseFallbacks = {
  DEFAULT_4XX: [
    'UNAUTHORIZED',
    'ACCESS_DENIED',
    'INVALID_API_KEY',
    'MISSING_AUTHENTICATION_TOKEN',
    'RESOURCE_NOT_FOUND',
    'EXPIRED_TOKEN',
    'THROTTLED',
    'QUOTA_EXCEEDED',
  ],
  DEFAULT_5XX: ['AUTHORIZER_FAILURE', 'INTEGRATION_FAILURE'],
}

const corsGatewayResponseParent = Object.fromEntries(
  Object.entries(corsGatewayResponseFallbacks).flatMap(([parent, types]) =>
    types.map((type) => [type, parent]),
  ),
)

// Normalize the RestApiId values that refer to the same REST API so
// equivalent CloudFormation references compare equal: `{ Ref: 'X' }` and
// `{ 'Fn::Sub': '${X}' }` both resolve to the same API, while a reference to
// a different API stays distinct.
function normalizeRestApiId(restApiId) {
  if (restApiId && typeof restApiId === 'object') {
    if (typeof restApiId.Ref === 'string') {
      return `Ref:${restApiId.Ref}`
    }
    const sub = restApiId['Fn::Sub']
    const subTemplate = Array.isArray(sub) ? sub[0] : sub
    if (typeof subTemplate === 'string') {
      const match = subTemplate.match(/^\$\{([A-Za-z0-9]+)\}$/)
      if (match) return `Ref:${match[1]}`
    }
  }
  return JSON.stringify(restApiId)
}

function restApiIdsMatch(a, b) {
  return normalizeRestApiId(a) === normalizeRestApiId(b)
}

// Gateway response header values are emitted as quoted strings, e.g.
// `'Content-Type,Authorization'`. Strip the quotes to read them back.
function unquoteHeaderParam(value) {
  if (typeof value !== 'string') return undefined
  return value.replace(/^'|'$/g, '')
}

function unionHeaderParamValues(value, values) {
  const unquoted = unquoteHeaderParam(value)
  if (!unquoted) return
  for (const item of unquoted.split(',')) {
    if (item && !values.includes(item)) values.push(item)
  }
}

export default {
  compileCors() {
    if (this.validated.corsPreflight) {
      const corsConfigs = Object.values(this.validated.corsPreflight)
      Object.entries(this.validated.corsPreflight).forEach(([path, config]) => {
        const resourceName = this.getResourceName(path)
        const resourceRef = this.getResourceId(path)
        const corsMethodLogicalId = this.provider.naming.getMethodLogicalId(
          resourceName,
          'options',
        )

        const preflightHeaders = this.getCorsPreflightHeaders(config)

        this.apiGatewayMethodLogicalIds.push(corsMethodLogicalId)

        _.merge(
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources,
          {
            [corsMethodLogicalId]: {
              Type: 'AWS::ApiGateway::Method',
              Properties: {
                AuthorizationType: 'NONE',
                HttpMethod: 'OPTIONS',
                MethodResponses:
                  this.generateCorsMethodResponses(preflightHeaders),
                RequestParameters: {},
                Integration: {
                  Type: 'MOCK',
                  RequestTemplates: {
                    'application/json': '{statusCode:200}',
                  },
                  ContentHandling: 'CONVERT_TO_TEXT',
                  IntegrationResponses: this.generateCorsIntegrationResponses(
                    preflightHeaders,
                    this.getCorsOrigins(config),
                  ),
                },
                ResourceId: resourceRef,
                RestApiId: this.provider.getApiGatewayRestApiId(),
              },
            },
          },
        )
      })

      // Gateway-generated error responses (e.g. 401 from an authorizer, 403
      // for an invalid API key, 404, 429, 5xx) never reach the preflight
      // method or the Lambda handler, so they carry no CORS headers unless
      // the API has GatewayResponse resources for them. Synthesize those
      // from the same CORS configuration, once per REST API.
      // See https://github.com/serverless/serverless/issues/3896
      this.compileCorsGatewayResponses(corsConfigs)
    }
  },

  getCorsOrigins(config) {
    let origins =
      config.origins && Array.isArray(config.origins)
        ? config.origins
        : undefined

    if (config.origin && config.origin.indexOf(',') !== -1) {
      origins = config.origin.split(',').map((a) => a.trim())
    }

    return origins
  },

  getCorsPreflightHeaders(config) {
    const origins = this.getCorsOrigins(config)

    let origin = config.origin
    if (Array.isArray(origins) && origins.length) {
      origin = origins[0]
    }

    const preflightHeaders = {
      'Access-Control-Allow-Origin': `'${origin}'`,
      'Access-Control-Allow-Headers': `'${config.headers.join(',')}'`,
      'Access-Control-Allow-Methods': `'${config.methods.join(',')}'`,
    }

    // Only set Access-Control-Allow-Credentials when explicitly allowed (omit if false)
    if (config.allowCredentials) {
      preflightHeaders['Access-Control-Allow-Credentials'] =
        `'${config.allowCredentials}'`
    }

    // Enable CORS Max Age usage if set
    if (config.maxAge) {
      preflightHeaders['Access-Control-Max-Age'] = `'${config.maxAge}'`
    }

    // Allow Cache-Control header if set
    if (config.cacheControl) {
      preflightHeaders['Cache-Control'] = `'${config.cacheControl}'`
    }

    if (config.methods.includes('ANY')) {
      preflightHeaders['Access-Control-Allow-Methods'] = preflightHeaders[
        'Access-Control-Allow-Methods'
      ].replace('ANY', 'DELETE,GET,HEAD,PATCH,POST,PUT')
    }

    return preflightHeaders
  },

  compileCorsGatewayResponses(corsConfigs) {
    if (!corsConfigs.length) return

    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate
    const restApiId = this.provider.getApiGatewayRestApiId()

    // Gateway responses are per REST API, not per path, so merge the
    // per-path CORS configs into a single one.
    const mergedConfig = {
      origin: undefined,
      headers: [],
      methods: [],
      allowCredentials: false,
      maxAge: undefined,
      cacheControl: undefined,
    }
    for (const config of corsConfigs) {
      // The first path that defines an origin supplies it, whichever syntax
      // it uses (`origin` or the first entry of `origins`).
      const pathOrigin =
        Array.isArray(config.origins) && config.origins.length
          ? config.origins[0]
          : config.origin
      if (pathOrigin && !mergedConfig.origin) {
        mergedConfig.origin = pathOrigin
      }
      if (Array.isArray(config.headers)) {
        mergedConfig.headers.push(...config.headers)
      }
      if (Array.isArray(config.methods)) {
        mergedConfig.methods.push(...config.methods)
      }
      mergedConfig.allowCredentials =
        mergedConfig.allowCredentials || config.allowCredentials
      // when merging, last one defined wins
      if (config.maxAge) mergedConfig.maxAge = config.maxAge
      if (config.cacheControl) mergedConfig.cacheControl = config.cacheControl
    }
    mergedConfig.headers = [...new Set(mergedConfig.headers)]
    mergedConfig.methods = [...new Set(mergedConfig.methods)]

    // `compileCors` runs once per event compiler, and the HTTP events and
    // the API Gateway service-proxy plugins both compile CORS for the same
    // REST API. A previous call may already have emitted gateway responses
    // for this API, so merge with those instead of replacing them: the first
    // emitted origin wins and the header and method sets are unioned, so the
    // CORS configuration of every path survives.
    for (const resource of Object.values(template.Resources)) {
      if (
        resource &&
        resource.Type === 'AWS::ApiGateway::GatewayResponse' &&
        resource.Properties &&
        resource.Properties.RestApiId &&
        restApiIdsMatch(resource.Properties.RestApiId, restApiId)
      ) {
        const params = resource.Properties.ResponseParameters || {}
        const origin = unquoteHeaderParam(
          params['gatewayresponse.header.Access-Control-Allow-Origin'],
        )
        if (origin) mergedConfig.origin = origin
        unionHeaderParamValues(
          params['gatewayresponse.header.Access-Control-Allow-Headers'],
          mergedConfig.headers,
        )
        unionHeaderParamValues(
          params['gatewayresponse.header.Access-Control-Allow-Methods'],
          mergedConfig.methods,
        )
        if (params['gatewayresponse.header.Access-Control-Allow-Credentials']) {
          mergedConfig.allowCredentials = true
        }
        const maxAge = unquoteHeaderParam(
          params['gatewayresponse.header.Access-Control-Max-Age'],
        )
        if (maxAge && !mergedConfig.maxAge) mergedConfig.maxAge = maxAge
      }
    }

    // A static gateway response cannot echo a request origin the way the
    // preflight template does, so a wildcard pattern such as
    // `https://*.example.com` would be emitted literally and browsers would
    // reject it. Only a single exact origin (or `*`) can be represented by a
    // static header, so skip synthesis for patterns and let the user define
    // their own GatewayResponse resources for the pattern instead.
    if (
      mergedConfig.origin &&
      mergedConfig.origin !== '*' &&
      mergedConfig.origin.includes('*')
    ) {
      log.warning(
        'CORS gateway responses were not created because the configured ' +
          `origin '${mergedConfig.origin}' is a wildcard pattern, which ` +
          'cannot be represented by a static Access-Control-Allow-Origin ' +
          'header. Define your own AWS::ApiGateway::GatewayResponse ' +
          'resources to cover gateway-generated error responses for this origin.',
      )
      return
    }

    // Reuse the exact header values of the preflight response, mapped to
    // the `gatewayresponse.header.*` response parameters. `Cache-Control`
    // is left out: it is an OPTIONS caching directive, and a cache that
    // honors it could keep serving a gateway error after the API recovers.
    const responseParameters = _.mapKeys(
      _.omit(this.getCorsPreflightHeaders(mergedConfig), ['Cache-Control']),
      (value, header) => `gatewayresponse.header.${header}`,
    )

    const userDefinedResponseTypes =
      this.getUserDefinedGatewayResponseTypes(restApiId)

    const gatewayResponses = {}
    for (const [responseType, logicalIdSuffix] of Object.entries(
      corsGatewayResponseTypes,
    )) {
      // Conditions under which a user-defined resource already covers this
      // response type, or its `DEFAULT_*` fallback covers it. A generated
      // response must only exist where none of those applies, so that a
      // user-defined fallback (and its custom response template) is never
      // bypassed by a synthesized specific type.
      const excludedByConditions = []
      if (userDefinedResponseTypes.has(responseType)) {
        const condition = userDefinedResponseTypes.get(responseType)
        if (!condition) continue
        excludedByConditions.push(condition)
      }
      const fallbackType = corsGatewayResponseParent[responseType]
      if (fallbackType && userDefinedResponseTypes.has(fallbackType)) {
        const condition = userDefinedResponseTypes.get(fallbackType)
        if (!condition) continue
        excludedByConditions.push(condition)
      }

      const logicalId = this.getGatewayResponseLogicalId(
        `ApiGatewayGatewayResponse${logicalIdSuffix}`,
        responseType,
        restApiId,
      )

      const gatewayResponse = {
        Type: 'AWS::ApiGateway::GatewayResponse',
        Properties: {
          ResponseParameters: responseParameters,
          ResponseType: responseType,
          RestApiId: restApiId,
        },
      }
      if (excludedByConditions.length) {
        gatewayResponse.Condition = this.getExclusionConditionName(
          excludedByConditions,
          template,
        )
      }
      gatewayResponses[logicalId] = gatewayResponse
    }

    _.merge(template.Resources, gatewayResponses)

    // The REST API deployment must wait for the generated gateway responses:
    // API Gateway only picks a GatewayResponse change up on a new deployment,
    // so deploying the stage first would leave the stage without CORS headers
    // on error responses. `apiGatewayMethodLogicalIds` is the dependency list
    // `compileDeployment` (and the service-proxy `mergeDeployment`) uses.
    for (const logicalId of Object.keys(gatewayResponses)) {
      if (!this.apiGatewayMethodLogicalIds.includes(logicalId)) {
        this.apiGatewayMethodLogicalIds.push(logicalId)
      }
    }
  },

  getUserDefinedGatewayResponseTypes(restApiId) {
    // Map of response type -> name of the CloudFormation Condition on the
    // user-defined resource, if any. A resource without a Condition applies
    // in every environment; a conditional one only applies where its
    // condition holds, so the generated fallback must still cover the
    // environments where it does not.
    const definedTypes = new Map()
    const userResources =
      this.serverless.service.resources &&
      this.serverless.service.resources.Resources
    if (!userResources) return definedTypes

    for (const resource of Object.values(userResources)) {
      if (
        resource &&
        resource.Type === 'AWS::ApiGateway::GatewayResponse' &&
        resource.Properties &&
        resource.Properties.ResponseType &&
        resource.Properties.RestApiId &&
        restApiIdsMatch(resource.Properties.RestApiId, restApiId)
      ) {
        definedTypes.set(
          resource.Properties.ResponseType,
          typeof resource.Condition === 'string'
            ? resource.Condition
            : undefined,
        )
      }
    }
    return definedTypes
  },

  getGatewayResponseLogicalId(baseLogicalId, responseType, restApiId) {
    const templateResources =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources
    const userResources =
      (this.serverless.service.resources &&
        this.serverless.service.resources.Resources) ||
      {}

    const isSameResponse = (resource) =>
      resource &&
      resource.Type === 'AWS::ApiGateway::GatewayResponse' &&
      resource.Properties &&
      resource.Properties.ResponseType === responseType &&
      resource.Properties.RestApiId &&
      restApiIdsMatch(resource.Properties.RestApiId, restApiId)

    // Allocate a distinct, stable logical ID when the preferred ID is already
    // occupied by a different resource. Reusing it would fold the generated
    // response into the occupying resource when the custom resources are
    // merged, changing its RestApiId while keeping the generated headers.
    // Reuse the ID when it already holds the response this call would emit
    // (e.g. an earlier `compileCors` call for the same REST API).
    let logicalId = baseLogicalId
    let attempt = 0
    for (;;) {
      const templateResource = templateResources[logicalId]
      const userResource = userResources[logicalId]
      if (templateResource === undefined && userResource === undefined) {
        return logicalId
      }
      if (
        templateResource !== undefined &&
        isSameResponse(templateResource) &&
        userResource === undefined
      ) {
        return logicalId
      }
      attempt += 1
      logicalId = `${baseLogicalId}Cors${attempt}`
    }
  },

  getExclusionConditionName(conditionNames, template) {
    // The generated response must exist exactly where none of the
    // user-defined resources it would shadow exists: the negation of their
    // conditions.
    const sortedNames = [...new Set(conditionNames)].sort()
    const baseName = `Not${sortedNames.join('AndNot')}`
    const definition =
      sortedNames.length === 1
        ? { 'Fn::Not': [{ Condition: sortedNames[0] }] }
        : {
            'Fn::And': sortedNames.map((name) => ({
              'Fn::Not': [{ Condition: name }],
            })),
          }

    template.Conditions = template.Conditions || {}
    let conditionName = baseName
    let attempt = 0
    while (
      template.Conditions[conditionName] !== undefined &&
      JSON.stringify(template.Conditions[conditionName]) !==
        JSON.stringify(definition)
    ) {
      attempt += 1
      conditionName = `${baseName}${attempt}`
    }
    template.Conditions[conditionName] = definition
    return conditionName
  },

  generateCorsMethodResponses(preflightHeaders) {
    const methodResponseHeaders = {}

    Object.keys(preflightHeaders).forEach((header) => {
      methodResponseHeaders[`method.response.header.${header}`] = true
    })

    return [
      {
        StatusCode: '200',
        ResponseParameters: methodResponseHeaders,
        ResponseModels: {},
      },
    ]
  },

  generateCorsIntegrationResponses(preflightHeaders, origins) {
    const responseParameters = _.mapKeys(
      preflightHeaders,
      (value, header) => `method.response.header.${header}`,
    )

    return [
      {
        StatusCode: '200',
        ResponseParameters: responseParameters,
        ResponseTemplates: {
          'application/json':
            Array.isArray(origins) && origins.length
              ? this.generateCorsResponseTemplate(origins)
              : '',
        },
      },
    ]
  },

  regexifyWildcards(orig) {
    return orig.map((str) => str.replace(/\./g, '[.]').replace('*', '.+'))
  },

  generateCorsResponseTemplate(origins) {
    // glob pattern needs to be parsed into a Java regex
    // escape literal dots, replace wildcard * for .+
    const regexOrigins = this.regexifyWildcards(origins)

    return (
      '#set($origin = $input.params("Origin"))\n' +
      '#if($origin == "") #set($origin = $input.params("origin")) #end\n' +
      `#if(${regexOrigins
        .map(
          (o, i, a) =>
            `$origin.matches("${o}")${i < a.length - 1 ? ' || ' : ''}`,
        )
        .join('')}` +
      ') #set($context.responseOverride.header.Access-Control-Allow-Origin = $origin) #end'
    )
  },
}
