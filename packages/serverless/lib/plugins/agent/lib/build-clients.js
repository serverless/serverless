// The client factory: supplies the real `invoke(awsService, commandName,
// input) => Promise<sdkResponse>` function that lib/run-calls.js
// depends on.
//
// CREDENTIAL HANDOFF (verified, documented here since it's a load-bearing
// contract between this file and its caller, inspect.js):
//   The caller (the `agent inspect` command plugin) resolves
//   `const c = await this.provider.getCredentials()`, which returns FLAT
//   credentials: `{ accessKeyId, secretAccessKey, sessionToken, accountId,
//   callerArn }`. This factory does NOT call getCredentials() itself and does
//   NOT accept that flat shape -- the caller is responsible for shaping it
//   into the already-nested form this factory expects:
//
//     createInvoker({
//       region: this.options.region || this.provider.getRegion(),
//       credentials: {
//         accessKeyId: c.accessKeyId,
//         secretAccessKey: c.secretAccessKey,
//         sessionToken: c.sessionToken,
//       },
//     })
//
//   i.e. `credentials` here should already be the flat-minus-extras object
//   (accountId/callerArn dropped) -- this is exactly the shape
//   `new AwsXClient({ region, credentials })` wants, matching how the rest of
//   the framework (deploy) constructs the same engine client classes. As a
//   defensive belt-and-suspenders measure this factory ALSO narrows
//   `credentials` down to { accessKeyId, secretAccessKey, sessionToken } right
//   before constructing each engine client, so even if a caller passes the
//   full flat getCredentials() result through unshaped, accountId/callerArn
//   never reach the SDK.
//
// CLIENT CONSTRUCTION & COMMAND DISPATCH:
//   Each awsService token maps to an @serverless/engine client class (see
//   packages/engine/src/lib/aws/*.js). Every one is proxy/CA-wrapped via
//   addProxyToAwsClient(); most also carry a 10-attempt ConfiguredRetryStrategy,
//   but AwsCloudWatchClient (the `logs` and `cloudwatch` tokens) and the API
//   Gateway clients (`apigateway`/`apigatewayv2`) do not — those fall back to
//   the AWS SDK's default retry, so throttling on them is retried less
//   aggressively (hardening those shared clients is a deferred follow-up). One
//   instance is constructed per (awsService, region) and cached for the life
//   of the invoker. To dispatch a command generically we import the
//   service's raw @aws-sdk/client-<x> module and do
//   `client.send(new SdkModule[commandName + 'Command'](input))`.
//
//   NOTE on `.client`: most engine classes expose the raw proxy-wrapped SDK
//   client as `this.client` (AwsLambdaClient, AwsIamClient, AwsAlbClient,
//   AwsEventBridgeClient, AwsS3Client, AwsDynamoDBClient, AwsSqsClient).
//   AwsRestApiGatewayClient and AwsHttpApiGatewayClient do NOT -- they expose
//   `this.apiGatewayClient` / `this.apiGatewayV2Client` (plus an unrelated
//   `this.cloudWatchClient` for metrics, not used here). SERVICE_MAP below
//   records the right property name per service so dispatch stays generic.
//
// S3 REGIONAL HOP:
//   S3 buckets can live in a region other than the stack's. The generic
//   invoker is region-fixed (one client per awsService+region), so the S3
//   path is special-cased: the FIRST time a given bucket is seen, its
//   GetBucketLocation call runs on the base-region client; the resolved
//   region is cached per-bucket, and if it differs from the base region, an
//   S3 client scoped to that region is constructed (and cached) for that
//   bucket's remaining calls. A `LocationConstraint` of '' or null means
//   us-east-1 (SDK quirk) -- no extra client needed. This routing lives
//   entirely inside `invoke()`; callers (the runner, the registry) don't need
//   to know about it -- they just call `invoke('s3', method, { Bucket, ...})`
//   like any other service and the bucket's resolved region is threaded
//   through by the Bucket param.
//
//   If the GetBucketLocation call itself fails (e.g. AccessDenied on that
//   specific call), the bucket falls back to the base-region client for its
//   remaining calls instead of caching and replaying that rejection -- most
//   buckets live in the base region, so this lets those calls succeed rather
//   than one denied location call failing every sibling call for the bucket.
//   A genuinely cross-region bucket whose location is undiscoverable will
//   still surface real per-call errors downstream (acceptable).
//
//   CLOUDFRONT IS GLOBAL (always us-east-1):
//   CloudFront's control plane only exists in us-east-1 -- distributions and
//   cache policies are account-wide, not tied to the stack's deploy region.
//   SERVICE_MAP's `cloudfront` entry carries a `region: 'us-east-1'`
//   override; getClient()/sendCommand() use it as the default `clientRegion`
//   whenever the caller doesn't pass one explicitly, so `invoke('cloudfront',
//   ...)` always resolves to a us-east-1-pinned client regardless of
//   this factory's base `region`. This reuses the exact per-call
//   `clientRegion` mechanism the S3 regional hop already relies on above --
//   no new plumbing, just a per-service default baked into SERVICE_MAP.

import { AwsLambdaClient } from '@serverless/engine/src/lib/aws/lambda.js'
import { AwsIamClient } from '@serverless/engine/src/lib/aws/iam.js'
import { AwsRestApiGatewayClient } from '@serverless/engine/src/lib/aws/restApiGateway.js'
import { AwsHttpApiGatewayClient } from '@serverless/engine/src/lib/aws/httpApiGateway.js'
import { AwsAlbClient } from '@serverless/engine/src/lib/aws/alb.js'
import { AwsEventBridgeClient } from '@serverless/engine/src/lib/aws/eventbridge.js'
import { AwsS3Client } from '@serverless/engine/src/lib/aws/s3.js'
import { AwsDynamoDBClient } from '@serverless/engine/src/lib/aws/dynamodb.js'
import { AwsSqsClient } from '@serverless/engine/src/lib/aws/sqs.js'
import { AwsSnsClient } from '@serverless/engine/src/lib/aws/sns.js'
import { AwsSchedulerClient } from '@serverless/engine/src/lib/aws/scheduler.js'
import { AwsCognitoClient } from '@serverless/engine/src/lib/aws/cognito.js'
import { AwsIotClient } from '@serverless/engine/src/lib/aws/iot.js'
import { AwsKinesisClient } from '@serverless/engine/src/lib/aws/kinesis.js'
import { AwsCloudWatchClient } from '@serverless/engine/src/lib/aws/cloudwatch.js'
import { AwsCloudFrontClient } from '@serverless/engine/src/lib/aws/cloudfront.js'
import { AwsLambdaMicrovmsClient } from '@serverless/engine/src/lib/aws/lambda-microvms.js'

import * as LambdaSdk from '@aws-sdk/client-lambda'
import * as IamSdk from '@aws-sdk/client-iam'
import * as ApiGatewaySdk from '@aws-sdk/client-api-gateway'
import * as ApiGatewayV2Sdk from '@aws-sdk/client-apigatewayv2'
import * as ElasticLoadBalancingV2Sdk from '@aws-sdk/client-elastic-load-balancing-v2'
import * as EventBridgeSdk from '@aws-sdk/client-eventbridge'
import * as S3Sdk from '@aws-sdk/client-s3'
import * as DynamoDBSdk from '@aws-sdk/client-dynamodb'
import * as SqsSdk from '@aws-sdk/client-sqs'
import * as SnsSdk from '@aws-sdk/client-sns'
import * as SchedulerSdk from '@aws-sdk/client-scheduler'
import * as CognitoSdk from '@aws-sdk/client-cognito-identity-provider'
import * as IotSdk from '@aws-sdk/client-iot'
import * as KinesisSdk from '@aws-sdk/client-kinesis'
import * as CloudWatchLogsSdk from '@aws-sdk/client-cloudwatch-logs'
import * as CloudWatchSdk from '@aws-sdk/client-cloudwatch'
import * as CloudFrontSdk from '@aws-sdk/client-cloudfront'
import * as LambdaMicrovmsSdk from '@aws-sdk/client-lambda-microvms'

// awsService token -> { EngineClientClass, sdkModule, clientProp }. Adding a
// new service is one entry here -- no other change to this file's logic is
// required.
//
// CLOUDWATCH REUSE: `AwsCloudWatchClient` wraps TWO proxy-wrapped SDK clients
// -- `this.logsClient` (@aws-sdk/client-cloudwatch-logs, for log groups) and
// `this.metricsClient` (@aws-sdk/client-cloudwatch, for alarms/dashboards).
// So the two observability service tokens reuse the same engine class but
// point `clientProp` + `sdkModule` at the relevant sub-client: `logs` ->
// logsClient + CloudWatchLogsSdk, `cloudwatch` -> metricsClient +
// CloudWatchSdk. `GetDashboardCommand` need not be a wrapper method on the
// engine class -- generic dispatch constructs it from CloudWatchSdk.
//
// LAMBDA-MICROVMS (Sandboxes): only `AWS::Lambda::MicrovmImage` is
// describable (via GetMicrovmImage). `AWS::Lambda::NetworkConnector` has no
// describe operation in the SDK, so the registry marks it index-only
// (awsService: null) and it never reaches this factory. AwsLambdaMicrovmsClient
// honors AWS_ENDPOINT_URL_LAMBDA_MICROVMS internally (for the Sandboxes
// emulator / dev mode); nothing region-special is needed here.
const SERVICE_MAP = {
  lambda: {
    EngineClientClass: AwsLambdaClient,
    sdkModule: LambdaSdk,
    clientProp: 'client',
  },
  iam: {
    EngineClientClass: AwsIamClient,
    sdkModule: IamSdk,
    clientProp: 'client',
  },
  apigateway: {
    EngineClientClass: AwsRestApiGatewayClient,
    sdkModule: ApiGatewaySdk,
    clientProp: 'apiGatewayClient',
  },
  apigatewayv2: {
    EngineClientClass: AwsHttpApiGatewayClient,
    sdkModule: ApiGatewayV2Sdk,
    clientProp: 'apiGatewayV2Client',
  },
  elbv2: {
    EngineClientClass: AwsAlbClient,
    sdkModule: ElasticLoadBalancingV2Sdk,
    clientProp: 'client',
  },
  eventbridge: {
    EngineClientClass: AwsEventBridgeClient,
    sdkModule: EventBridgeSdk,
    clientProp: 'client',
  },
  s3: {
    EngineClientClass: AwsS3Client,
    sdkModule: S3Sdk,
    clientProp: 'client',
  },
  dynamodb: {
    EngineClientClass: AwsDynamoDBClient,
    sdkModule: DynamoDBSdk,
    clientProp: 'client',
  },
  sqs: {
    EngineClientClass: AwsSqsClient,
    sdkModule: SqsSdk,
    clientProp: 'client',
  },
  sns: {
    EngineClientClass: AwsSnsClient,
    sdkModule: SnsSdk,
    clientProp: 'client',
  },
  scheduler: {
    EngineClientClass: AwsSchedulerClient,
    sdkModule: SchedulerSdk,
    clientProp: 'client',
  },
  'cognito-idp': {
    EngineClientClass: AwsCognitoClient,
    sdkModule: CognitoSdk,
    clientProp: 'client',
  },
  iot: {
    EngineClientClass: AwsIotClient,
    sdkModule: IotSdk,
    clientProp: 'client',
  },
  kinesis: {
    EngineClientClass: AwsKinesisClient,
    sdkModule: KinesisSdk,
    clientProp: 'client',
  },
  'lambda-microvms': {
    EngineClientClass: AwsLambdaMicrovmsClient,
    sdkModule: LambdaMicrovmsSdk,
    clientProp: 'client',
  },
  // Observability: both tokens reuse AwsCloudWatchClient's two sub-clients
  // (see the CLOUDWATCH REUSE note above).
  logs: {
    EngineClientClass: AwsCloudWatchClient,
    sdkModule: CloudWatchLogsSdk,
    clientProp: 'logsClient',
  },
  cloudwatch: {
    EngineClientClass: AwsCloudWatchClient,
    sdkModule: CloudWatchSdk,
    clientProp: 'metricsClient',
  },
  // GLOBAL service -- `region: 'us-east-1'` overrides this factory's base
  // region as the default `clientRegion` for every cloudfront call (see the
  // CLOUDFRONT IS GLOBAL note above). Callers can still pass an explicit
  // clientRegion to getClient()/sendCommand(), but invoke('cloudfront', ...)
  // never does, so it always resolves to this default.
  cloudfront: {
    EngineClientClass: AwsCloudFrontClient,
    sdkModule: CloudFrontSdk,
    clientProp: 'client',
    region: 'us-east-1',
  },
}

// A LocationConstraint of '' or null/undefined means us-east-1 (a long-
// standing S3 API quirk -- GetBucketLocation never actually returns the
// literal string 'us-east-1').
function normalizeBucketRegion(locationConstraint) {
  return locationConstraint || 'us-east-1'
}

/**
 * Builds the real `invoke` function that packages/serverless/lib/plugins/agent/lib/run-calls.js
 * is designed against, plus a `getClient` escape hatch for callers
 * that need the underlying engine client directly (e.g. inspect.js's
 * IAM-inline fan-out, or future non-generic needs).
 *
 * @param {object} args
 * @param {string} args.region - the stack/base region (this.provider.getRegion()
 *   or --region).
 * @param {object} args.credentials - ALREADY-NESTED shape:
 *   { accessKeyId, secretAccessKey, sessionToken }. See the credential-handoff
 *   note at the top of this file -- accountId/callerArn must already be
 *   dropped by the caller.
 * @returns {{ invoke: function, getClient: function }}
 */
function createInvoker({ region, credentials }) {
  // Cache of constructed engine-client instances, keyed by `${awsService}:${region}`.
  const clientCache = new Map()

  // Cache of bucket region RESOLUTIONS (promises, not just resolved values),
  // keyed by bucket name. run-calls.js's runResource() fires every callSpec
  // for a resource concurrently (Promise.all) -- including GetBucketLocation
  // itself alongside the other ~9 S3 Get* calls for the same bucket -- so
  // caching the in-flight promise (not just the settled value) is required
  // to avoid a duplicate GetBucketLocation race when calls for a
  // never-before-seen bucket land in the same tick.
  //
  // IMPORTANT: this cache must never be left holding a permanently-rejected
  // promise. If GetBucketLocation itself fails (e.g. AccessDenied on that one
  // call), resolveBucketLocation() below catches it and replaces the cached
  // entry with a resolved fallback-to-base-region marker -- see there for why.
  const bucketRegionCache = new Map()

  function getClient(awsService, clientRegion) {
    const serviceConfig = SERVICE_MAP[awsService]
    if (!serviceConfig) {
      throw new Error(
        `build-clients: unknown awsService "${awsService}" -- no engine client registered for it`,
      )
    }
    // Resolution order: an explicit clientRegion argument wins (e.g. S3's
    // regional hop); otherwise a SERVICE_MAP `region` override wins (e.g.
    // cloudfront's us-east-1 pin, since CloudFront is global); otherwise fall
    // back to this factory's base region.
    const resolvedRegion = clientRegion || serviceConfig.region || region
    const cacheKey = `${awsService}:${resolvedRegion}`
    if (!clientCache.has(cacheKey)) {
      // Defensively narrow to the three fields the SDK v3 credential shape
      // wants, even if the caller's `credentials` object carries extras
      // (e.g. accountId/callerArn from an unshaped getCredentials() result) --
      // the nested object handed to the engine client must never leak them.
      const { accessKeyId, secretAccessKey, sessionToken } = credentials || {}
      const engineClient = new serviceConfig.EngineClientClass({
        region: resolvedRegion,
        credentials: { accessKeyId, secretAccessKey, sessionToken },
      })
      clientCache.set(cacheKey, engineClient)
    }
    return clientCache.get(cacheKey)
  }

  function resolveCommandCtor(awsService, commandName) {
    const serviceConfig = SERVICE_MAP[awsService]
    const ctorName = `${commandName}Command`
    const CommandCtor = serviceConfig.sdkModule[ctorName]
    if (!CommandCtor) {
      throw new Error(
        `build-clients: no "${ctorName}" export found for awsService "${awsService}" -- check the registry entry's method name and SERVICE_MAP's sdkModule for a typo`,
      )
    }
    return CommandCtor
  }

  async function sendCommand(awsService, clientRegion, commandName, input) {
    const serviceConfig = SERVICE_MAP[awsService]
    if (!serviceConfig) {
      throw new Error(
        `build-clients: unknown awsService "${awsService}" -- no engine client registered for it`,
      )
    }
    const CommandCtor = resolveCommandCtor(awsService, commandName)
    const engineClient = getClient(awsService, clientRegion)
    const rawClient = engineClient[serviceConfig.clientProp]
    return rawClient.send(new CommandCtor(input))
  }

  // Marker cached (wrapped in a RESOLVED promise, never a rejection) when a
  // bucket's GetBucketLocation call itself fails. Most buckets live in the
  // base region, so falling back to the base-region client for the bucket's
  // other calls (which don't depend on the location lookup succeeding) lets
  // those succeed instead of all failing with the same location error. A
  // genuinely cross-region bucket whose location couldn't be discovered will
  // still surface real per-call errors downstream against the (wrong)
  // base-region client -- acceptable, since that's strictly better than one
  // denied location call nuking every sibling call for the bucket. The
  // original error is carried along so a caller specifically asking for
  // GetBucketLocation still sees the real failure, without re-issuing the
  // (already-failed) AWS call a second time.
  function locationUnresolvedMarker(error) {
    return { locationUnresolved: true, error }
  }

  // Resolves (and caches, de-duping concurrent callers) a bucket's
  // GetBucketLocation response via the base-region client. Caching the
  // in-flight promise -- not just the settled value -- means multiple calls
  // for the same never-before-seen bucket that race in together (runResource()
  // fires a bucket's ~10 S3 calls concurrently) still only trigger one
  // GetBucketLocation request.
  //
  // If the GetBucketLocation call rejects, the cached entry is replaced with
  // a RESOLVED fallback marker (see locationUnresolvedMarker) rather than
  // left as a rejected promise -- so the failure isn't sticky (a later
  // run/retry gets a fresh shot at resolving the real location) and sibling
  // calls in this run don't all replay the same rejection.
  function resolveBucketLocation(bucket) {
    if (!bucketRegionCache.has(bucket)) {
      const resolution = sendCommand('s3', region, 'GetBucketLocation', {
        Bucket: bucket,
      }).catch((error) => locationUnresolvedMarker(error))
      bucketRegionCache.set(bucket, resolution)
    }
    return bucketRegionCache.get(bucket)
  }

  // S3's regional hop: resolve+cache the bucket's region on first sight, then
  // route every call for that bucket through the region-scoped client. The
  // triggering GetBucketLocation call itself reuses the cached resolution
  // rather than firing a second, identical request -- including when that
  // resolution is a fallback marker, in which case the original error is
  // re-thrown (not masked) so the caller who asked for GetBucketLocation
  // sees the real failure.
  async function invokeS3(commandName, input) {
    const bucket = input && input.Bucket

    if (!bucket) {
      // Account-wide S3 calls (none currently in the registry, but keep this
      // generic) run on the base-region client.
      return sendCommand('s3', region, commandName, input)
    }

    const locationResponse = await resolveBucketLocation(bucket)

    if (locationResponse && locationResponse.locationUnresolved) {
      if (commandName === 'GetBucketLocation') {
        throw locationResponse.error
      }
      // The location lookup itself failed. Fall back to the base-region
      // client for this call -- see the locationUnresolvedMarker comment
      // above.
      return sendCommand('s3', region, commandName, input)
    }

    if (commandName === 'GetBucketLocation') {
      return locationResponse
    }

    const bucketRegion = normalizeBucketRegion(
      locationResponse.LocationConstraint,
    )
    return sendCommand('s3', bucketRegion, commandName, input)
  }

  /**
   * invoke(awsService, commandName, input) => Promise<sdkResponse>
   * The contract run-calls.js's runner is built against.
   *
   * NOTE: `clientRegion` is intentionally omitted here (not hardcoded to the
   * factory's base `region`) so sendCommand()/getClient() can apply their
   * resolution order -- explicit clientRegion, then a SERVICE_MAP `region`
   * override (e.g. cloudfront's us-east-1 pin), then the base region. Passing
   * the base region explicitly here would always win over the SERVICE_MAP
   * override, which is not what we want for global services.
   */
  async function invoke(awsService, commandName, input) {
    if (awsService === 's3') {
      return invokeS3(commandName, input)
    }
    return sendCommand(awsService, undefined, commandName, input)
  }

  return { invoke, getClient }
}

export { createInvoker, SERVICE_MAP }
