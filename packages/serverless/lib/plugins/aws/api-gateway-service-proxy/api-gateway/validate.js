import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'
import _ from 'lodash'
import Joi from 'joi'
import schema from './schema.js'

const NOT_FOUND = -1

const validateModule = {
  validateServiceProxies() {
    const proxies = this.getAllServiceProxies()

    const { error } = schema.validate(proxies)
    if (error) {
      throw new ServerlessError(
        error.message,
        ServerlessErrorCodes.general.INVALID_CONFIG,
        { stack: false },
      )
    }

    const corsPreflight = {}

    const events = proxies.map((serviceProxy) => {
      const serviceName = this.getServiceName(serviceProxy)
      const http = serviceProxy[serviceName]
      http.path = http.path.replace(/^\//, '').replace(/\/$/, '')
      http.method = http.method.toLowerCase()
      http.auth = {
        authorizationType: http.authorizationType || 'NONE',
      }

      if (_.has(http, 'authorizerId')) {
        http.auth.authorizerId = http.authorizerId
      }

      if (_.has(http, 'authorizationScopes')) {
        http.auth.authorizationScopes = http.authorizationScopes
      }

      if (serviceProxy[serviceName].cors) {
        http.cors = this.getCors(serviceProxy[serviceName])

        const cors = corsPreflight[http.path] || {}

        cors.headers = _.union(http.cors.headers, cors.headers)
        cors.methods = _.union(http.cors.methods, cors.methods)
        cors.origins = _.union(http.cors.origins, cors.origins)
        cors.origin = http.cors.origin || '*'
        cors.allowCredentials =
          cors.allowCredentials || http.cors.allowCredentials

        // when merging, last one defined wins
        if (_.has(http.cors, 'maxAge')) {
          cors.maxAge = http.cors.maxAge
        }

        if (_.has(http.cors, 'cacheControl')) {
          cors.cacheControl = http.cors.cacheControl
        }

        corsPreflight[http.path] = cors
      }

      return { serviceName, http }
    })

    return {
      events,
      corsPreflight,
    }
  },

  getCors(proxy) {
    const defaultHeaders = [
      'Content-Type',
      'X-Amz-Date',
      'Authorization',
      'X-Api-Key',
      'X-Amz-Security-Token',
      'X-Amz-User-Agent',
    ]

    let cors = {
      origins: ['*'],
      origin: '*',
      methods: ['OPTIONS'],
      headers: defaultHeaders,
      allowCredentials: false,
    }

    if (_.isPlainObject(proxy.cors)) {
      cors = proxy.cors
      cors.methods = cors.methods || []
      cors.allowCredentials = Boolean(cors.allowCredentials)

      if (!cors.headers) {
        cors.headers = defaultHeaders
      }

      if (cors.methods.indexOf('OPTIONS') === NOT_FOUND) {
        cors.methods.push('OPTIONS')
      }

      if (cors.methods.indexOf(proxy.method.toUpperCase()) === NOT_FOUND) {
        cors.methods.push(proxy.method.toUpperCase())
      }
    } else {
      cors.methods.push(proxy.method.toUpperCase())
    }

    return cors
  },
}

export default validateModule
