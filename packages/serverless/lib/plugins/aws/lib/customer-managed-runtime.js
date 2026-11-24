/**
 * Lambda customer-managed runtimes.
 *
 * A function uses one by setting `runtime` to the runtime alias ARN
 * (arn:<partition>:lambda:<region>:<account>:runtime/<name>/alias/<alias>),
 * or to a CloudFormation intrinsic that returns one, such as `Ref` on an
 * AWS::Lambda::RuntimeAlias. Lambda takes it as `Runtime: custom` plus
 * `RuntimeConfig: { RuntimeArn, RuntimeAlias }`.
 */

export const CUSTOMER_MANAGED_RUNTIME = 'custom'

// Character rules from the AWS::Lambda::RuntimeAlias CloudFormation schema:
// runtime names are lowercase, alias names allow upper case.
const RUNTIME_ALIAS_ARN_PATTERN =
  /^arn:(aws[a-z-]*):lambda:([a-z0-9-]+):(\d{12}):runtime\/([a-z0-9](?:[a-z0-9_.-]{0,126}[a-z0-9])?)\/alias\/([A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,126}[A-Za-z0-9_])?)$/

export const RUNTIME_ALIAS_ARN_SCHEMA_PATTERN = RUNTIME_ALIAS_ARN_PATTERN.source

const isIntrinsic = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && (keys[0] === 'Ref' || keys[0].startsWith('Fn::'))
}

/**
 * @param {string} value
 * @returns {{runtimeArn: string, alias: string, partition: string, region: string, accountId: string, runtimeName: string} | null}
 */
export const parseRuntimeAliasArn = (value) => {
  if (typeof value !== 'string') return null
  const match = RUNTIME_ALIAS_ARN_PATTERN.exec(value)
  if (!match) return null
  const [, partition, region, accountId, runtimeName, alias] = match
  return {
    runtimeArn: `arn:${partition}:lambda:${region}:${accountId}:runtime/${runtimeName}`,
    alias,
    partition,
    region,
    accountId,
    runtimeName,
  }
}

/**
 * True for a runtime alias ARN or a single-key CloudFormation intrinsic.
 * Lambda-managed identifiers (nodejs24.x, provided.al2023, ...) are false.
 */
export const isCustomerManagedRuntime = (value) =>
  parseRuntimeAliasArn(value) !== null || isIntrinsic(value)

/**
 * The function's RuntimeConfig for a customer-managed runtime value: literal
 * properties for an alias ARN, Fn::Split/Fn::Select of the value otherwise
 * (an alias ARN splits on "/" into [arn:...:runtime, <name>, alias, <alias>]).
 */
export const toRuntimeConfig = (value) => {
  const parsed = parseRuntimeAliasArn(value)
  if (parsed) {
    return { RuntimeArn: parsed.runtimeArn, RuntimeAlias: parsed.alias }
  }
  const split = { 'Fn::Split': ['/', value] }
  return {
    RuntimeArn: {
      'Fn::Join': [
        '/',
        [{ 'Fn::Select': [0, split] }, { 'Fn::Select': [1, split] }],
      ],
    },
    RuntimeAlias: { 'Fn::Select': [3, split] },
  }
}

/**
 * The line to add when CloudFormation fails a function on a customer-managed
 * runtime because of its runtime alias. Lambda reports a missing or unusable
 * alias as "Runtime Alias not found" when it creates the function, and as
 * "could not be found", naming the function, when it updates it. Other causes
 * of the second message are possible, so the line says what to check.
 */
export const getCustomerManagedRuntimeFailureContext = (serverless, event) => {
  if (
    event?.ResourceType !== 'AWS::Lambda::Function' ||
    !/could not be found|runtime alias not found/i.test(
      event.ResourceStatusReason ?? '',
    )
  ) {
    return undefined
  }
  const service = serverless?.service
  if (typeof service?.getCustomerManagedRuntime !== 'function') return undefined
  const naming = serverless.getProvider?.('aws')?.naming
  const functionName = service
    .getAllFunctions()
    .find(
      (name) => naming?.getLambdaLogicalId(name) === event.LogicalResourceId,
    )
  if (!functionName) return undefined
  if (service.getCustomerManagedRuntime(functionName) === undefined) {
    return undefined
  }
  // The value is left out: error messages reach analytics, which never
  // receive a runtime ARN (it names the publisher's account)
  return `Function "${functionName}" uses a customer-managed runtime. Check that its runtime alias exists in this Region and that the deploying role has lambda:AssociateRuntimeAlias on it.`
}
