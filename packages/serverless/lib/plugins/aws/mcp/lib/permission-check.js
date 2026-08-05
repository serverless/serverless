import { log } from '@serverless/util'
import {
  stateIamStatement,
  stateKeyRefs,
  stateSecretLogicalId,
} from './state-resources.js'

// The execution role has to be a literal ARN to be simulated: `iam:Simulate*`
// takes a principal ARN, and an intrinsic is only a role ARN after
// CloudFormation has resolved it.
const ROLE_ARN_PATTERN = /^arn:[^:]+:iam::[^:]*:role\/.+/

/**
 * The literal ARN of the execution role the user brought, or `undefined` when
 * there is nothing to check.
 *
 * Mirrors `applyStateKeyReferences` (`../index.js`) in both order and detection:
 * per-function role mode is answered first, because it attaches the read grant
 * to each server's own generated role and the provider-level role is then not
 * what reads the key; a bring-your-own role is then recognized with the same
 * check `mergeIamTemplates` skips statement merging on, so the check cannot
 * warn about a role the Framework did grant. `iam.role` wins over the legacy
 * `provider.role`, matching `getCustomExecutionRole` (`../../provider.js`).
 *
 * Anything that is not a literal ARN - an intrinsic, an object role
 * definition - yields `undefined`: nothing can be said about it, and saying
 * something anyway is how a check like this turns into noise.
 */
export const byoRoleArnFor = ({ provider, isExistingRoleProvided }) => {
  if (provider.iam?.role?.mode === 'perFunction') return undefined
  if (!('role' in provider) && !isExistingRoleProvided(provider.iam?.role)) {
    return undefined
  }
  const role =
    typeof provider.iam?.role === 'string' ? provider.iam.role : provider.role
  if (typeof role !== 'string' || !ROLE_ARN_PATTERN.test(role)) return undefined
  return role
}

/**
 * The deployed ARN of every in-stack state key, by output key.
 *
 * `compileStateResources` exports each secret as `<LogicalId>Arn`, and a
 * Secrets Manager secret's `Ref` is its ARN - so the stack outputs answer this
 * for the whole service in one call. Read lazily, so a service that brings
 * every key itself pays nothing.
 */
const stackOutputsOf = async ({ request, stackName }) => {
  const result = await request('CloudFormation', 'describeStacks', {
    StackName: stackName,
  })
  return new Map(
    (result?.Stacks?.[0]?.Outputs ?? []).map(({ OutputKey, OutputValue }) => [
      OutputKey,
      OutputValue,
    ]),
  )
}

/**
 * Warn when the execution role the user brought cannot read a server's state
 * key.
 *
 * Only a definite deny is worth a line: `simulatePrincipalPolicy` answers for
 * the policies it can see, and every way of not getting an answer - the
 * deploying credentials not being allowed to simulate, throttling, an output
 * that is not there - is silence plus a debug line. A permission check that
 * cries wolf is worse than none, because the runtime error that follows a
 * genuinely missing grant already names the action and the resource.
 *
 * `request` is injected rather than taken from a provider instance so this
 * stays a pure function of what it is handed.
 */
export const warnMissingStateGrants = async ({
  servers,
  roleArn,
  stackName,
  naming,
  request,
}) => {
  const refs = Object.entries(stateKeyRefs({ servers, naming }))
  if (refs.length === 0) return
  let outputs
  for (const [name, { keyRef }] of refs) {
    // A `{Ref}` is always an in-stack secret; a BYO ARN is already the answer.
    let keyArn = typeof keyRef === 'string' ? keyRef : undefined
    if (keyArn === undefined) {
      if (outputs === undefined) {
        try {
          outputs = await stackOutputsOf({ request, stackName })
        } catch (error) {
          log.debug(
            `mcp: could not read the stack outputs of "${stackName}", skipping the state key permission check: ${error.message}`,
          )
          return
        }
      }
      const outputKey = `${stateSecretLogicalId(naming, name)}Arn`
      keyArn = outputs.get(outputKey)
      if (keyArn === undefined) {
        log.debug(
          `mcp: the stack "${stackName}" has no "${outputKey}" output, skipping the state key permission check for the server "${name}"`,
        )
        continue
      }
    }
    // The very action the grant would carry, so a warning cannot name one thing
    // and the deployed role need another.
    const action = stateIamStatement(keyRef).Action[0]
    let evaluations
    try {
      const result = await request('IAM', 'simulatePrincipalPolicy', {
        PolicySourceArn: roleArn,
        ActionNames: [action],
        ResourceArns: [keyArn],
      })
      evaluations = result?.EvaluationResults ?? []
    } catch (error) {
      log.debug(
        `mcp: could not simulate "${action}" for "${roleArn}", skipping the state key permission check for the server "${name}": ${error.message}`,
      )
      continue
    }
    if (evaluations.length === 0) {
      log.debug(
        `mcp: the simulation of "${action}" for "${roleArn}" returned no verdict, skipping the state key permission check for the server "${name}"`,
      )
      continue
    }
    if (evaluations.every(({ EvalDecision }) => EvalDecision === 'allowed')) {
      continue
    }
    const statement = JSON.stringify({
      Effect: 'Allow',
      Action: action,
      Resource: keyArn,
    })
    log.warning(
      `The MCP server "${name}" reads its state key at cold start, but the execution role you provided ("${roleArn}") is not allowed to call "${action}" on "${keyArn}" - requests to this server will fail. Add this statement to that role's policy: ${statement}`,
    )
  }
}
