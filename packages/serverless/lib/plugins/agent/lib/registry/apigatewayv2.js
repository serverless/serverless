// Registry entry for the `apigatewayv2` (HTTP + WebSocket API Gateway)
// AWS service.
//
// NOTE: GetApiMappings is intentionally NOT included -- it takes a
// DomainName, not an ApiId, so custom-domain discovery is out of scope
// for v1 (the inventory covers framework-generated resources).

const apiV2Entry = {
  cfnType: 'AWS::ApiGatewayV2::Api',
  awsService: 'apigatewayv2',
  category: 'api',
  engineClient: 'apigatewayv2',
  // PhysicalResourceId is the ApiId as-is (works for both HTTP and
  // WebSocket APIs).
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'api', method: 'GetApi', input: 'ApiId' },
    { key: 'routes', method: 'GetRoutes', input: 'ApiId', paginate: true },
    {
      key: 'integrations',
      method: 'GetIntegrations',
      input: 'ApiId',
      paginate: true,
    },
    { key: 'stages', method: 'GetStages', input: 'ApiId', paginate: true },
    {
      key: 'authorizers',
      method: 'GetAuthorizers',
      input: 'ApiId',
      paginate: true,
    },
    {
      key: 'deployments',
      method: 'GetDeployments',
      input: 'ApiId',
      paginate: true,
    },
    // WebSocket-only in practice (HTTP APIs have no route responses), but
    // declared unconditionally -- HTTP APIs simply have no routes to fan out
    // over, so this yields an empty [] with no calls made. GetRouteResponses
    // needs BOTH the outer ApiId AND a per-route RouteId, so it's a cross-call
    // fan-out over the sibling `routes` call's result (fanOut.overKey) rather
    // than a single ApiId-scoped call. The runner (run-calls.js) resolves the
    // `routes` call first, then fans this out over its Items -- see runCall's
    // overKey handling.
    {
      key: 'routeResponses',
      // The per-item SDK method. For an overKey call there is no parent list
      // method to call (items come from the sibling `routes` result), so this
      // IS the fan-out method -- the runner reuses it as fanOut.method.
      method: 'GetRouteResponses',
      optional: true,
      fanOut: {
        // Source the items from the sibling `routes` call's already-fetched
        // result (its `Items`), one GetRouteResponses per RouteId.
        overKey: 'routes',
        listResultKey: 'Items',
        itemInput: 'RouteId',
        itemField: 'RouteId',
        // RouteId comes from each item; the outer ApiId is a constant on the
        // same call, so it's threaded via extraInput (the itemField-present
        // case where the implicit outer-input carry does not fire -- mirrors
        // cognito.js's UserPoolId+ClientId fan-out).
        extraInput: (apiId) => ({ ApiId: apiId }),
      },
    },
  ],
}

export const apigatewayv2RegistryEntries = [apiV2Entry]
