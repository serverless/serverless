/**
 * Whether an AWS request failed because the resource it names does not exist:
 * a `ResourceNotFoundException`, as the provider's request wrapper reports it
 * (`providerError.code`) or as an SDK client throws it (`name`).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export const isResourceNotFound = (error) =>
  error?.providerError?.code === 'ResourceNotFoundException' ||
  error?.name === 'ResourceNotFoundException'

/**
 * Whether a CloudFormation lookup failed because the stack does not exist:
 * CloudFormation answers "Stack with id <name> does not exist".
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export const isStackNotFound = (error) =>
  /^Stack with id \S+ does not exist$/.test(error?.message ?? '')

/**
 * Whether a `describeStackResource` lookup failed because the stack, or the
 * resource in it, does not exist: CloudFormation answers "Stack '<name>' does
 * not exist" or "Resource <id> does not exist for stack <name>".
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export const isStackResourceNotFound = (error) =>
  /^(Stack '[^']+' does not exist|Resource \S+ does not exist for stack \S+)$/.test(
    error?.message ?? '',
  )
