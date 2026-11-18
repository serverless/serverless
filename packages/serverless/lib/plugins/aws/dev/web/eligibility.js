/**
 * Per-web-app mode: `dev` (the real URL reaches the server on this machine), `local` (the server
 * runs on this machine only, --local-only; the real URL keeps serving the deployed code),
 * `deployed` (the deployed code answers; always with a reason) or `skipped` (not deployed yet, or
 * held by another session). The first matching check wins. Rows mirror the functions' rows
 * (`../attach/eligibility.js`), with `webApp` in place of `function`.
 */
import { ServerlessError } from '@serverless/util'
import { isHeld } from '../attach/eligibility.js'
import { cliCommand } from '../commands/cli-names.js'

/** Per web function, as AWS sets them. */
const REVISION_LIMIT = 50
const ENDPOINT_LIMIT = 10

const row = (key, mode, reason, why, extra = {}) => ({
  webApp: key,
  mode,
  reason,
  why,
  notes: [],
  ...extra,
})

const isCount = (value) => Number.isInteger(value) && value >= 0
/** `count` without the `left` of it the attach removes first (unknown stays unknown). */
const remaining = (count, left) =>
  isCount(count) && isCount(left) ? Math.max(0, count - left) : count

/**
 * Whether another session holds the web app (`deployed.sessionId`, `deployed.owner`: the session
 * its `main` endpoint routes to, if any): a `skipped` row, or the notes of taking it.
 */
const ownership = ({ key, deployed, context }) => {
  const { sessionId, owner, takeOver, liveness } = context
  if (!deployed.sessionId || deployed.sessionId === sessionId) {
    return { notes: [] }
  }
  const mine = deployed.owner === owner
  // `unknown` when only a Dev Mode revision tells the session (web/attach.js): it names nobody.
  const known = deployed.owner && deployed.owner !== 'unknown'
  const held = isHeld(liveness, deployed.sessionId, mine)
  if (held && !takeOver) {
    return {
      row: row(
        key,
        'skipped',
        'owned_by_other_session',
        mine
          ? 'in Dev Mode in another session of yours (--take-over to take it)'
          : known
            ? `in Dev Mode for ${deployed.owner} (--take-over to take it)`
            : 'in Dev Mode in another session (--take-over to take it)',
      ),
    }
  }
  if (held) {
    return {
      notes: [
        {
          reason: 'taken_over',
          message: `taken over from ${mine ? 'another session of yours' : known ? deployed.owner : 'another session'}`,
        },
      ],
    }
  }
  return {
    notes: [
      mine
        ? {
            reason: 'reattached',
            message: 'left in Dev Mode by an earlier session of yours',
          }
        : {
            reason: 'taken_over',
            message: known
              ? `taken over from ${deployed.owner}, whose session has ended`
              : 'taken over from a session that has ended',
          },
    ],
  }
}

/**
 * `deployed` is what AWS says about the web app's function (null when it is not deployed):
 * `revisionCount` and `endpointCount` (left unchecked when unknown), and `sessionId` and `owner`
 * of the Dev Mode session it is attached to, if any, with `leftRevisionCount` and
 * `leftEndpointCount`: how many of the counted are that session's, which the attach removes
 * before it creates its own. `startSource` is how its server starts on
 * this machine (`resolveStartSource(...)?.source`, start-sources.js), null when nothing can start
 * it. `context` is this session: `sessionId`, `owner`, `takeOver` and `liveness` as for functions.
 */
export const classifyWebApp = ({
  key,
  config: rawConfig,
  deployed,
  selection = { selected: true, localOnly: false },
  startSource,
  context = {},
}) => {
  const config = rawConfig ?? {}
  if (!selection.selected) {
    return row(
      key,
      'deployed',
      'not_selected',
      `not selected (${selection.flag})`,
    )
  }
  if (!deployed) {
    return row(
      key,
      'skipped',
      'not_deployed',
      `not deployed yet (run ${cliCommand('deploy')})`,
    )
  }
  if (!startSource) {
    return row(
      key,
      'deployed',
      'build_output_entry',
      `${config.entry ? `entry ${config.entry}` : 'the entry'} is a build output; set webApps.${key}.dev.command (for example: next dev)`,
    )
  }
  const owned = ownership({ key, deployed, context })
  if (owned.row) return owned.row
  // A relayed web app gets a clone and a dev revision; a --local-only one, a dev revision only.
  const revisionsNeeded = selection.localOnly ? 1 : 2
  // Past the ownership check, the attach removes the session `deployed` names first (one that
  // ended, one taken over, or this one): its revisions and endpoints are not counted.
  const revisionCount = remaining(
    deployed.revisionCount,
    deployed.leftRevisionCount,
  )
  const endpointCount = remaining(
    deployed.endpointCount,
    deployed.leftEndpointCount,
  )
  if (
    isCount(revisionCount) &&
    revisionCount + revisionsNeeded > REVISION_LIMIT
  ) {
    return row(
      key,
      'deployed',
      'revision_quota',
      `${revisionCount} revisions, the AWS limit is ${REVISION_LIMIT}; Dev Mode needs ${selection.localOnly ? '1 with --local-only' : '2'}`,
    )
  }
  if (isCount(endpointCount) && endpointCount + 1 > ENDPOINT_LIMIT) {
    return row(
      key,
      'deployed',
      'endpoint_quota',
      `${endpointCount} endpoints, the AWS limit is ${ENDPOINT_LIMIT}; Dev Mode needs 1`,
    )
  }
  return {
    webApp: key,
    mode: selection.localOnly ? 'local' : 'dev',
    notes: owned.notes,
    startSource,
  }
}

/**
 * Which web apps the session runs: all by default, only those --web-app names when it is given,
 * none --skip-web-app names. --local-only names run on this machine only, and are selected even
 * when --web-app does not name them.
 */
export const selectWebApps = ({
  names,
  only = [],
  skip = [],
  localOnly = [],
}) => {
  const known = new Set(names)
  for (const name of [...only, ...skip, ...localOnly]) {
    if (!known.has(name)) {
      throw new ServerlessError(
        `Web app "${name}" is not in this service. Web apps: ${names.join(', ') || 'none'}.`,
        'DEV_MODE_UNKNOWN_WEB_APP',
        { stack: false },
      )
    }
  }
  const conflict = localOnly.find((name) => skip.includes(name))
  if (conflict) {
    throw new ServerlessError(
      `Web app "${conflict}" is given to both --local-only and --skip-web-app; use one of them.`,
      'DEV_MODE_OPTION_CONFLICT',
      { stack: false },
    )
  }
  return new Map(
    names.map((name) => {
      const local = localOnly.includes(name)
      if (only.length > 0 && !only.includes(name) && !local) {
        return [name, { selected: false, localOnly: false, flag: '--web-app' }]
      }
      if (skip.includes(name)) {
        return [
          name,
          { selected: false, localOnly: false, flag: '--skip-web-app' },
        ]
      }
      return [name, { selected: true, localOnly: local }]
    }),
  )
}
