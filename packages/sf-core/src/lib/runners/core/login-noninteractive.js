/**
 * `serverless login` when no one is at the keyboard -- an AI agent or a
 * script. The interactive command opens a menu and a browser; neither works
 * without a TTY, so this path reports the session that already exists, or
 * prints the Dashboard sign-in URL for a person to open and waits for the
 * browser flow to complete. `--org <name>` makes that org the default: on a
 * new sign-in, or by switching the existing session's default without one.
 * Messages go through the logger like every other
 * command's: the URL and the wait as notices, the outcome as a success line
 * -- the same words the `agent setup` report uses for the state, as a
 * sentence rather than a `label: value`.
 */
import {
  isCICDEnvironment,
  log,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import { Authentication } from '../../auth/index.js'
import { findOrg } from '../../auth/default-org.js'
import { describeAuth, detectServerlessAuth } from './agent-env-report.js'

const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const ENV_KEY_NAMES = {
  'env-access': 'SERVERLESS_ACCESS_KEY',
  'env-license': 'SERVERLESS_LICENSE_KEY',
}

const MAX_LISTED_ORGS = 10

const listOrgs = (orgNames) =>
  orgNames.length > MAX_LISTED_ORGS
    ? `${orgNames.slice(0, MAX_LISTED_ORGS).join(', ')}, and ${orgNames.length - MAX_LISTED_ORGS} more`
    : orgNames.join(', ')

const signedIn = (user, org) =>
  sentence(describeAuth({ state: 'rc-user', user, org }))

// With several orgs and no --org, say which one became the default, which
// others exist, and the two ways to use another one -- none of which needs a
// terminal.
const orgNote = ({ orgNames = [], defaultSource }) =>
  orgNames.length > 1
    ? ` — ${defaultSource === 'saved' ? 'your saved default' : 'set as your default'}; you belong to ${orgNames.length} orgs: ${listOrgs(orgNames)}. For a service in another org, add "org: <name>" to its serverless.yml; to change the default, run "serverless login --org <name>".`
    : ''

// A sign-in that is already there, as every command checks it -- what
// `serverless login` ran before it had a non-interactive path: it counts a
// License Key in serverless.yml or in SSM, and fails for a revoked session or
// key. Nobody is at the keyboard here, so it never prompts.
const SSM_LICENSE =
  'using the License Key from the /serverless-framework/license-key SSM parameter'

const loginNonInteractive = async ({
  versionFramework,
  org,
  config,
  verifySignIn = () =>
    new Authentication({ versionFramework }).authenticate(config),
  detectAuth = detectServerlessAuth,
  createAuthentication = (options) => new Authentication(options),
  success = (text) => log.get('core:login').success(text),
  notice,
  timeoutMs,
  isCI = isCICDEnvironment,
} = {}) => {
  const auth = await detectAuth({ config })

  // An env key already names its org; there is no default to change.
  if (ENV_KEY_NAMES[auth.state] && org) {
    const name = auth.variable ?? ENV_KEY_NAMES[auth.state]
    throw new ServerlessError(
      `${name} is set, and it belongs to a single org, so --org has nothing to change. Unset ${name} to sign in as a user and pick a default org.`,
      ServerlessErrorCodes.general.INVALID_CLI_INPUT,
      { stack: false },
    )
  }

  // Without --org, an existing sign-in is checked the way every command
  // checks it before it is reported; only "nothing found" goes on to the
  // browser sign-in.
  if (!org) {
    let authenticatedData
    try {
      authenticatedData = await verifySignIn()
    } catch (error) {
      if (error?.code !== ServerlessErrorCodes.general.AUTH_REQUIRED) {
        throw error
      }
    }
    if (authenticatedData) {
      if (ENV_KEY_NAMES[auth.state]) {
        success(sentence(describeAuth(auth)))
      } else if (auth.state === 'none') {
        success(`Already ${SSM_LICENSE}`)
      } else {
        success(`Already ${describeAuth(auth)}`)
      }
      return { state: auth.state === 'none' ? 'ssm-license' : auth.state }
    }
  }

  // --org on a signed-in session: switch its default org, no browser needed.
  // A saved License Key goes on to a user sign-in, which then takes
  // precedence.
  if (auth.state === 'rc-user') {
    // Switch the default org of the existing session: no browser needed.
    const authentication = createAuthentication({ versionFramework })
    const { userId, username, orgs } =
      await authentication.listSignedInUserOrgs()
    const { orgName } = findOrg(orgs, org)
    await authentication.saveDefaultOrg({ userId, orgName })
    success(`${signedIn(username, orgName)}, now your default org`)
    return { state: 'rc-user', username, orgName }
  }

  // In CI nobody can open the sign-in URL, so waiting for it only burns runner
  // time: fail now with the keys that work there.
  if (isCI()) {
    throw new ServerlessError(
      'No one can open a sign-in URL in CI. Set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys) in the pipeline environment.',
      ServerlessErrorCodes.general.AUTH_REQUIRED,
      { stack: false },
    )
  }

  const authentication = createAuthentication({ versionFramework })
  const result = await authentication.loginNonInteractive({
    ...(org && { requestedOrgName: org }),
    ...(notice && { notice }),
    ...(timeoutMs && { timeoutMs }),
  })
  success(
    result.defaultSource === 'requested'
      ? `${signedIn(result.username, result.orgName)}, now your default org`
      : `${signedIn(result.username, result.orgName)}${orgNote(result)}`,
  )
  return { state: 'rc-user', ...result }
}

export default loginNonInteractive
