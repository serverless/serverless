/**
 * Which org a signed-in user's commands fall back to. `--org` on a command
 * and `org:` in serverless.yml always win; this settles the default saved in
 * .{baseFilename}rc when the user belongs to several orgs.
 */
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

/**
 * The org used when nobody said which: the oldest org the user owns, or the
 * oldest org at all when they own none -- the same rule a command applies
 * when it runs with a session that has no default yet.
 */
export const pickFallbackOrg = (orgs) => {
  const owned = orgs.filter((org) => org.role === 'owner')
  return (owned.length ? owned : orgs).reduce((prev, current) =>
    prev.createdAt <= current.createdAt ? prev : current,
  )
}

export const findOrg = (orgs, orgName) => {
  const org = orgs.find((candidate) => candidate.orgName === orgName)
  if (!org) {
    throw new ServerlessError(
      `You don't belong to an org named "${orgName}". Your orgs: ${orgs.map((o) => o.orgName).join(', ')}.`,
      ServerlessErrorCodes.general.ORG_NOT_FOUND,
      { stack: false },
    )
  }
  return org
}

/**
 * Settle the default org after a browser sign-in. Returns the name and where
 * it came from -- asked for, kept from the saved session, the only org, or
 * chosen on the user's behalf -- so the caller can say which.
 */
export const settleDefaultOrg = async ({
  orgs,
  savedDefaultOrgName = null,
  requestedOrgName = null,
  chooseDefaultOrg,
}) => {
  if (requestedOrgName) {
    return {
      orgName: findOrg(orgs, requestedOrgName).orgName,
      source: 'requested',
    }
  }
  if (orgs.some((org) => org.orgName === savedDefaultOrgName)) {
    return { orgName: savedDefaultOrgName, source: 'saved' }
  }
  if (orgs.length === 1) {
    return { orgName: orgs[0].orgName, source: 'only' }
  }
  return { orgName: await chooseDefaultOrg(orgs), source: 'chosen' }
}
