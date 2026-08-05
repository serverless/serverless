// Runs inside the user's Lambda: no framework imports, plain Errors.
// Reads the elicitation round-trip key at cold start so the entry can place it
// in the environment before the user's module is imported — the key never sits
// in plaintext function configuration.
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

// Must stay identical to the dispatch in ../../lib/state-resources.js: the
// service in the ARN decides both which API is called here and which action the
// build-time IAM statement grants, and the two diverging would grant one
// permission and use the other.
const ssmArn = /^arn:[^:]+:ssm:/

// A bring-your-own state key may live in another region than the function, and
// the reference is a literal ARN by design (`../../lib/validate.js` rejects an
// intrinsic precisely so its service is readable) - so the ARN's own region
// segment is authoritative, and the function's region is only the fallback for a
// reference that carries none.
const regionOf = (keyRef, fallback) => keyRef.split(':')[3] || fallback

// A denial from IAM is `AccessDeniedException` on both services; a resource
// policy or permissions boundary can also surface as a bare 403.
const isAccessDenied = (error) =>
  String(error?.name ?? '').startsWith('AccessDenied') ||
  error?.$metadata?.httpStatusCode === 403

/**
 * The runtime half of the two-layer BYO-role design. With the role the
 * Framework generates, the grant is attached automatically; with a role the
 * user brings, the Framework cannot attach anything, so the failure has to
 * carry the whole fix — the action, the resource, and whose policy needs it.
 *
 * The API action is not always the missing grant: a secret or SecureString
 * encrypted with a customer-managed key is denied with AccessDeniedException
 * too when the role may call the API but not decrypt with the key. Only the
 * AWS message distinguishes the two, so it is quoted rather than left in
 * `cause`, and a mention of KMS steers the fix at kms:Decrypt.
 */
const accessDeniedError = (keyRef, action, cause) => {
  const detail =
    typeof cause?.message === 'string' && cause.message !== ''
      ? cause.message
      : 'no message'
  const opening = `The MCP server could not read its state key "${keyRef}": AWS denied the call to "${action}" with "${detail}".`
  if (/kms/i.test(detail)) {
    return new Error(
      `${opening} That message points at KMS rather than at the API grant, so the likely gap is decryption: reading a secret or SecureString encrypted with a customer-managed key also needs "kms:Decrypt" on that key, and the key's own policy must allow this function's execution role to use it. ` +
        `Add { Effect: "Allow", Action: "kms:Decrypt", Resource: "<the KMS key ARN>" } under provider.iam.role.statements — or to the role you bring yourself (provider.iam.role, or a role set on the function), which the Framework cannot modify.`,
      { cause },
    )
  }
  return new Error(
    `${opening} This function's execution role is not allowed to call "${action}" on "${keyRef}". ` +
      `Serverless Framework adds that grant to the execution role it generates, but it cannot modify a role you bring yourself (provider.iam.role, or a role set on the function). ` +
      `Attach the statement { Effect: "Allow", Action: "${action}", Resource: "${keyRef}" } to that role's policy — or drop the custom role and let the Framework generate one, adding any extra grants under provider.iam.role.statements.`,
    { cause },
  )
}

/**
 * Resolve a state key reference — an in-stack Secrets Manager secret ARN or a
 * user-supplied Secrets Manager / SSM parameter ARN — to the key itself.
 */
export const resolveStateKey = async ({ keyRef, region }) => {
  if (typeof keyRef !== 'string' || keyRef === '') {
    throw new Error(
      `The MCP server is configured with a state key but SERVERLESS_MCP_STATE_KEY_REF is empty, so there is no secret to read (got ${JSON.stringify(
        keyRef,
      )}).`,
    )
  }
  const isSsm = ssmArn.test(keyRef)
  const action = isSsm ? 'ssm:GetParameter' : 'secretsmanager:GetSecretValue'
  const keyRegion = regionOf(keyRef, region)
  let value
  try {
    if (isSsm) {
      const response = await new SSMClient({ region: keyRegion }).send(
        // SecureString parameters are the point of a state key, and
        // GetParameter returns them encrypted unless asked otherwise.
        new GetParameterCommand({ Name: keyRef, WithDecryption: true }),
      )
      value = response?.Parameter?.Value
    } else {
      const response = await new SecretsManagerClient({
        region: keyRegion,
      }).send(new GetSecretValueCommand({ SecretId: keyRef }))
      value = response?.SecretString
    }
  } catch (error) {
    if (isAccessDenied(error)) throw accessDeniedError(keyRef, action, error)
    throw error
  }
  if (typeof value !== 'string' || value === '') {
    throw new Error(
      `The MCP server's state key reference "${keyRef}" holds no string value. A state key must be a plain-text secret or a String/SecureString parameter, not binary.`,
    )
  }
  return value
}
