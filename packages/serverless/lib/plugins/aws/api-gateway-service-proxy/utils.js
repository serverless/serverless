const getAllServiceProxies = function () {
  if (
    this.serverless.service.custom &&
    this.serverless.service.custom.apiGatewayServiceProxies
  ) {
    return this.serverless.service.custom.apiGatewayServiceProxies
  }
  return []
}

const getServiceName = function (serviceProxy) {
  return Object.keys(serviceProxy)[0]
}

const addCors = function (http, integrationResponse) {
  if (http && http.cors) {
    let origin = http.cors.origin
    if (http.cors.origins && http.cors.origins.length) {
      origin = http.cors.origins.join(',')
    }

    const corsKey = 'method.response.header.Access-Control-Allow-Origin'
    integrationResponse.IntegrationResponses.forEach((value, index) => {
      integrationResponse.IntegrationResponses[index].ResponseParameters[
        corsKey
      ] = `'${origin}'`
    })
  }
}

const shouldCreateDefaultRole = function (serviceName) {
  const proxies = this.getAllServiceProxies().filter(
    (serviceProxy) => this.getServiceName(serviceProxy) === serviceName,
  )

  if (proxies.length <= 0) {
    return false
  }

  return proxies.some((proxy) => !proxy[serviceName].roleArn)
}

export default {
  getAllServiceProxies,
  getServiceName,
  addCors,
  shouldCreateDefaultRole,
}
