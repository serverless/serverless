/**
 * Logical ID for a server's in-stack state key.
 *
 * Derived from the server name alone: the `{Ref}` is needed while contributing
 * IAM statements and function environments, which must happen before the
 * compiled template exists, so it cannot depend on anything resolved later.
 *
 * Exported because the deploy-time permission check (`permission-check.js`)
 * reads the deployed ARN back out of the matching `<LogicalId>Arn` output.
 */
export const stateSecretLogicalId = (naming, serverName) =>
  `${naming.getNormalizedFunctionName(serverName)}McpStateSecret`

// `false` and `undefined` both mean "no state"; the normalizer emits
// undefined-valued keys for servers that never mentioned `state`.
const isStateEnabled = (state) => state != null && state !== false

/**
 * Resolve each state-enabled server's key reference without touching the
 * template: `{Ref}` to the in-stack secret, or the BYO ARN verbatim.
 */
export const stateKeyRefs = ({ servers, naming }) => {
  const refs = {}
  for (const s of servers) {
    if (!isStateEnabled(s.state)) continue
    refs[s.name] = {
      keyRef:
        s.state === true
          ? { Ref: stateSecretLogicalId(naming, s.name) }
          : s.state,
    }
  }
  return refs
}

/**
 * Emit a Secrets Manager secret plus stack output per `state: true` server and
 * return every state-enabled server's key reference.
 */
export const compileStateResources = ({ servers, template, naming }) => {
  for (const s of servers) {
    if (s.state !== true) continue
    const logicalId = stateSecretLogicalId(naming, s.name)
    template.Resources[logicalId] = {
      Type: 'AWS::SecretsManager::Secret',
      Properties: {
        Description: `Serverless MCP requestState key for server "${s.name}"`,
        GenerateSecretString: {
          PasswordLength: 44,
          ExcludePunctuation: true,
        },
      },
    }
    template.Outputs[`${logicalId}Arn`] = { Value: { Ref: logicalId } }
  }
  return stateKeyRefs({ servers, naming })
}

/**
 * The IAM statement granting read access to one server's state key. A `{Ref}` is
 * always an in-stack Secrets Manager secret; a BYO ARN picks its action from
 * the ARN's service.
 */
export const stateIamStatement = (keyRef) => {
  const isSsm = typeof keyRef === 'string' && /^arn:[^:]+:ssm:/.test(keyRef)
  return isSsm
    ? { Effect: 'Allow', Action: ['ssm:GetParameter'], Resource: [keyRef] }
    : {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [keyRef],
      }
}

/**
 * IAM statements granting read access to every server's state key, for a role
 * shared by all functions.
 */
export const stateIamStatements = (refs) =>
  Object.values(refs).map(({ keyRef }) => stateIamStatement(keyRef))
