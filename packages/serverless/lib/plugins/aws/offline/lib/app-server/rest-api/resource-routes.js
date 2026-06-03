/**
 * CloudFormation `resources` block parser and Hapi route registrar for API
 * Gateway HTTP_PROXY routes.
 *
 * The Serverless Framework allows users to define raw CloudFormation resources
 * alongside the functions block.  When a user wires up an `AWS::ApiGateway::Method`
 * with an `HTTP_PROXY` integration (bypassing Lambda entirely), `sls offline`
 * needs to know about those routes so it can forward matching requests upstream
 * instead of returning a 404.
 *
 * `parseResources` is intentionally a pure function — no Hapi, no I/O, no
 * throwing — so it can be exercised by unit tests without a live server and
 * called eagerly during option-loading without side effects.
 *
 * `registerResourceRoutes` consumes the parsed result and registers Hapi proxy
 * routes backed by `@hapi/h2o2`.  The caller is responsible for registering
 * h2o2 on the server before calling this function.
 */

import { translateRestPath, buildMountedPath } from './path-translator.js'

/**
 * Extract the `PathPart` from a `AWS::ApiGateway::Resource` object.
 *
 * @param {object | undefined} obj  A CloudFormation resource object.
 * @returns {string | undefined}
 */
function getPathPart(obj) {
  return obj && obj.Properties && obj.Properties.PathPart
}

/**
 * Extract the logical-ID or sentinel string that identifies the parent of a
 * `AWS::ApiGateway::Resource`.
 *
 * CloudFormation templates express the parent in two ways:
 *   `{ Ref: '<LogicalId>' }` — another named resource
 *   `{ 'Fn::GetAtt': ['<RestApiLogicalId>', 'RootResourceId'] }` — the implicit
 *     root resource of the REST API (second element is always `'RootResourceId'`).
 *
 * @param {object | undefined} obj  A CloudFormation resource object.
 * @returns {string | undefined}
 */
function getParentId(obj) {
  if (!obj || !obj.Properties || !obj.Properties.ParentId) return undefined
  const parentId = obj.Properties.ParentId
  if (parentId.Ref !== undefined) return parentId.Ref
  if (parentId['Fn::GetAtt']) return parentId['Fn::GetAtt'][1]
  return undefined
}

/**
 * Return true if the given id is the implicit REST API root resource sentinel.
 *
 * @param {string | undefined} id
 * @returns {boolean}
 */
function isRoot(id) {
  return id === 'RootResourceId'
}

/**
 * Extract the logical ID of the `AWS::ApiGateway::Resource` referenced by a
 * `AWS::ApiGateway::Method`.
 *
 * @param {object} methodObj  A CloudFormation method resource object.
 * @returns {string | undefined}
 */
function getResourceId(methodObj) {
  return (
    methodObj &&
    methodObj.Properties &&
    methodObj.Properties.ResourceId &&
    methodObj.Properties.ResourceId.Ref
  )
}

/**
 * Extract the HTTP method string from a `AWS::ApiGateway::Method`.
 *
 * @param {object} methodObj
 * @returns {string | undefined}
 */
function getHttpMethod(methodObj) {
  return methodObj && methodObj.Properties && methodObj.Properties.HttpMethod
}

/**
 * Extract the `Integration` block from a `AWS::ApiGateway::Method`, defaulting
 * to an empty object when absent.
 *
 * @param {object} methodObj
 * @returns {object}
 */
function getIntegration(methodObj) {
  return (
    (methodObj && methodObj.Properties && methodObj.Properties.Integration) ||
    {}
  )
}

/**
 * Walk the resource-parent chain starting at `resourceId` and reconstruct the
 * full APIGW path (e.g. `'/public/{proxy+}'`).
 *
 * Returns `undefined` when the path cannot be fully resolved — either because a
 * resource is missing from the template or one of the `PathPart` values is absent.
 *
 * @param {{ [logicalId: string]: object }} pathObjects  Map of `AWS::ApiGateway::Resource` entries.
 * @param {string | undefined} resourceId  Logical ID of the leaf resource.
 * @returns {string | undefined}
 */
function getFullPath(pathObjects, resourceId) {
  let currentId = resourceId
  const arr = []

  while (currentId && !isRoot(currentId)) {
    const currentObj = pathObjects[currentId]
    arr.push(currentObj)
    currentId = getParentId(currentObj)
  }

  const parts = arr.map(getPathPart).reverse()

  // Any missing PathPart means the path is unresolvable from static analysis.
  if (parts.some((p) => !p)) return undefined

  return `/${parts.join('/')}`
}

/**
 * Parse the `service.resources` block and return a map of API Gateway method
 * logical IDs to their route descriptors.
 *
 * Only `AWS::ApiGateway::Method` entries are returned; resources of other types
 * are ignored.  Methods whose path cannot be statically resolved map to `{}`.
 *
 * @param {object | undefined} resources  The `service.resources` value.
 * @returns {{ [methodLogicalId: string]: { isProxy: boolean, method: string, pathResource: string, proxyUri: string | undefined } | {} }}
 */
export function parseResources(resources) {
  if (!resources || !resources.Resources) return {}

  const allResources = resources.Resources

  // Partition into methods and path resources.
  const methodObjects = {}
  const pathObjects = {}

  for (const [logicalId, resourceObj] of Object.entries(allResources)) {
    if (resourceObj.Type === 'AWS::ApiGateway::Method') {
      methodObjects[logicalId] = resourceObj
    } else if (resourceObj.Type === 'AWS::ApiGateway::Resource') {
      pathObjects[logicalId] = resourceObj
    }
  }

  const result = {}

  for (const [methodId, methodObj] of Object.entries(methodObjects)) {
    const resourceId = getResourceId(methodObj)
    const integration = getIntegration(methodObj)
    const pathResource = getFullPath(pathObjects, resourceId)
    const method = getHttpMethod(methodObj)
    const proxyUri =
      integration.Type === 'HTTP_PROXY' ? integration.Uri : undefined

    if (!pathResource) {
      result[methodId] = {}
      continue
    }

    result[methodId] = {
      isProxy: Boolean(proxyUri),
      method,
      pathResource,
      proxyUri,
    }
  }

  return result
}

/**
 * Register Hapi proxy routes for every HTTP_PROXY method found in the
 * CloudFormation `resources` block.
 *
 * The caller must register `@hapi/h2o2` on `server` before calling this
 * function.  Route registration must happen before `server.start()`.
 *
 * @param {import('@hapi/hapi').Server} server
 *   A Hapi server instance with h2o2 already registered.
 * @param {object} opts
 * @param {object | undefined} opts.resources
 *   The `service.resources` value (raw CloudFormation).
 * @param {true | { [methodId: string]: { Uri?: string } }} opts.resourceRoutes
 *   `true` to use the URIs declared in the template, or an object map of
 *   per-method URI overrides keyed by CloudFormation logical ID.
 * @param {string} opts.stage
 *   API Gateway stage name (e.g. `'dev'`).
 * @param {string} [opts.prefix]
 *   Extra path segment to apply after the stage (matches the `--prefix` flag).
 * @param {boolean} [opts.stageInUrl=true]
 *   When `false`, the `/<stage>/` segment is omitted from the mounted URL.
 * @param {object | false} [opts.corsConfig]
 *   Hapi CORS options to attach to every resource route, or `false` to
 *   disable CORS headers.
 * @param {boolean} [opts.disableCookieValidation=false]
 *   When `true`, cookie parsing is disabled on resource routes.
 * @param {{ notice: (msg: string) => void, warning: (msg: string) => void }} opts.logger
 *   Logger with `.notice` and `.warning` methods.
 */
export async function registerResourceRoutes(
  server,
  {
    resources,
    resourceRoutes,
    stage,
    prefix,
    stageInUrl = true,
    corsConfig,
    disableCookieValidation = false,
    logger,
  },
) {
  const parsed = parseResources(resources)

  for (const [methodId, info] of Object.entries(parsed)) {
    // Non-proxy integrations cannot be forwarded — warn and skip.
    if (!info.isProxy) {
      logger.warning(
        `Only HTTP_PROXY is supported. Path '${info.pathResource}' is ignored.`,
      )
      continue
    }

    // Path could not be statically resolved (missing PathPart etc.).
    if (!info.pathResource) {
      logger.warning(`Could not resolve path for '${methodId}'.`)
      continue
    }

    // Resolve the proxy URI, applying any per-method override from the
    // `resourceRoutes` map.
    const proxyUri =
      (typeof resourceRoutes === 'object' &&
        resourceRoutes !== null &&
        resourceRoutes[methodId]?.Uri) ||
      info.proxyUri

    if (!proxyUri) {
      logger.warning(`Could not load proxy URI for '${methodId}'.`)
      continue
    }

    // Build the Hapi path using the same helpers used by `registerRestApiRoutes`:
    //   1. translateRestPath   — converts `{proxy+}` → `{proxy*}` (Hapi syntax)
    //   2. buildMountedPath    — prepends /<stage> and optional /<prefix>
    const hapiPath = buildMountedPath(
      translateRestPath(info.pathResource),
      stage,
      {
        includeStage: stageInUrl !== false,
        prefix,
      },
    )

    // Hapi maps 'ANY' as '*'; HEAD routes cannot be registered (Hapi rejects
    // them) so we skip with a notice matching the community plugin's wording.
    const hapiMethod = info.method === 'ANY' ? '*' : info.method
    if (hapiMethod === 'HEAD') {
      logger.notice('HEAD method detected; skipping route mapping')
      continue
    }

    // Route options: mirror `registerRestApiRoutes` conventions.
    //   - state.parse / failAction — cookie handling
    //   - payload.parse: false     — stream raw body to upstream for non-GET
    const routeOptions = {
      cors: corsConfig,
      state: {
        parse: !disableCookieValidation,
        failAction: 'ignore',
      },
      ...(hapiMethod !== 'GET' && hapiMethod !== 'HEAD'
        ? { payload: { parse: false } }
        : {}),
    }

    server.route({
      method: hapiMethod,
      path: hapiPath,
      options: routeOptions,
      handler(request, h) {
        // Substitute path parameters into the upstream URI.
        let uri = proxyUri
        for (const [key, value] of Object.entries(request.params)) {
          uri = uri.replace(`{${key}}`, value)
        }

        // Forward the query string when present.
        if (request.url.search) {
          uri += request.url.search
        }

        return h.proxy({ passThrough: true, uri })
      },
    })

    logger.notice(`${info.method} ${hapiPath} -> ${proxyUri}`)
  }
}
