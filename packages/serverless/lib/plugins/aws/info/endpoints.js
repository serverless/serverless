/**
 * The service's endpoints as `serverless info` and `serverless deploy` print them, and the stack
 * outputs they come from. The info plugin reads them through `getStackInfo` and prints them with
 * `displayEndpoints`; Dev Mode prints the same lines from the stack outputs it already read
 * (`endpointLinesOf`), with the URL of an HTTP API `provider.httpApi.id` names
 * (`externalHttpApiEndpointOf`).
 */
import resolveCfImportValue from '../utils/resolve-cf-import-value.js'

/**
 * The endpoint base URLs among the stack's `outputs` (`[{ OutputKey, OutputValue }]`), in their
 * order, and those of them that belong to an HTTP API (whose routes are listed differently from a
 * REST API's, though the URLs look alike).
 */
export const endpointOutputs = ({ outputs, naming }) => {
  const matching = outputs.filter((output) =>
    naming.getServiceEndpointRegex().test(output.OutputKey),
  )
  return {
    endpoints: matching.map((output) => output.OutputValue),
    httpApiEndpoints: new Set(
      matching
        .filter((output) => output.OutputKey === 'HttpApiUrl')
        .map((output) => output.OutputValue),
    ),
  }
}

/**
 * The URL of the existing HTTP API that `provider.httpApi.id` names (an id, or an
 * `Fn::ImportValue` of one), which has no stack output: from `ApiGatewayV2.getApi`, through the
 * Framework's AWS `provider`. Undefined when the service names none. Rejects when the lookup
 * fails.
 */
export const externalHttpApiEndpointOf = async ({ provider, service }) => {
  const id = service.provider?.httpApi?.id
  if (!id) return undefined
  const apiId = id['Fn::ImportValue']
    ? await resolveCfImportValue(provider, id['Fn::ImportValue'])
    : id
  const result = await provider.request('ApiGatewayV2', 'getApi', {
    ApiId: apiId,
  })
  return result.ApiEndpoint
}

const outputValue = (outputs, key) =>
  outputs.find((output) => output.OutputKey === key)?.OutputValue

/** The URL of function `functionName`'s function URL, from the stack's outputs. */
export const functionUrlOf = ({ outputs, naming, functionName }) =>
  outputValue(outputs, naming.getLambdaFunctionUrlOutputLogicalId(functionName))

/** The domain name of the service's CloudFront distribution, from the stack's outputs. */
export const cloudFrontOf = ({ outputs, naming }) =>
  outputValue(outputs, naming.getCloudFrontDistributionDomainNameLogicalId())

/**
 * The lines `info` and `deploy` print under "endpoint(s)": each route of a REST API
 * (`METHOD - <url><path>`) or of an HTTP API, another endpoint (a WebSocket API) as its URL, the
 * CloudFront distribution, then each function URL (`name: <url>`, or the bare URL when it is the
 * service's only endpoint). `endpoints` are the base URLs, `httpApiEndpoints` those of an HTTP
 * API, `functionUrls` `[{ name, url }]`.
 */
export const formatEndpoints = ({
  serverless,
  endpoints = [],
  httpApiEndpoints,
  cloudFront,
  functionUrls = [],
}) => {
  const outputSectionItems = []

  for (const endpoint of endpoints ?? []) {
    if (httpApiEndpoints?.has(endpoint)) {
      // an HTTP API: its routes come from the httpApi events
      const { httpApiEventsPlugin } = serverless
      httpApiEventsPlugin.resolveConfiguration()

      for (const functionData of Object.values(serverless.service.functions)) {
        for (const event of functionData.events) {
          if (!event.httpApi) continue
          outputSectionItems.push(
            `${event.resolvedMethod} - ${endpoint}${event.resolvedPath || ''}`,
          )
        }
      }
    } else if (endpoint.startsWith('https://')) {
      // a REST API: its routes come from the http events
      Object.values(serverless.service.functions).forEach((functionObject) => {
        functionObject.events.forEach((event) => {
          if (event.http) {
            let method
            let path

            if (typeof event.http === 'object') {
              method = event.http.method.toUpperCase()
              path = event.http.path
            } else {
              method = event.http.split(' ')[0].toUpperCase()
              path = event.http.split(' ')[1]
            }
            path =
              path !== '/'
                ? `/${path
                    .split('/')
                    .filter((p) => p !== '')
                    .join('/')}`
                : ''
            outputSectionItems.push(`${method} - ${endpoint}${path}`)
          }
        })
      })
    } else {
      // if the endpoint is not of type http(s) (e.g. wss) we just display
      outputSectionItems.push(endpoint)
    }
  }

  if (cloudFront) {
    outputSectionItems.push(`CloudFront - ${cloudFront}`)
  }

  for (const functionWithUrl of functionUrls) {
    if (outputSectionItems.length === 0 && functionUrls.length === 1) {
      // In this situation we want to skip displaying function name as there is only one URL in whole service
      outputSectionItems.push(functionWithUrl.url)
    } else {
      outputSectionItems.push(`${functionWithUrl.name}: ${functionWithUrl.url}`)
    }
  }

  return outputSectionItems
}

/**
 * `formatEndpoints` for a deployed stage, from its stack's `outputs` and, for an HTTP API
 * `provider.httpApi.id` names (which has no output), its URL (`externalHttpApiEndpointOf`), listed
 * after the outputs' endpoints as `getStackInfo` lists it.
 */
export const endpointLinesOf = ({
  serverless,
  outputs,
  naming,
  externalHttpApiEndpoint,
}) => {
  const { endpoints, httpApiEndpoints } = endpointOutputs({ outputs, naming })
  if (externalHttpApiEndpoint) {
    endpoints.push(externalHttpApiEndpoint)
    httpApiEndpoints.add(externalHttpApiEndpoint)
  }
  return formatEndpoints({
    serverless,
    endpoints,
    httpApiEndpoints,
    cloudFront: cloudFrontOf({ outputs, naming }),
    functionUrls: serverless.service
      .getAllFunctions()
      .map((name) => ({
        name,
        url: functionUrlOf({ outputs, naming, functionName: name }),
      }))
      .filter(({ url }) => url),
  })
}
