import _ from 'lodash'

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

    // Gateway responses are per REST API, not per path, so merge the
    // per-path CORS configs into a single one.
    const mergedConfig = {
      origin: undefined,
      origins: [],
      headers: [],
      methods: [],
      allowCredentials: false,
      maxAge: undefined,
      cacheControl: undefined,
    }
    for (const config of corsConfigs) {
      if (config.origin && !mergedConfig.origin) {
        mergedConfig.origin = config.origin
      }
      if (Array.isArray(config.origins)) {
        mergedConfig.origins.push(...config.origins)
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
    mergedConfig.origins = [...new Set(mergedConfig.origins)]
    mergedConfig.headers = [...new Set(mergedConfig.headers)]
    mergedConfig.methods = [...new Set(mergedConfig.methods)]

    // Reuse the exact header values of the preflight response, mapped to
    // the `gatewayresponse.header.*` response parameters.
    const responseParameters = _.mapKeys(
      this.getCorsPreflightHeaders(mergedConfig),
      (value, header) => `gatewayresponse.header.${header}`,
    )

    const restApiId = this.provider.getApiGatewayRestApiId()
    const userDefinedResponseTypes =
      this.getUserDefinedGatewayResponseTypes(restApiId)

    const gatewayResponses = {}
    for (const [responseType, logicalIdSuffix] of Object.entries(
      corsGatewayResponseTypes,
    )) {
      // Never override a GatewayResponse the user defined themselves in
      // `resources` (the documented workaround for this issue): API Gateway
      // allows only one gateway response per type, so synthesizing a second
      // one would fail the deployment.
      if (userDefinedResponseTypes.has(responseType)) continue

      gatewayResponses[`ApiGatewayGatewayResponse${logicalIdSuffix}`] = {
        Type: 'AWS::ApiGateway::GatewayResponse',
        Properties: {
          ResponseParameters: responseParameters,
          ResponseType: responseType,
          RestApiId: restApiId,
        },
      }
    }

    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      gatewayResponses,
    )
  },

  getUserDefinedGatewayResponseTypes(restApiId) {
    const definedTypes = new Set()
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
        JSON.stringify(resource.Properties.RestApiId) ===
          JSON.stringify(restApiId)
      ) {
        definedTypes.add(resource.Properties.ResponseType)
      }
    }
    return definedTypes
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
