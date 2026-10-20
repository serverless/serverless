/**
 * The service's endpoints as `serverless info` and `serverless deploy` print them, and the stack
 * outputs they come from. The info plugin reads them through `getStackInfo` and prints them with
 * `displayEndpoints`; Dev Mode prints the same lines from the stack outputs it already read
 * (`endpointLinesOf`), with the URL of an HTTP API `provider.httpApi.id` names
 * (`externalHttpApiEndpointOf`).
 */
import { log } from '@serverless/util'
import resolveCfImportValue from '../utils/resolve-cf-import-value.js'
import { getWebAppsConfig } from '../lib/web-apps.js'
import { getWebAppLogicalIds } from '../web-apps/compilers/function.js'
import { listWebAppDomains } from '../web-apps/compilers/domain.js'

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

/**
 * Each deployed web app's endpoint URL, from its `<N>WebFunctionUrl` output, in the order of
 * `webApps`: `[{ name, url }]`. A web app without the output (not deployed yet) is left out.
 */
export const webAppUrlsOf = ({ serverless, outputs }) =>
  Object.keys(getWebAppsConfig(serverless))
    .map((name) => ({
      name,
      url: outputValue(outputs, getWebAppLogicalIds(name).urlOutput),
    }))
    .filter(({ url }) => url)

/**
 * Each web app's endpoint URL followed by the URL of each enabled custom domain entry that
 * targets it (`https://<hostname>[/<basePath>]`, hostnames from the config), as `[{ name, url }]`.
 */
const webAppEndpointsOf = ({ serverless, webApps }) => {
  if (webApps.length === 0) return []
  const domains = listWebAppDomains(serverless.service.provider || {}, {
    warn: (message) => log.warning(message),
  })
  return webApps.flatMap(({ name, url }) => [
    { name, url },
    ...domains
      .filter((domain) => domain.webApp === name)
      .map((domain) => ({
        name,
        url: `https://${domain.name}${domain.basePath ? `/${domain.basePath}` : ''}`,
      })),
  ])
}

/** The domain name of the service's CloudFront distribution, from the stack's outputs. */
export const cloudFrontOf = ({ outputs, naming }) =>
  outputValue(outputs, naming.getCloudFrontDistributionDomainNameLogicalId())

/**
 * The lines `info` and `deploy` print under "endpoint(s)": each route of a REST API
 * (`METHOD - <url><path>`) or of an HTTP API, another endpoint (a WebSocket API) as its URL, the
 * CloudFront distribution, each function URL, then each web app's endpoint URL and the custom
 * domains that serve it (`name: <url>`, or the bare URL when it is the service's only endpoint).
 * `endpoints` are the base URLs, `httpApiEndpoints` those of an HTTP API, `functionUrls` and
 * `webApps` `[{ name, url }]`.
 */
export const formatEndpoints = ({
  serverless,
  endpoints = [],
  httpApiEndpoints,
  cloudFront,
  functionUrls = [],
  webApps = [],
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

  const namedUrls = [
    ...functionUrls,
    ...webAppEndpointsOf({ serverless, webApps }),
  ]
  if (outputSectionItems.length === 0 && namedUrls.length === 1) {
    // The only URL in the whole service: no name needed
    outputSectionItems.push(namedUrls[0].url)
  } else {
    for (const { name, url } of namedUrls) {
      outputSectionItems.push(`${name}: ${url}`)
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
    webApps: webAppUrlsOf({ serverless, outputs }),
  })
}
