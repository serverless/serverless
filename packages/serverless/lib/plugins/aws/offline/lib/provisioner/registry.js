/**
 * In-memory resource registry keyed per service type.
 *
 * Tracks local AWS resources provisioned for a single service during
 * `sls offline`. Each service type has its own Map so consumers can
 * iterate or look up records without cross-service interference.
 */

/**
 * Creates and returns a fresh, empty registry.
 *
 * The registry holds one Map per supported AWS service type. Each Map is
 * keyed by the CloudFormation logical resource ID (LogicalId) and stores
 * a plain record object describing the locally provisioned resource.
 *
 * @returns {{
 *   sqs:    Map<string, object>,
 *   sns:    Map<string, object>,
 *   s3:     Map<string, object>,
 *   events: Map<string, object>,
 *   lambda: Map<string, object>,
 * }}
 */
export function createRegistry() {
  return {
    sqs: new Map(),
    sns: new Map(),
    s3: new Map(),
    events: new Map(),
    lambda: new Map(),
  }
}

/**
 * Registers (or overwrites) an SQS queue record in the registry.
 *
 * If a record with the same `logicalId` already exists it is replaced,
 * so the registry always reflects the most recent provisioning state.
 *
 * @param {ReturnType<typeof createRegistry>} registry - The registry to mutate.
 * @param {{
 *   logicalId:  string,
 *   name:       string,
 *   arn:        string,
 *   url:        string,
 *   properties: object,
 * }} record - The SQS queue record to store.
 * @returns {void}
 */
export function registerSqsQueue(registry, record) {
  registry.sqs.set(record.logicalId, record)
}

/**
 * Retrieves an SQS queue record by its CloudFormation logical ID.
 *
 * @param {ReturnType<typeof createRegistry>} registry - The registry to query.
 * @param {string} logicalId - The CloudFormation logical resource ID.
 * @returns {object | undefined} The matching record, or `undefined` if not found.
 */
export function getSqsQueue(registry, logicalId) {
  return registry.sqs.get(logicalId)
}

/**
 * Returns an iterable of all SQS queue records in the registry.
 *
 * @param {ReturnType<typeof createRegistry>} registry - The registry to query.
 * @returns {Iterable<object>} An iterable over all registered SQS queue records.
 */
export function allSqsQueues(registry) {
  return registry.sqs.values()
}

/**
 * Stores a record in the given service Map keyed by its `logicalId`. An existing
 * entry with the same id is overwritten so the registry always reflects the most
 * recent provisioning state.
 *
 * @param {Map<string, object>} map - The per-service Map to mutate.
 * @param {{ logicalId: string }} record - The record to store.
 * @returns {void}
 */
function registerRecord(map, record) {
  map.set(record.logicalId, record)
}

/**
 * Registers (or overwrites) an SNS topic record. Record shape:
 * `{ logicalId, name, arn }`.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {{ logicalId: string, name: string, arn: string }} record
 * @returns {void}
 */
export function registerSnsTopic(registry, record) {
  registerRecord(registry.sns, record)
}

/**
 * Retrieves an SNS topic record by logical ID.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {string} logicalId
 * @returns {object | undefined}
 */
export function getSnsTopic(registry, logicalId) {
  return registry.sns.get(logicalId)
}

/**
 * Returns an iterable of all SNS topic records.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @returns {Iterable<object>}
 */
export function allSnsTopics(registry) {
  return registry.sns.values()
}

/**
 * Registers (or overwrites) an S3 bucket record. Record shape:
 * `{ logicalId, name, arn, properties }`.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {{ logicalId: string, name: string, arn: string, properties: object }} record
 * @returns {void}
 */
export function registerS3Bucket(registry, record) {
  registerRecord(registry.s3, record)
}

/**
 * Retrieves an S3 bucket record by logical ID.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {string} logicalId
 * @returns {object | undefined}
 */
export function getS3Bucket(registry, logicalId) {
  return registry.s3.get(logicalId)
}

/**
 * Returns an iterable of all S3 bucket records.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @returns {Iterable<object>}
 */
export function allS3Buckets(registry) {
  return registry.s3.values()
}

/**
 * Registers (or overwrites) an EventBridge resource record (bus or rule).
 * Record shape: `{ logicalId, name, arn, kind: 'bus' | 'rule', properties }`.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {{ logicalId: string, name: string, arn: string, kind: string, properties: object }} record
 * @returns {void}
 */
export function registerEventResource(registry, record) {
  registerRecord(registry.events, record)
}

/**
 * Retrieves an EventBridge resource record by logical ID.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {string} logicalId
 * @returns {object | undefined}
 */
export function getEventResource(registry, logicalId) {
  return registry.events.get(logicalId)
}

/**
 * Returns an iterable of all EventBridge resource records.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @returns {Iterable<object>}
 */
export function allEventResources(registry) {
  return registry.events.values()
}

/**
 * Registers (or overwrites) a Lambda function identity record. Record shape:
 * `{ logicalId, functionKey, name, arn }`.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {{ logicalId: string, functionKey: string, name: string, arn: string }} record
 * @returns {void}
 */
export function registerLambda(registry, record) {
  registerRecord(registry.lambda, record)
}

/**
 * Retrieves a Lambda function identity record by logical ID.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @param {string} logicalId
 * @returns {object | undefined}
 */
export function getLambda(registry, logicalId) {
  return registry.lambda.get(logicalId)
}

/**
 * Returns an iterable of all Lambda function identity records.
 *
 * @param {ReturnType<typeof createRegistry>} registry
 * @returns {Iterable<object>}
 */
export function allLambdas(registry) {
  return registry.lambda.values()
}
