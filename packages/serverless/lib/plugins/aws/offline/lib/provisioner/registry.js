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
