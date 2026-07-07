// The resource registry: the single source of truth mapping a
// framework-generated CloudFormation resource type to everything needed to
// describe it.
//
// Each entry has the shape:
//   {
//     cfnType:      'AWS::Lambda::Function',
//     awsService:   'lambda',       // --aws-services token (see ALIASES below)
//     category:     'functions',    // category-flag bucket
//     engineClient: 'lambda',       // descriptive string label for the engine
//                                   // client this type is described with (null
//                                   // for index-only entries). NOT read at
//                                   // runtime -- client selection lives in
//                                   // build-clients.js's SERVICE_MAP, keyed by
//                                   // awsService. Kept as documentation and to
//                                   // keep this module free of engine imports.
//     identifier:   (stackResource) => ...,  // per-entry; see each service file
//     calls: [ { key, method, params?, optional?, paginate?, input?, fanOut? } ],
//   }
//
// The dispatchable services (lambda, iam, apigateway, apigatewayv2, elbv2,
// eventbridge, s3, dynamodb, sqs, sns, scheduler, kinesis, logs, cloudwatch,
// cognito-idp, iot, cloudfront, lambda-microvms) each map to an engine client
// via build-clients.js's SERVICE_MAP. cloudfront is a full describe type, not
// index-only -- see cloudfront.js for the us-east-1 pin this GLOBAL service
// needs. lambda-microvms describes MicrovmImage only; its other resource,
// AWS::Lambda::NetworkConnector, has no describe op in the SDK and stays
// index-only (awsService:null/calls:[]) -- see lambda-microvms.js.

import { lambdaRegistryEntries } from './lambda.js'
import { iamRegistryEntries } from './iam.js'
import { apigatewayRegistryEntries } from './apigateway.js'
import { apigatewayv2RegistryEntries } from './apigatewayv2.js'
import { elbv2RegistryEntries } from './elbv2.js'
import { eventbridgeRegistryEntries } from './eventbridge.js'
import { s3RegistryEntries } from './s3.js'
import { dynamodbRegistryEntries } from './dynamodb.js'
import { sqsRegistryEntries } from './sqs.js'
import { snsRegistryEntries } from './sns.js'
import { schedulerRegistryEntries } from './scheduler.js'
import { kinesisRegistryEntries } from './kinesis.js'
import { logsRegistryEntries } from './logs.js'
import { cloudwatchRegistryEntries } from './cloudwatch.js'
import { cognitoRegistryEntries } from './cognito.js'
import { iotRegistryEntries } from './iot.js'
import { cloudfrontRegistryEntries } from './cloudfront.js'
import { lambdaMicrovmsRegistryEntries } from './lambda-microvms.js'

const REGISTRY_ENTRIES = [
  ...lambdaRegistryEntries,
  ...iamRegistryEntries,
  ...apigatewayRegistryEntries,
  ...apigatewayv2RegistryEntries,
  ...elbv2RegistryEntries,
  ...eventbridgeRegistryEntries,
  ...s3RegistryEntries,
  ...dynamodbRegistryEntries,
  ...sqsRegistryEntries,
  ...snsRegistryEntries,
  ...schedulerRegistryEntries,
  ...kinesisRegistryEntries,
  ...logsRegistryEntries,
  ...cloudwatchRegistryEntries,
  ...cognitoRegistryEntries,
  ...iotRegistryEntries,
  ...cloudfrontRegistryEntries,
  ...lambdaMicrovmsRegistryEntries,
]

// Registry keyed by cfnType -- the primary lookup used to map a
// CloudFormation StackResourceSummary to its describe entry.
const registryByCfnType = new Map(
  REGISTRY_ENTRIES.map((entry) => [entry.cfnType, entry]),
)

// `--aws-services` token aliases. Kept as a flat map so adding a new alias
// is a one-line change.
const AWS_SERVICE_ALIASES = {
  events: 'eventbridge',
  alb: 'elbv2',
  cognito: 'cognito-idp',
  microvms: 'lambda-microvms',
  sandboxes: 'lambda-microvms',
}

/**
 * Resolves an --aws-services token through the alias map. Tokens that
 * aren't aliases pass through unchanged (they may already be canonical, or
 * may be unknown -- callers decide how to handle unknown tokens).
 */
function resolveAwsServiceAlias(token) {
  return AWS_SERVICE_ALIASES[token] || token
}

/**
 * Looks up every registry entry for a given --aws-services token,
 * resolving aliases first. Returns an empty array for unknown tokens (no
 * throw) so callers can decide how to surface "unknown service" to the
 * user.
 */
function findByAwsService(token) {
  const canonical = resolveAwsServiceAlias(token)
  return REGISTRY_ENTRIES.filter((entry) => entry.awsService === canonical)
}

/**
 * Looks up every registry entry for a given category flag (e.g.
 * 'functions', 'api', 'events', 'iam', 'storage'). Returns an empty array
 * for unknown/unsupported categories.
 */
function findByCategory(category) {
  return REGISTRY_ENTRIES.filter((entry) => entry.category === category)
}

/**
 * Looks up the single registry entry for a CloudFormation resource type.
 * Returns undefined when the type isn't in the registry (e.g. `other`
 * bucket types, or types not yet wired up).
 */
function findByCfnType(cfnType) {
  return registryByCfnType.get(cfnType)
}

export {
  REGISTRY_ENTRIES,
  AWS_SERVICE_ALIASES,
  resolveAwsServiceAlias,
  findByAwsService,
  findByCategory,
  findByCfnType,
}
