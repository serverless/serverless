// Registry entry for the `apigateway` (REST API Gateway) AWS service.

const restApiEntry = {
  cfnType: 'AWS::ApiGateway::RestApi',
  awsService: 'apigateway',
  category: 'api',
  engineClient: 'apigateway',
  // PhysicalResourceId is the REST API id as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [
    { key: 'restApi', method: 'GetRestApi', input: 'restApiId' },
    // Resources + their methods/integrations inline via embed=['methods'] --
    // never a per-method GetMethod fan-out. Paginated (restApiId-scoped).
    {
      key: 'resources',
      method: 'GetResources',
      paginate: true,
      params: (identifier) => ({
        restApiId: identifier,
        embed: ['methods'],
      }),
    },
    { key: 'stages', method: 'GetStages', input: 'restApiId' },
    {
      key: 'deployments',
      method: 'GetDeployments',
      input: 'restApiId',
      paginate: true,
    },
    {
      key: 'authorizers',
      method: 'GetAuthorizers',
      input: 'restApiId',
      paginate: true,
    },
    {
      key: 'models',
      method: 'GetModels',
      input: 'restApiId',
      paginate: true,
    },
    {
      key: 'requestValidators',
      method: 'GetRequestValidators',
      input: 'restApiId',
      paginate: true,
    },
    // GetUsagePlans / GetApiKeys are account-wide (no restApiId param) --
    // params is a no-op function rather than binding the identifier under
    // an `input` key. The runner still calls them once per described API;
    // narrowing to this API's usage plans/keys is a post-fetch filter, not
    // an SDK input.
    {
      key: 'usagePlans',
      method: 'GetUsagePlans',
      paginate: true,
      params: () => ({}),
    },
    {
      key: 'apiKeys',
      method: 'GetApiKeys',
      paginate: true,
      params: () => ({}),
    },
  ],
}

export const apigatewayRegistryEntries = [restApiEntry]
