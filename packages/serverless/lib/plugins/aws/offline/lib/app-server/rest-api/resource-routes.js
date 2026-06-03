/**
 * CloudFormation `resources` block parser for API Gateway HTTP_PROXY routes.
 *
 * The Serverless Framework allows users to define raw CloudFormation resources
 * alongside the functions block.  When a user wires up an `AWS::ApiGateway::Method`
 * with an `HTTP_PROXY` integration (bypassing Lambda entirely), `sls offline`
 * needs to know about those routes so it can forward matching requests upstream
 * instead of returning a 404.
 *
 * This module is intentionally a pure function — no Hapi, no I/O, no throwing —
 * so it can be exercised by unit tests without a live server and called eagerly
 * during option-loading without side effects.
 */

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
