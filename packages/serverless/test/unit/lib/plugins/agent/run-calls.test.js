import { describe, test, expect, jest } from '@jest/globals'
import {
  runResource,
  runMany,
  applyTransforms,
  inlineFunctionRoles,
  roleNameFromArn,
  CONCURRENCY_LANES,
  DEFAULT_LANE_CAP,
} from '../../../../../lib/plugins/agent/lib/run-calls.js'
import { apigatewayv2RegistryEntries } from '../../../../../lib/plugins/agent/lib/registry/apigatewayv2.js'

// A tiny helper to build a mock invoke(awsService, commandName, input) that
// dispatches on commandName. `responses` maps commandName -> value | fn(input).
function mockInvoke(responses) {
  return jest.fn(async (awsService, commandName, input) => {
    const handler = responses[commandName]
    if (handler === undefined) {
      throw new Error(`unexpected command ${commandName}`)
    }
    return typeof handler === 'function' ? handler(input) : handler
  })
}

// SDK-style error: a thrown Error with a `name` and `$metadata.httpStatusCode`.
function sdkError(name, httpStatusCode) {
  const err = new Error(name)
  err.name = name
  err.$metadata = { httpStatusCode }
  return err
}

describe('applyTransforms', () => {
  test('strips $metadata from the response', () => {
    const out = applyTransforms({
      Configuration: { FunctionName: 'f' },
      $metadata: { httpStatusCode: 200, requestId: 'abc' },
    })
    expect(out.$metadata).toBeUndefined()
    expect(out.Configuration.FunctionName).toBe('f')
  })

  test('converts Date values to ISO-8601 strings (deeply)', () => {
    const d = new Date('2026-07-03T12:00:00.000Z')
    const out = applyTransforms({
      Configuration: { LastModified: d, Nested: { When: d } },
    })
    expect(out.Configuration.LastModified).toBe('2026-07-03T12:00:00.000Z')
    expect(out.Configuration.Nested.When).toBe('2026-07-03T12:00:00.000Z')
  })

  test('URL-decodes then JSON.parses an IAM AssumeRolePolicyDocument', () => {
    const doc = { Version: '2012-10-17', Statement: [] }
    const encoded = encodeURIComponent(JSON.stringify(doc))
    const out = applyTransforms({
      Role: { RoleName: 'r', AssumeRolePolicyDocument: encoded },
    })
    expect(out.Role.AssumeRolePolicyDocument).toEqual(doc)
  })

  test('URL-decodes an inline PolicyDocument (GetRolePolicy)', () => {
    const doc = { Version: '2012-10-17', Statement: [{ Effect: 'Allow' }] }
    const encoded = encodeURIComponent(JSON.stringify(doc))
    const out = applyTransforms({
      RoleName: 'r',
      PolicyName: 'p',
      PolicyDocument: encoded,
    })
    expect(out.PolicyDocument).toEqual(doc)
  })

  test('URL-decodes a managed-policy Document (GetPolicyVersion)', () => {
    const doc = { Version: '2012-10-17', Statement: [{ Action: '*' }] }
    const encoded = encodeURIComponent(JSON.stringify(doc))
    const out = applyTransforms({
      PolicyVersion: { Document: encoded, VersionId: 'v1' },
    })
    expect(out.PolicyVersion.Document).toEqual(doc)
  })

  test('JSON.parses a stringified Lambda GetPolicy.Policy', () => {
    const policy = { Version: '2012-10-17', Id: 'default' }
    const out = applyTransforms({
      Policy: JSON.stringify(policy),
    })
    expect(out.Policy).toEqual(policy)
  })

  test('JSON.parses SQS Attributes.Policy and RedrivePolicy', () => {
    const policy = { Version: '2012-10-17' }
    const redrive = { deadLetterTargetArn: 'arn:x', maxReceiveCount: 5 }
    const out = applyTransforms({
      Attributes: {
        Policy: JSON.stringify(policy),
        RedrivePolicy: JSON.stringify(redrive),
        VisibilityTimeout: '30',
      },
    })
    expect(out.Attributes.Policy).toEqual(policy)
    expect(out.Attributes.RedrivePolicy).toEqual(redrive)
    // Non-JSON attribute values are left untouched.
    expect(out.Attributes.VisibilityTimeout).toBe('30')
  })

  test('JSON.parses an S3 bucket policy string', () => {
    const policy = { Version: '2012-10-17', Statement: [] }
    const out = applyTransforms({
      Policy: JSON.stringify(policy),
    })
    expect(out.Policy).toEqual(policy)
  })

  test('JSON.parses a CloudWatch DashboardBody', () => {
    const body = { widgets: [] }
    const out = applyTransforms({
      DashboardBody: JSON.stringify(body),
    })
    expect(out.DashboardBody).toEqual(body)
  })

  test('leaves the original string on parse failure', () => {
    const out = applyTransforms({ Policy: '{ not json' })
    expect(out.Policy).toBe('{ not json')
  })

  test('leaves a non-URL-decodable IAM doc string as-is', () => {
    // A raw non-encoded, non-JSON string cannot be parsed; keep it verbatim.
    const out = applyTransforms({ PolicyDocument: 'plain' })
    expect(out.PolicyDocument).toBe('plain')
  })

  test('drops Lambda GetFunction Code.Location while keeping siblings', () => {
    // Code.Location is a freshly presigned S3 URL minted on every GetFunction
    // call (unique X-Amz-Signature / X-Amz-Security-Token / X-Amz-Date each
    // time) -- non-deterministic AND a credential leak. It must be dropped;
    // stable siblings (RepositoryType, ResolvedImageUri) are preserved.
    const out = applyTransforms({
      Configuration: { FunctionName: 'f' },
      Code: {
        RepositoryType: 'S3',
        ResolvedImageUri: 'foo',
        Location:
          'https://prod-bucket.s3.amazonaws.com/key?X-Amz-Signature=deadbeef&X-Amz-Security-Token=abc',
      },
    })
    expect(out.Code.Location).toBeUndefined()
    expect('Location' in out.Code).toBe(false)
    expect(out.Code.RepositoryType).toBe('S3')
    expect(out.Code.ResolvedImageUri).toBe('foo')
    expect(out.Configuration.FunctionName).toBe('f')
  })

  test('only drops Location under a Code parent, not a top-level Location', () => {
    // The drop is parent-scoped: a `Location` elsewhere in the tree is kept.
    const out = applyTransforms({
      Location: 'https://example.com/keep-me',
      Nested: { Location: 'keep-this-too' },
    })
    expect(out.Location).toBe('https://example.com/keep-me')
    expect(out.Nested.Location).toBe('keep-this-too')
  })
})

describe('runResource — basic callSpec', () => {
  test('builds { [input]: identifierValue }, invokes, stores under key', async () => {
    const entry = {
      awsService: 'lambda',
      calls: [
        { key: 'configuration', method: 'GetFunction', input: 'FunctionName' },
      ],
    }
    const invoke = mockInvoke({
      GetFunction: (input) => ({
        Configuration: { FunctionName: input.FunctionName },
        $metadata: { httpStatusCode: 200 },
      }),
    })
    const result = await runResource({ entry, identifier: 'my-fn', invoke })
    expect(invoke).toHaveBeenCalledWith('lambda', 'GetFunction', {
      FunctionName: 'my-fn',
    })
    expect(result.configuration.Configuration.FunctionName).toBe('my-fn')
    expect(result.configuration.$metadata).toBeUndefined()
  })

  test('uses params(identifier) for account-wide/custom-shaped calls', async () => {
    const entry = {
      awsService: 'sqs',
      calls: [
        {
          key: 'attributes',
          method: 'GetQueueAttributes',
          params: (id) => ({ QueueUrl: id, AttributeNames: ['All'] }),
        },
      ],
    }
    const invoke = mockInvoke({
      GetQueueAttributes: (input) => ({
        Attributes: { QueueUrl: input.QueueUrl },
      }),
    })
    const result = await runResource({
      entry,
      identifier: 'https://sqs/q',
      invoke,
    })
    expect(invoke).toHaveBeenCalledWith('sqs', 'GetQueueAttributes', {
      QueueUrl: 'https://sqs/q',
      AttributeNames: ['All'],
    })
    expect(result.attributes.Attributes.QueueUrl).toBe('https://sqs/q')
  })

  test('spreads a multi-input identifier object (no `input`)', async () => {
    const entry = {
      awsService: 'lambda',
      calls: [{ key: 'layerVersion', method: 'GetLayerVersion' }],
    }
    const invoke = mockInvoke({
      GetLayerVersion: (input) => ({ echo: input }),
    })
    const result = await runResource({
      entry,
      identifier: { LayerName: 'l', VersionNumber: 3 },
      invoke,
    })
    expect(invoke).toHaveBeenCalledWith('lambda', 'GetLayerVersion', {
      LayerName: 'l',
      VersionNumber: 3,
    })
    expect(result.layerVersion.echo).toEqual({
      LayerName: 'l',
      VersionNumber: 3,
    })
  })
})

describe('runResource — optional', () => {
  test('omits the key on a 404/ResourceNotFoundException', async () => {
    const entry = {
      awsService: 'lambda',
      calls: [
        { key: 'configuration', method: 'GetFunction', input: 'FunctionName' },
        {
          key: 'functionUrlConfig',
          method: 'GetFunctionUrlConfig',
          input: 'FunctionName',
          optional: true,
        },
      ],
    }
    const invoke = mockInvoke({
      GetFunction: { Configuration: {} },
      GetFunctionUrlConfig: () => {
        throw sdkError('ResourceNotFoundException', 404)
      },
    })
    const result = await runResource({ entry, identifier: 'fn', invoke })
    expect(result.configuration).toBeDefined()
    expect('functionUrlConfig' in result).toBe(false)
    expect(result.error).toBeUndefined()
  })

  test('omits the key on a NotFound name (S3 NoSuchBucketPolicy)', async () => {
    const entry = {
      awsService: 's3',
      calls: [
        {
          key: 'policy',
          method: 'GetBucketPolicy',
          input: 'Bucket',
          optional: true,
        },
      ],
    }
    const invoke = mockInvoke({
      GetBucketPolicy: () => {
        throw sdkError('NoSuchBucketPolicy', 404)
      },
    })
    const result = await runResource({ entry, identifier: 'b', invoke })
    expect('policy' in result).toBe(false)
    expect(result.error).toBeUndefined()
  })
})

describe('runResource — paginate', () => {
  test('follows NextToken and concatenates list members', async () => {
    const entry = {
      awsService: 'lambda',
      calls: [
        {
          key: 'versions',
          method: 'ListVersionsByFunction',
          input: 'FunctionName',
          paginate: true,
        },
      ],
    }
    const pages = {
      undefined: {
        Versions: [{ Version: '1' }, { Version: '2' }],
        NextToken: 'tok',
      },
      tok: { Versions: [{ Version: '3' }] },
    }
    const invoke = jest.fn(async (svc, cmd, input) => pages[input.NextToken])
    const result = await runResource({ entry, identifier: 'fn', invoke })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.versions.Versions.map((v) => v.Version)).toEqual([
      '1',
      '2',
      '3',
    ])
    // The pagination token is not leaked into the merged result.
    expect(result.versions.NextToken).toBeUndefined()
  })

  test('follows the IAM Marker idiom (IsTruncated)', async () => {
    const entry = {
      awsService: 'iam',
      calls: [
        {
          key: 'inlinePolicyNames',
          method: 'ListRolePolicies',
          input: 'RoleName',
          paginate: true,
        },
      ],
    }
    let call = 0
    const invoke = jest.fn(async () => {
      call += 1
      return call === 1
        ? { PolicyNames: ['a'], IsTruncated: true, Marker: 'm' }
        : { PolicyNames: ['b'], IsTruncated: false }
    })
    const result = await runResource({ entry, identifier: 'r', invoke })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.inlinePolicyNames.PolicyNames).toEqual(['a', 'b'])
  })
})

describe('runResource — fan-out (single hop, IAM inline policies)', () => {
  test('lists then gets each item, reusing the identifier input', async () => {
    const entry = {
      awsService: 'iam',
      calls: [
        {
          key: 'inlinePolicies',
          method: 'ListRolePolicies',
          input: 'RoleName',
          paginate: true,
          fanOut: {
            method: 'GetRolePolicy',
            listResultKey: 'PolicyNames',
            itemInput: 'PolicyName',
          },
        },
      ],
    }
    const doc = { Version: '2012-10-17', Statement: [] }
    const encoded = encodeURIComponent(JSON.stringify(doc))
    const invoke = mockInvoke({
      ListRolePolicies: { PolicyNames: ['p1', 'p2'] },
      GetRolePolicy: (input) => ({
        RoleName: input.RoleName,
        PolicyName: input.PolicyName,
        PolicyDocument: encoded,
      }),
    })
    const result = await runResource({ entry, identifier: 'my-role', invoke })
    // Reuses RoleName from the identifier AND passes each item as PolicyName.
    expect(invoke).toHaveBeenCalledWith('iam', 'GetRolePolicy', {
      RoleName: 'my-role',
      PolicyName: 'p1',
    })
    expect(result.inlinePolicies).toHaveLength(2)
    expect(result.inlinePolicies[0].PolicyName).toBe('p1')
    // Fan-out results are transformed too (URL-decoded doc).
    expect(result.inlinePolicies[0].PolicyDocument).toEqual(doc)
  })
})

describe('runResource — fan-out (two hop, IAM attached policies)', () => {
  test('list -> GetPolicy(itemField) -> GetPolicyVersion(chained resultField)', async () => {
    const entry = {
      awsService: 'iam',
      calls: [
        {
          key: 'attachedPolicies',
          method: 'ListAttachedRolePolicies',
          input: 'RoleName',
          paginate: true,
          fanOut: {
            method: 'GetPolicy',
            listResultKey: 'AttachedPolicies',
            itemInput: 'PolicyArn',
            itemField: 'PolicyArn',
            then: {
              method: 'GetPolicyVersion',
              itemInput: 'PolicyArn',
              fromResult: {
                input: 'VersionId',
                resultField: 'Policy.DefaultVersionId',
              },
            },
          },
        },
      ],
    }
    const doc = { Version: '2012-10-17', Statement: [{ Sid: 'x' }] }
    const encoded = encodeURIComponent(JSON.stringify(doc))
    const arn = 'arn:aws:iam::123:policy/foo'
    const invoke = mockInvoke({
      ListAttachedRolePolicies: {
        AttachedPolicies: [{ PolicyName: 'foo', PolicyArn: arn }],
      },
      GetPolicy: (input) => ({
        Policy: { Arn: input.PolicyArn, DefaultVersionId: 'v3' },
      }),
      GetPolicyVersion: (input) => ({
        PolicyVersion: { VersionId: input.VersionId, Document: encoded },
      }),
    })
    const result = await runResource({ entry, identifier: 'my-role', invoke })

    // First hop uses itemField, NOT the RoleName (GetPolicy is account-level).
    expect(invoke).toHaveBeenCalledWith('iam', 'GetPolicy', { PolicyArn: arn })
    // Chained hop reuses the item's PolicyArn plus the resolved VersionId.
    expect(invoke).toHaveBeenCalledWith('iam', 'GetPolicyVersion', {
      PolicyArn: arn,
      VersionId: 'v3',
    })
    expect(result.attachedPolicies).toHaveLength(1)
    const item = result.attachedPolicies[0]
    expect(item.Policy.DefaultVersionId).toBe('v3')
    expect(item.PolicyVersion.Document).toEqual(doc)
  })
})

describe('runResource — fan-out with a constant outer input (Cognito user pool clients)', () => {
  // Cognito's ListUserPoolClients -> DescribeUserPoolClient fan-out needs BOTH
  // an outer constant (UserPoolId, from the resource identifier) AND a
  // per-item field (ClientId) on the SAME first-hop call -- something the
  // plain `itemField` shape can't express (it only reuses the outer `input`
  // when `itemField` is absent, see run-calls.js's `carriedFromIdentifier`).
  // `fanOut.extraInput(identifier)` is the minimal extension: an optional
  // function producing extra constant params merged into the first-hop
  // input alongside the item field.
  test('merges extraInput(identifier) with the per-item field on the first hop', async () => {
    const entry = {
      awsService: 'cognito-idp',
      calls: [
        {
          key: 'userPoolClients',
          method: 'ListUserPoolClients',
          input: 'UserPoolId',
          paginate: true,
          fanOut: {
            method: 'DescribeUserPoolClient',
            listResultKey: 'UserPoolClients',
            itemInput: 'ClientId',
            itemField: 'ClientId',
            extraInput: (identifier) => ({ UserPoolId: identifier }),
          },
        },
      ],
    }
    const invoke = mockInvoke({
      ListUserPoolClients: {
        UserPoolClients: [{ ClientId: 'c1' }, { ClientId: 'c2' }],
      },
      DescribeUserPoolClient: (input) => ({
        UserPoolClient: {
          UserPoolId: input.UserPoolId,
          ClientId: input.ClientId,
        },
      }),
    })
    const result = await runResource({
      entry,
      identifier: 'us-east-1_abc123',
      invoke,
    })

    expect(invoke).toHaveBeenCalledWith(
      'cognito-idp',
      'DescribeUserPoolClient',
      {
        UserPoolId: 'us-east-1_abc123',
        ClientId: 'c1',
      },
    )
    expect(invoke).toHaveBeenCalledWith(
      'cognito-idp',
      'DescribeUserPoolClient',
      {
        UserPoolId: 'us-east-1_abc123',
        ClientId: 'c2',
      },
    )
    expect(result.userPoolClients).toHaveLength(2)
    expect(result.userPoolClients[0].UserPoolClient.ClientId).toBe('c1')
  })
})

describe('runResource — overKey cross-call fan-out (real apigatewayv2 entry, end-to-end expand)', () => {
  // Regression guard for the API Gateway v2 expansion bug: the registry's
  // `routeResponses` call fans out over the SIBLING `routes` call's result
  // (fanOut.overKey: 'routes'), calling GetRouteResponses once per route with
  // BOTH the outer ApiId AND each RouteId. Before overKey was implemented the
  // runner invoked GetRouteResponses with empty input -> MissingRequiredParameter
  // (NOT a NotFound, so `optional` didn't catch it) -> the WHOLE apigatewayv2
  // resource was marked { error }, losing api/routes/integrations/stages for
  // both HTTP and WebSocket APIs. This runs the real registry entry end-to-end.
  const [apiV2Entry] = apigatewayv2RegistryEntries

  test('fully describes the API (no { error }) and fans route responses out per route with ApiId+RouteId', async () => {
    const invoke = mockInvoke({
      GetApi: (input) => ({ ApiId: input.ApiId, ProtocolType: 'WEBSOCKET' }),
      GetRoutes: {
        Items: [
          { RouteId: 'r-connect', RouteKey: '$connect' },
          { RouteId: 'r-default', RouteKey: '$default' },
        ],
      },
      GetIntegrations: { Items: [{ IntegrationId: 'i1' }] },
      GetStages: { Items: [{ StageName: 'prod' }] },
      GetAuthorizers: { Items: [] },
      GetDeployments: { Items: [{ DeploymentId: 'd1' }] },
      GetRouteResponses: (input) => ({
        // Echo the inputs so the test can assert both were threaded through.
        _apiId: input.ApiId,
        _routeId: input.RouteId,
        Items: [{ RouteResponseId: `rr-${input.RouteId}` }],
      }),
    })

    const result = await runResource({
      entry: apiV2Entry,
      identifier: 'api-123',
      invoke,
    })

    // The resource is fully described -- NOT errored.
    expect(result.error).toBeUndefined()
    expect(result.api.ApiId).toBe('api-123')
    expect(result.routes.Items).toHaveLength(2)
    expect(result.integrations.Items).toHaveLength(1)
    expect(result.stages.Items).toHaveLength(1)
    expect(result.deployments.Items).toHaveLength(1)

    // GetRouteResponses is fanned out per route with BOTH ApiId and RouteId.
    expect(invoke).toHaveBeenCalledWith('apigatewayv2', 'GetRouteResponses', {
      ApiId: 'api-123',
      RouteId: 'r-connect',
    })
    expect(invoke).toHaveBeenCalledWith('apigatewayv2', 'GetRouteResponses', {
      ApiId: 'api-123',
      RouteId: 'r-default',
    })

    // Assembled per-route (order aligned with the routes list).
    expect(result.routeResponses).toHaveLength(2)
    expect(result.routeResponses[0]._apiId).toBe('api-123')
    expect(result.routeResponses[0]._routeId).toBe('r-connect')
    expect(result.routeResponses[1]._routeId).toBe('r-default')
  })

  test('an HTTP API with no routes yields an empty routeResponses fan-out (no calls, no error)', async () => {
    const invoke = mockInvoke({
      GetApi: (input) => ({ ApiId: input.ApiId, ProtocolType: 'HTTP' }),
      GetRoutes: { Items: [] },
      GetIntegrations: { Items: [] },
      GetStages: { Items: [{ StageName: '$default' }] },
      GetAuthorizers: { Items: [] },
      GetDeployments: { Items: [] },
      // GetRouteResponses intentionally absent: with no routes it must never
      // be invoked (mockInvoke throws on an unexpected command otherwise).
    })

    const result = await runResource({
      entry: apiV2Entry,
      identifier: 'http-api',
      invoke,
    })

    expect(result.error).toBeUndefined()
    expect(result.api.ProtocolType).toBe('HTTP')
    expect(result.routeResponses).toEqual([])
    expect(invoke).not.toHaveBeenCalledWith(
      'apigatewayv2',
      'GetRouteResponses',
      expect.anything(),
    )
  })
})

describe('runResource — error classes', () => {
  test('captures { error } on a 404 for a NON-optional call', async () => {
    const entry = {
      awsService: 'lambda',
      calls: [
        { key: 'configuration', method: 'GetFunction', input: 'FunctionName' },
      ],
    }
    const invoke = mockInvoke({
      GetFunction: () => {
        throw sdkError('ResourceNotFoundException', 404)
      },
    })
    const result = await runResource({ entry, identifier: 'gone', invoke })
    expect(result.error).toBeDefined()
    expect(result.error).toMatch(/not.?found/i)
  })

  test('captures { error } on AccessDenied, distinct from NotFound text', async () => {
    const entry = {
      awsService: 's3',
      calls: [{ key: 'acl', method: 'GetBucketAcl', input: 'Bucket' }],
    }
    const invoke = mockInvoke({
      GetBucketAcl: () => {
        throw sdkError('AccessDenied', 403)
      },
    })
    const result = await runResource({ entry, identifier: 'b', invoke })
    expect(result.error).toBeDefined()
    expect(result.error).toMatch(/access.?denied/i)
  })

  test('captures { error } on a residual 429/Throttling that escaped retry', async () => {
    const entry = {
      awsService: 'apigateway',
      calls: [{ key: 'resources', method: 'GetResources', input: 'restApiId' }],
    }
    const invoke = mockInvoke({
      GetResources: () => {
        throw sdkError('ThrottlingException', 429)
      },
    })
    const result = await runResource({ entry, identifier: 'api', invoke })
    expect(result.error).toBeDefined()
    expect(result.error).toMatch(/throttl/i)
  })

  test('one failing call does not abort the other calls in the resource', async () => {
    const entry = {
      awsService: 'lambda',
      calls: [
        { key: 'configuration', method: 'GetFunction', input: 'FunctionName' },
        { key: 'aliases', method: 'ListAliases', input: 'FunctionName' },
      ],
    }
    const invoke = mockInvoke({
      GetFunction: { Configuration: { FunctionName: 'fn' } },
      ListAliases: () => {
        throw sdkError('AccessDenied', 403)
      },
    })
    const result = await runResource({ entry, identifier: 'fn', invoke })
    // The whole resource is marked as errored, but the successful call's data
    // is still present.
    expect(result.configuration.Configuration.FunctionName).toBe('fn')
    expect(result.error).toMatch(/access.?denied/i)
  })
})

describe('runMany — concurrency lanes', () => {
  test('apigateway + apigatewayv2 share a lane that never exceeds its cap', async () => {
    const cap = CONCURRENCY_LANES.apigateway
    expect(cap).toBeLessThanOrEqual(2)
    // Both apigateway and apigatewayv2 resolve to the same lane.
    let inFlight = 0
    let maxInFlight = 0
    const invoke = jest.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { ok: true }
    })
    const makeEntry = (svc) => ({
      awsService: svc,
      calls: [{ key: 'k', method: 'M', input: 'id' }],
    })
    const resources = []
    for (let i = 0; i < 6; i += 1) {
      resources.push({
        entry: makeEntry('apigateway'),
        identifier: `rest-${i}`,
      })
      resources.push({
        entry: makeEntry('apigatewayv2'),
        identifier: `http-${i}`,
      })
    }
    await runMany({ resources, invoke })
    expect(maxInFlight).toBeLessThanOrEqual(cap)
  })

  test('a multi-call apigateway entry: concurrent GetResources stays <= cap, even though combined in-flight control-plane calls can exceed it', async () => {
    // The lane cap bounds concurrent RESOURCES, not total control-plane calls.
    // A single REST-API entry issues several calls (here: GetResources plus a
    // couple of other reads) via Promise.all in `runResource`, so with 2
    // resources in flight the lane can legitimately have MORE than `cap`
    // combined calls in flight at once. What must stay bounded is the
    // quota-bearing call itself: GetResources (5 req / 2s, account-wide).
    const cap = CONCURRENCY_LANES.apigateway
    const inFlightByCommand = {}
    const maxInFlightByCommand = {}
    let maxCombinedInFlight = 0
    let combinedInFlight = 0
    const invoke = jest.fn(async (awsService, commandName) => {
      inFlightByCommand[commandName] = (inFlightByCommand[commandName] || 0) + 1
      maxInFlightByCommand[commandName] = Math.max(
        maxInFlightByCommand[commandName] || 0,
        inFlightByCommand[commandName],
      )
      combinedInFlight += 1
      maxCombinedInFlight = Math.max(maxCombinedInFlight, combinedInFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlightByCommand[commandName] -= 1
      combinedInFlight -= 1
      return { ok: true }
    })

    const multiCallEntry = (svc) => ({
      awsService: svc,
      calls: [
        { key: 'resources', method: 'GetResources', input: 'restApiId' },
        { key: 'stages', method: 'GetStages', input: 'restApiId' },
        { key: 'authorizers', method: 'GetAuthorizers', input: 'restApiId' },
      ],
    })
    const resources = []
    for (let i = 0; i < 6; i += 1) {
      resources.push({
        entry: multiCallEntry('apigateway'),
        identifier: `rest-${i}`,
      })
    }

    await runMany({ resources, invoke })

    // The meaningful bound: concurrent GetResources (the tightest quota)
    // never exceeds the lane cap.
    expect(maxInFlightByCommand.GetResources).toBeLessThanOrEqual(cap)
    // By design, the COMBINED in-flight control-plane call count (across
    // GetResources/GetStages/GetAuthorizers for the resources sharing the
    // lane) can exceed the resource-level cap -- each in-flight resource
    // fires all of its calls via Promise.all. This is expected and is why
    // the runner leans on the invoker's retry strategy for the looser
    // combined ~10 rps quota.
    expect(maxCombinedInFlight).toBeGreaterThan(cap)
  })

  test('non-apigateway services use the larger default lane cap', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const invoke = jest.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { ok: true }
    })
    const resources = []
    for (let i = 0; i < 30; i += 1) {
      resources.push({
        entry: {
          awsService: 'lambda',
          calls: [{ key: 'k', method: 'M', input: 'id' }],
        },
        identifier: `fn-${i}`,
      })
    }
    await runMany({ resources, invoke })
    // Should have run many at once (more than the tiny apigateway cap).
    expect(maxInFlight).toBeGreaterThan(CONCURRENCY_LANES.apigateway)
    expect(maxInFlight).toBeLessThanOrEqual(DEFAULT_LANE_CAP)
  })

  test('returns results positionally aligned with the input resources', async () => {
    const invoke = mockInvoke({
      GetFunction: (input) => ({
        Configuration: { FunctionName: input.FunctionName },
      }),
    })
    const resources = [
      {
        entry: {
          awsService: 'lambda',
          calls: [
            {
              key: 'configuration',
              method: 'GetFunction',
              input: 'FunctionName',
            },
          ],
        },
        identifier: 'a',
      },
      {
        entry: {
          awsService: 'lambda',
          calls: [
            {
              key: 'configuration',
              method: 'GetFunction',
              input: 'FunctionName',
            },
          ],
        },
        identifier: 'b',
      },
    ]
    const results = await runMany({ resources, invoke })
    expect(results).toHaveLength(2)
    expect(results[0].configuration.Configuration.FunctionName).toBe('a')
    expect(results[1].configuration.Configuration.FunctionName).toBe('b')
  })

  test('a per-resource failure does not abort the whole batch', async () => {
    const invoke = jest.fn(async (svc, cmd, input) => {
      if (input.FunctionName === 'bad') throw sdkError('AccessDenied', 403)
      return { Configuration: { FunctionName: input.FunctionName } }
    })
    const mk = (id) => ({
      entry: {
        awsService: 'lambda',
        calls: [
          {
            key: 'configuration',
            method: 'GetFunction',
            input: 'FunctionName',
          },
        ],
      },
      identifier: id,
    })
    const results = await runMany({ resources: [mk('ok'), mk('bad')], invoke })
    expect(results[0].configuration.Configuration.FunctionName).toBe('ok')
    expect(results[1].error).toMatch(/access.?denied/i)
  })
})

describe('roleNameFromArn', () => {
  test('extracts the role name from a standard aws-partition ARN', () => {
    expect(
      roleNameFromArn(
        'arn:aws:iam::123456789012:role/orders-api-dev-lambdaRole',
      ),
    ).toBe('orders-api-dev-lambdaRole')
  })

  test('extracts the role name from an aws-cn partition ARN', () => {
    expect(
      roleNameFromArn(
        'arn:aws-cn:iam::123456789012:role/orders-api-dev-lambdaRole',
      ),
    ).toBe('orders-api-dev-lambdaRole')
  })

  test('extracts the role name from an aws-us-gov partition ARN', () => {
    expect(
      roleNameFromArn(
        'arn:aws-us-gov:iam::123456789012:role/orders-api-dev-lambdaRole',
      ),
    ).toBe('orders-api-dev-lambdaRole')
  })

  test('extracts the role name when the role has a path', () => {
    expect(
      roleNameFromArn(
        'arn:aws:iam::123456789012:role/some/nested/path/my-role',
      ),
    ).toBe('my-role')
  })
})

describe('inlineFunctionRoles', () => {
  const iamEntry = {
    cfnType: 'AWS::IAM::Role',
    awsService: 'iam',
    calls: [{ key: 'role', method: 'GetRole', input: 'RoleName' }],
  }

  function functionResult(roleArn) {
    return {
      configuration: {
        Configuration: {
          FunctionName: 'fn',
          Role: roleArn,
        },
      },
    }
  }

  test('attaches the described role under functions.<logicalId>.role', async () => {
    const invoke = mockInvoke({
      GetRole: (input) => ({
        Role: { RoleName: input.RoleName, Arn: 'arn:aws:iam::1:role/x' },
      }),
    })
    const resources = {
      functions: {
        CreateOrderLambdaFunction: functionResult(
          'arn:aws:iam::123456789012:role/orders-api-dev-lambdaRole',
        ),
      },
    }

    await inlineFunctionRoles({ resources, invoke, iamEntry })

    expect(
      resources.functions.CreateOrderLambdaFunction.role.role.Role.RoleName,
    ).toBe('orders-api-dev-lambdaRole')
    // The IAM entry's calls actually ran (GetRole invoked for the derived
    // role name).
    expect(invoke).toHaveBeenCalledWith(
      'iam',
      'GetRole',
      expect.objectContaining({ RoleName: 'orders-api-dev-lambdaRole' }),
    )
  })

  test('describes a shared role only once and reuses the result for every function using it', async () => {
    const invoke = mockInvoke({
      GetRole: (input) => ({
        Role: { RoleName: input.RoleName },
      }),
    })
    const resources = {
      functions: {
        FnA: functionResult('arn:aws:iam::123456789012:role/SharedRole'),
        FnB: functionResult('arn:aws:iam::123456789012:role/SharedRole'),
      },
    }

    await inlineFunctionRoles({ resources, invoke, iamEntry })

    // Only one GetRole call total, even though two functions share the role.
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(resources.functions.FnA.role).toBe(resources.functions.FnB.role)
  })

  test('a role-describe failure attaches {error} to that function without dropping the function or affecting others', async () => {
    const invoke = jest.fn(async (awsService, method, input) => {
      if (input.RoleName === 'BrokenRole') {
        const err = new Error('no such entity')
        err.name = 'NoSuchEntityException'
        err.$metadata = { httpStatusCode: 404 }
        throw err
      }
      return { Role: { RoleName: input.RoleName } }
    })
    const resources = {
      functions: {
        Broken: functionResult('arn:aws:iam::123456789012:role/BrokenRole'),
        Fine: functionResult('arn:aws:iam::123456789012:role/FineRole'),
      },
    }

    await inlineFunctionRoles({ resources, invoke, iamEntry })

    expect(resources.functions.Broken.role.error).toBeDefined()
    expect(resources.functions.Broken).toBeDefined()
    expect(resources.functions.Fine.role.error).toBeUndefined()
    expect(resources.functions.Fine.role.role.Role.RoleName).toBe('FineRole')
  })

  test('skips inlining when a function result has no resolvable Configuration.Role (e.g. GetFunction itself errored)', async () => {
    const invoke = jest.fn(async () => ({ Role: {} }))
    const resources = {
      functions: {
        Errored: { error: 'AccessDenied error calling GetFunction' },
      },
    }

    await inlineFunctionRoles({ resources, invoke, iamEntry })

    expect(resources.functions.Errored.role).toBeUndefined()
    expect(invoke).not.toHaveBeenCalled()
  })

  test('no-op when there is no functions category', async () => {
    const invoke = jest.fn(async () => ({}))
    const resources = { iam: { SomeRole: { role: {} } } }

    await inlineFunctionRoles({ resources, invoke, iamEntry })

    expect(invoke).not.toHaveBeenCalled()
  })
})
