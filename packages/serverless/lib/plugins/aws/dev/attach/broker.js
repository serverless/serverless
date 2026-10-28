/**
 * The broker role the Dev Mode bridge assumes to reach AWS IoT Core; users' function roles are
 * never modified. One role per account and region, created once. Its trust policy is written
 * once and never edited per session: any IAM principal of this account whose credentials Lambda
 * issued to a function in this region, and who knows the per-broker ExternalId (attached
 * functions carry it). Its own permissions are what a bridge does (see `buildPermissionPolicy`).
 * Web functions (web apps) have their own ARNs: the trust lists them too, as a role created now
 * does; a role an earlier release created lists functions only, and is widened once, by the first
 * session with web apps (see `widenBrokerTrust`) or by "serverless dev setup".
 *
 * The principal is "*", so the conditions are the only guard: an existing role is used only when
 * its trust policy still means exactly what Dev Mode wrote (see `trustPolicyDifferences`).
 */
import { randomBytes as nodeRandomBytes } from 'crypto'
import { ServerlessError } from '@serverless/util'
import { cliCommand } from '../commands/cli-names.js'
import {
  BROKER_POLICY_NAME,
  BROKER_POLICY_VERSION,
  BROKER_TRUST_SID,
  brokerRoleArn,
  brokerRolePattern,
} from './naming.js'
import {
  credentialsInvalidError,
  isAccessDenied,
  isCredentialError,
  originalOf,
} from './aws.js'

const ACCOUNT_ID = /^\d{12}$/

/**
 * The account and partition the broker's policies name. The account id goes into a trust policy
 * whose principal is "*", so anything but a 12-digit id is refused.
 */
export const identityFrom = ({ accountId, callerArn }) => {
  if (!ACCOUNT_ID.test(String(accountId ?? ''))) {
    throw new ServerlessError(
      'Dev Mode could not determine the AWS account of your credentials. Check them with "aws sts get-caller-identity", then run the command again.',
      'DEV_MODE_AWS_IDENTITY_UNKNOWN',
      { stack: false },
    )
  }
  return {
    accountId: String(accountId),
    partition: String(callerArn ?? '').split(':')[1] || 'aws',
  }
}

/** The `lambda:SourceFunctionArn` the trust lists: functions, and web functions with `web`. */
const sourceArns = ({ identity, region, web }) => {
  const lambda = `arn:${identity.partition}:lambda:${region}:${identity.accountId}`
  return web
    ? [`${lambda}:function:*`, `${lambda}:web-function/*`]
    : `${lambda}:function:*`
}

/** The trust policy; `web: false` is the one earlier releases wrote, for functions only. */
export const buildTrustPolicy = ({
  identity,
  region,
  externalId,
  web = true,
}) => ({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: BROKER_TRUST_SID,
      Effect: 'Allow',
      Principal: { AWS: '*' },
      Action: ['sts:AssumeRole', 'sts:TagSession'],
      Condition: {
        StringEquals: {
          'aws:PrincipalAccount': identity.accountId,
          'sts:ExternalId': externalId,
        },
        ArnLike: {
          'lambda:SourceFunctionArn': sourceArns({ identity, region, web }),
        },
      },
    },
  ],
})

/**
 * What a bridge does, and nothing more, for whoever assumes the role: each bridge narrows it
 * further to its own session with a session policy, but that one is chosen by the caller. A bridge
 * connects with its own client id (`sls-dev-<session>-<environment>`), publishes on the session's
 * `up` topic, subscribes to and receives its `down/<environment>` topic and the session's `gone`,
 * and asks Direct Messaging whether the session's CLI (`sls-dev-<session>-cli`) is connected, on
 * the session's `ping` topic. So the role can never take a CLI's client id, receive `up` (other
 * functions' events and credentials), or publish on `down`, `gone` or `ping`. AWS IoT Core checks
 * iot:Receive per delivered message, whatever filter matched it. From version 2, a web app's
 * bridge sends the requests the machine does not take to the web function's Dev Mode endpoint
 * `sls-dev-fallback`.
 *
 * Every statement id carries the policy's version (see BROKER_POLICY_NAME); `version` stands in
 * another version in tests, and version 1 is the policy as version 1 wrote it.
 */
export const buildPermissionPolicy = ({
  identity,
  region,
  version = BROKER_POLICY_VERSION,
}) => {
  const iot = `arn:${identity.partition}:iot:${region}:${identity.accountId}`
  const lambda = `arn:${identity.partition}:lambda:${region}:${identity.accountId}`
  const sid = (name) => `${SID_PREFIX}${version}${name}`
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: sid('Connect'),
        Effect: 'Allow',
        Action: 'iot:Connect',
        Resource: `${iot}:client/sls-dev-*`,
      },
      {
        Sid: sid('NoCliClientId'),
        Effect: 'Deny',
        Action: 'iot:Connect',
        Resource: `${iot}:client/sls-dev-*-cli`,
      },
      {
        Sid: sid('PublishUp'),
        Effect: 'Allow',
        Action: 'iot:Publish',
        Resource: `${iot}:topic/sls-dev/*/up`,
      },
      {
        Sid: sid('SubscribeDownGone'),
        Effect: 'Allow',
        Action: 'iot:Subscribe',
        Resource: [
          `${iot}:topicfilter/sls-dev/*/down/*`,
          `${iot}:topicfilter/sls-dev/*/gone`,
        ],
      },
      {
        Sid: sid('ReceiveDownGone'),
        Effect: 'Allow',
        Action: 'iot:Receive',
        Resource: [
          `${iot}:topic/sls-dev/*/down/*`,
          `${iot}:topic/sls-dev/*/gone`,
        ],
      },
      {
        Sid: sid('PingCli'),
        Effect: 'Allow',
        Action: 'iot:SendDirectMessage',
        Resource: `${iot}:client/sls-dev-*-cli`,
        Condition: { StringLike: { 'iot:Topic': 'sls-dev/*/ping' } },
      },
      ...(version >= 2
        ? [
            {
              Sid: sid('InvokeFallback'),
              Effect: 'Allow',
              Action: 'lambda:InvokeWebFunctionEndpoint',
              Resource: `${lambda}:web-function/*/endpoint/sls-dev-fallback`,
            },
          ]
        : []),
    ],
  }
}

/** The broker role's IAM description, as Dev Mode creates it. */
export const BROKER_ROLE_DESCRIPTION =
  'Serverless Framework Dev Mode: lets Lambda functions attached to a Dev Mode session reach AWS IoT Core.'
const SID_PREFIX = 'DevModeBrokerV'
// The version is the digits right after the prefix, up to the statement's name, which starts with
// a capital letter; whatever the name holds after that (digits too) is not the version.
const SID = /^DevModeBrokerV(\d+)(?=[A-Z])/

/**
 * The highest version the statement ids of a broker permission policy carry, or null when none
 * carries one. The highest counts, so a policy a later version wrote, in whatever shape, is never
 * taken for an older one.
 */
export const policyVersionOf = (doc) => {
  const versions = [].concat(doc?.Statement ?? []).flatMap((statement) => {
    const match = SID.exec(String(statement?.Sid ?? ''))
    return match ? [Number(match[1])] : []
  })
  return versions.length ? Math.max(...versions) : null
}

const parseDocument = (raw) => {
  try {
    return JSON.parse(raw)
  } catch {
    // IAM returns policy documents URL-encoded.
    return JSON.parse(decodeURIComponent(raw))
  }
}

// IAM may return a single value as a string or as a one-element array, in any key order.
const list = (value) => [].concat(value ?? [])
const sortedValues = (value) => list(value).map(String).sort()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const statementsOf = (role) =>
  list(parseDocument(role.AssumeRolePolicyDocument ?? '{}').Statement)
const externalIdsOf = (statement) =>
  sortedValues(statement?.Condition?.StringEquals?.['sts:ExternalId'])

const sourceArnsOf = (statement) =>
  sortedValues(statement?.Condition?.ArnLike?.['lambda:SourceFunctionArn'])

/** Whether the broker's trust lets web functions assume it, besides functions. */
export const trustIsWidened = (role) =>
  sourceArnsOf(statementsOf(role).find((s) => s.Sid === BROKER_TRUST_SID)).some(
    (arn) => arn.includes(':web-function/'),
  )

export const readExternalId = (role) => {
  const ours = statementsOf(role).find((s) => s.Sid === BROKER_TRUST_SID)
  const ids = externalIdsOf(ours)
  return ids.length === 1 ? ids[0] : null
}

/** `"*"`, `{ AWS: "*" }` and `{ AWS: ["*"] }` grant the same principals in a trust policy. */
const principalOf = (principal) => {
  if (principal === '*') return { AWS: ['*'] }
  if (!principal || typeof principal !== 'object') return { '?': [principal] }
  return Object.fromEntries(
    Object.keys(principal)
      .sort()
      .map((type) => [type, sortedValues(principal[type])]),
  )
}

const conditionsOf = (condition) => {
  const flat = {}
  for (const [operator, keys] of Object.entries(condition ?? {})) {
    for (const [key, value] of Object.entries(keys ?? {})) {
      flat[`${operator} ${key}`] = sortedValues(value)
    }
  }
  return flat
}

const ASSUME_ACTIONS = [
  'sts:AssumeRole',
  'sts:AssumeRoleWithSAML',
  'sts:AssumeRoleWithWebIdentity',
  'sts:TagSession',
  'sts:SetSourceIdentity',
]
const actionMatches = (pattern, action) =>
  new RegExp(
    `^${String(pattern)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
    'i',
  ).test(action)
const allowsAssuming = (statement) =>
  statement.Effect === 'Allow' &&
  (statement.NotAction !== undefined ||
    list(statement.Action).some((pattern) =>
      ASSUME_ACTIONS.some((action) => actionMatches(pattern, action)),
    ))

/**
 * How the broker's trust policy differs from the one Dev Mode writes, in plain words; empty when
 * it is the same policy. Both forms Dev Mode writes are the same policy here: functions only, as
 * earlier releases wrote it, and with web functions too. Statements that only deny are tolerated:
 * they can only narrow access.
 */
export const trustPolicyDifferences = ({ role, identity, region }) => {
  const statements = statementsOf(role)
  const ours = statements.find((s) => s.Sid === BROKER_TRUST_SID)
  const ids = externalIdsOf(ours)
  // Compared with the form whose source patterns it lists; anything else with the widened one.
  const narrow = sortedValues(sourceArns({ identity, region, web: false }))
  const expected = buildTrustPolicy({
    identity,
    region,
    externalId: ids[0] ?? null,
    web: !same(sourceArnsOf(ours), narrow),
  }).Statement[0]
  const differences = []
  if (ours.Effect !== 'Allow') {
    differences.push(`its effect is ${ours.Effect} instead of Allow`)
  }
  if (!same(principalOf(ours.Principal), principalOf(expected.Principal))) {
    differences.push(
      `its principal is ${JSON.stringify(ours.Principal ?? null)} instead of {"AWS":"*"}`,
    )
  }
  if (!same(sortedValues(ours.Action), sortedValues(expected.Action))) {
    differences.push(
      `its allowed actions are ${sortedValues(ours.Action).join(', ') || 'none'} instead of sts:AssumeRole, sts:TagSession`,
    )
  }
  for (const element of ['NotPrincipal', 'NotAction', 'Resource']) {
    if (ours[element] !== undefined) {
      differences.push(`it has an unexpected ${element} element`)
    }
  }
  const want = conditionsOf(expected.Condition)
  const have = conditionsOf(ours.Condition)
  for (const [entry, values] of Object.entries(want)) {
    const [operator, key] = entry.split(' ')
    if (key === 'sts:ExternalId' && ids.length !== 1) {
      differences.push(
        ids.length
          ? 'its sts:ExternalId condition lists several values'
          : 'its sts:ExternalId condition is missing',
      )
    } else if (!(entry in have)) {
      differences.push(`its ${key} condition (${operator}) is missing`)
    } else if (!same(have[entry], values)) {
      differences.push(
        `its ${key} condition is ${have[entry].join(', ')} instead of ${values.join(', ')}`,
      )
    }
  }
  for (const entry of Object.keys(have)) {
    if (!(entry in want)) differences.push(`it has an extra condition ${entry}`)
  }
  for (const statement of statements) {
    if (statement !== ours && allowsAssuming(statement)) {
      const granted =
        statement.NotAction !== undefined
          ? `every action except ${list(statement.NotAction).join(', ')}`
          : list(statement.Action).join(', ')
      differences.push(
        `another statement${statement.Sid ? ` (${statement.Sid})` : ''} also allows ${granted}`,
      )
    }
  }
  return differences
}

/**
 * What an administrator runs to set Dev Mode up: `dev setup` runs outside any project, so it is
 * named as it runs there, with the region, never with a Compose service or a --config.
 */
export const brokerSetupHint = (region) =>
  `Ask an administrator to run "serverless dev setup --region ${region}" once (it accepts --permissions-boundary and --path when your organization requires them).`

/** The role as a message names it: its ARN, which carries its IAM path, when it is known. */
const roleLabel = ({ arn, name }) => arn ?? `"${name}"`

const createDeniedError = (arn, error, region) =>
  new ServerlessError(
    `Dev Mode could not create the IAM role ${arn} (${error.message}).\n` +
      'The first "serverless dev" in an AWS account and region creates this role once; that needs iam:GetRole, iam:CreateRole and iam:PutRolePolicy on it.\n' +
      brokerSetupHint(region),
    'DEV_MODE_BROKER_CREATE_DENIED',
    originalOf(error),
  )

// What IAM answers when a permissions boundary ARN does not name an attachable managed policy.
const BOUNDARY_ERRORS = new Set([
  'NoSuchEntityException',
  'NoSuchEntity',
  'InvalidInputException',
  'InvalidInput',
  'MalformedPolicyDocumentException',
  'MalformedPolicyDocument',
  'ValidationError',
  'ValidationException',
  'PolicyNotAttachableException',
  'PolicyNotAttachable',
])

const boundaryError = (boundary, error) =>
  new ServerlessError(
    `IAM did not accept the permissions boundary "${boundary}" (${error.message}). Pass the ARN of an existing managed policy to --permissions-boundary, for example arn:aws:iam::<account-id>:policy/<name>.`,
    'DEV_MODE_BROKER_BOUNDARY_INVALID',
    originalOf(error),
  )

/**
 * The existing broker role, or `null` when there is none yet. Read-only: a role with this name
 * that Dev Mode did not create (`DEV_MODE_BROKER_FOREIGN`), or whose trust policy was changed
 * (`DEV_MODE_BROKER_MODIFIED`), is refused, never repaired. `identity` and `region` are the
 * caller's: the trust policy must name exactly them. `retryCommand` is the command the person
 * runs again once a foreign role is out of the way.
 */
export const getBroker = async ({
  iam,
  name,
  identity,
  region,
  retryCommand = cliCommand('dev'),
}) => {
  let role
  try {
    role = await iam.getRole(name)
  } catch (error) {
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    if (isAccessDenied(error)) {
      throw new ServerlessError(
        `Dev Mode needs iam:GetRole on the IAM role "${name}" to read its settings (${error.message}). Ask your AWS administrator to allow it on ${brokerRolePattern(identity)}, which covers the role under any IAM path.`,
        'DEV_MODE_BROKER_READ_DENIED',
        originalOf(error),
      )
    }
    throw error
  }
  if (!role) return null
  if (!statementsOf(role).some((s) => s.Sid === BROKER_TRUST_SID)) {
    throw new ServerlessError(
      `The IAM role "${name}" exists but was not created by Serverless Framework Dev Mode. Rename or delete it, then run "${retryCommand}" again.`,
      'DEV_MODE_BROKER_FOREIGN',
      { stack: false },
    )
  }
  const differences = trustPolicyDifferences({ role, identity, region })
  if (differences.length) {
    throw new ServerlessError(
      `The IAM role "${name}" was created by Serverless Framework Dev Mode, but its trust policy has been changed since: ${differences.join('; ')}.\n` +
        'Dev Mode only uses this role with the trust policy it wrote, because those conditions are what limit who can assume it.\n' +
        `An AWS administrator can delete the role and run "serverless dev setup --region ${region}" to create it again.`,
      'DEV_MODE_BROKER_MODIFIED',
      { stack: false },
    )
  }
  return {
    name,
    arn: role.Arn,
    externalId: readExternalId(role),
    path: role.Path,
    created: false,
    widened: trustIsWidened(role),
    createdAt: role.CreateDate ? new Date(role.CreateDate) : undefined,
  }
}

/** How long a new IAM role can take before AWS accepts it everywhere. */
const NEW_BROKER_MS = 3 * 60_000

/**
 * Whether the role may not work everywhere yet: created by this session, or by an earlier one
 * (say a start that ended before it was ready) less than NEW_BROKER_MS before `nowMs`.
 */
export const isNewBroker = (broker, nowMs) =>
  Boolean(
    broker?.created ||
    (broker?.createdAt && nowMs - broker.createdAt.getTime() < NEW_BROKER_MS),
  )

/** A policy statement as IAM means it: single values and lists alike, keys in any order. */
const statementMeaning = (statement) => {
  const meaning = {}
  for (const [element, value] of Object.entries(statement ?? {})) {
    meaning[element] =
      element === 'Condition'
        ? conditionsOf(value)
        : element === 'Principal' || element === 'NotPrincipal'
          ? principalOf(value)
          : element === 'Effect' || element === 'Sid'
            ? value
            : sortedValues(value)
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(meaning)
        .sort()
        .map((key) => [key, meaning[key]]),
    ),
  )
}
const policyMeaning = (doc) => ({
  version: doc?.Version,
  statements: list(doc?.Statement).map(statementMeaning).sort(),
})
const parsedOrNull = (raw) => {
  try {
    return parseDocument(raw)
  } catch {
    return null
  }
}

/**
 * How the broker's permission policy stands against this version's:
 * - 'present': this version, as this version writes it;
 * - 'missing': none (a broker whose creation stopped between CreateRole and PutRolePolicy has
 *   none, and every bridge would then run the deployed code);
 * - 'outdated': an older version, this version changed by someone, or a policy of that name
 *   without the version marker; it is overwritten;
 * - 'newer': a newer version wrote it; it is left as it is;
 * - 'unknown': IAM will not tell this caller (iam:GetRolePolicy denied).
 */
export const brokerPolicyState = async (options) => {
  try {
    return await readBrokerPolicyState(options)
  } catch (error) {
    if (isAccessDenied(error)) return 'unknown'
    throw error
  }
}

/** brokerPolicyState, with a denied iam:GetRolePolicy passed on as it is. */
const readBrokerPolicyState = async ({ iam, name, identity, region }) => {
  let raw
  try {
    raw = await iam.getRolePolicy(name, BROKER_POLICY_NAME)
  } catch (error) {
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    throw error
  }
  if (!raw) return 'missing'
  const stored = parsedOrNull(raw)
  const version = policyVersionOf(stored)
  if (version !== null && version > BROKER_POLICY_VERSION) return 'newer'
  return version === BROKER_POLICY_VERSION &&
    same(
      policyMeaning(stored),
      policyMeaning(buildPermissionPolicy({ identity, region })),
    )
    ? 'present'
    : 'outdated'
}

/**
 * Whether the broker's permission policy is the previous version's, as that version wrote it: it
 * serves functions, so a session without web apps can run with it. False when IAM will not say.
 */
export const brokerPolicyIsPrevious = async ({
  iam,
  name,
  identity,
  region,
}) => {
  let raw
  try {
    raw = await iam.getRolePolicy(name, BROKER_POLICY_NAME)
  } catch (error) {
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    if (isAccessDenied(error)) return false
    throw error
  }
  const stored = raw ? parsedOrNull(raw) : null
  return (
    policyVersionOf(stored) === BROKER_POLICY_VERSION - 1 &&
    same(
      policyMeaning(stored),
      policyMeaning(
        buildPermissionPolicy({
          identity,
          region,
          version: BROKER_POLICY_VERSION - 1,
        }),
      ),
    )
  )
}

/** Whether a session puts the permission policy in place (`putBrokerPolicy`) before attaching. */
export const brokerPolicyNeedsRepair = (state) =>
  state === 'missing' || state === 'outdated'

/**
 * Writes this version's permission policy, over whatever the role has under that name. `arn`, the
 * role's ARN when it is known, names it in an error.
 */
export const putBrokerPolicy = async ({ iam, name, arn, identity, region }) => {
  try {
    await iam.putRolePolicy({
      RoleName: name,
      PolicyName: BROKER_POLICY_NAME,
      PolicyDocument: JSON.stringify(
        buildPermissionPolicy({ identity, region }),
      ),
    })
  } catch (error) {
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    if (isAccessDenied(error)) {
      throw new ServerlessError(
        `Dev Mode could not put the permission policy ${BROKER_POLICY_NAME} on the IAM role ${roleLabel({ arn, name })} (${error.message}).\n` +
          'That needs iam:PutRolePolicy on the role.\n' +
          brokerSetupHint(region),
        'DEV_MODE_BROKER_CREATE_DENIED',
        originalOf(error),
      )
    }
    throw error
  }
}

/**
 * Whether the broker's permission policy must be left as it is because a newer version of Dev Mode
 * wrote it. Without iam:GetRolePolicy that cannot be told, and writing could replace a newer one:
 * `DEV_MODE_BROKER_READ_DENIED`. `arn`, the role's ARN when it is known, names it in that error.
 */
export const brokerPolicyIsNewer = async ({
  iam,
  name,
  arn,
  identity,
  region,
}) => {
  try {
    return (
      (await readBrokerPolicyState({ iam, name, identity, region })) === 'newer'
    )
  } catch (error) {
    if (!isAccessDenied(error)) throw error
    throw new ServerlessError(
      `Dev Mode needs iam:GetRolePolicy on the IAM role ${roleLabel({ arn, name })} to read its permission policy ${BROKER_POLICY_NAME} before it writes one (${error.message}): a newer version of Dev Mode may have written it, and Dev Mode never replaces a newer one. Ask your AWS administrator to allow it.`,
      'DEV_MODE_BROKER_READ_DENIED',
      originalOf(error),
    )
  }
}

/**
 * Puts this version's permission policy on an existing broker unless a newer version wrote it.
 * Returns whether it was written.
 */
export const updateBrokerPolicy = async ({
  iam,
  name,
  arn,
  identity,
  region,
}) => {
  if (await brokerPolicyIsNewer({ iam, name, arn, identity, region })) {
    return false
  }
  await putBrokerPolicy({ iam, name, arn, identity, region })
  return true
}

/** Sets the permissions boundary of an existing broker role; access denials pass through. */
export const putBrokerBoundary = async ({ iam, name, boundary }) => {
  try {
    await iam.putRolePermissionsBoundary({
      RoleName: name,
      PermissionsBoundary: boundary,
    })
  } catch (error) {
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    if (BOUNDARY_ERRORS.has(error?.name)) throw boundaryError(boundary, error)
    throw error
  }
}

export const createBroker = async ({
  iam,
  name,
  identity,
  region,
  permissionsBoundary,
  path = '/',
  randomBytes = nodeRandomBytes,
  // When a teammate created the role first and its policy cannot be read: 'keep' takes it to be in
  // place (a session), 'stop' fails with DEV_MODE_BROKER_READ_DENIED (dev setup).
  unreadablePolicy = 'keep',
}) => {
  const externalId = randomBytes(16).toString('hex')
  let role
  try {
    role = await iam.createRole({
      RoleName: name,
      Path: path,
      Description: BROKER_ROLE_DESCRIPTION,
      AssumeRolePolicyDocument: JSON.stringify(
        buildTrustPolicy({ identity, region, externalId }),
      ),
      MaxSessionDuration: 3600,
      ...(permissionsBoundary && { PermissionsBoundary: permissionsBoundary }),
    })
  } catch (error) {
    // A teammate created it first: theirs is the one to use, once its trust policy is verified
    // and its permission policy is in place. Their PutRolePolicy may not have landed yet, or
    // their start may have stopped before it; the policy is the same for the account and Region,
    // so it is put again, as for a role this start created.
    if (error?.name === 'EntityAlreadyExistsException') {
      const existing = await getBroker({ iam, name, identity, region })
      if (!existing) return existing
      try {
        const written = await updateBrokerPolicy({
          iam,
          name,
          arn: existing.arn,
          identity,
          region,
        })
        return { ...existing, policyKept: !written }
      } catch (error) {
        // A session, as everywhere, takes a policy it may not read to be in place.
        if (
          unreadablePolicy === 'stop' ||
          error?.code !== 'DEV_MODE_BROKER_READ_DENIED'
        ) {
          throw error
        }
        return { ...existing, policyKept: true }
      }
    }
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    if (isAccessDenied(error)) {
      throw createDeniedError(
        brokerRoleArn({ identity, name, path }),
        error,
        region,
      )
    }
    if (permissionsBoundary && BOUNDARY_ERRORS.has(error?.name)) {
      throw boundaryError(permissionsBoundary, error)
    }
    throw error
  }
  // A role created now has no earlier policy.
  await putBrokerPolicy({ iam, name, arn: role.Arn, identity, region })
  return {
    name,
    arn: role.Arn,
    externalId,
    path: role.Path,
    created: true,
    widened: true,
  }
}

/**
 * Lets web functions assume an existing broker whose trust lists functions only: rewrites the
 * Dev Mode statement as the widened one with the role's own ExternalId, so attached functions keep
 * working, and keeps every other statement (deny statements an administrator added) as it is.
 */
export const widenBrokerTrust = async ({
  iam,
  name,
  identity,
  region,
  externalId,
}) => {
  try {
    const widened = buildTrustPolicy({ identity, region, externalId })
    const role = await iam.getRole(name)
    const current = role ? parseDocument(role.AssumeRolePolicyDocument) : {}
    const statements = list(current.Statement)
    const document = statements.some((s) => s.Sid === BROKER_TRUST_SID)
      ? {
          ...current,
          Statement: statements.map((s) =>
            s.Sid === BROKER_TRUST_SID ? widened.Statement[0] : s,
          ),
        }
      : widened
    await iam.updateAssumeRolePolicy({
      RoleName: name,
      PolicyDocument: JSON.stringify(document),
    })
  } catch (error) {
    if (isCredentialError(error)) throw credentialsInvalidError(error)
    if (isAccessDenied(error)) {
      throw new ServerlessError(
        `Dev Mode needs to let web apps use the IAM role ${name}, and your credentials can't update its trust policy (iam:UpdateAssumeRolePolicy). Ask an administrator to run "serverless dev setup --region ${region}".`,
        'DEV_MODE_BROKER_UPDATE_DENIED',
        originalOf(error),
      )
    }
    throw error
  }
}
