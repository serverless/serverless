/**
 * MicroVM image-version pruning for `sandboxes`.
 *
 * Every deploy that changes a sandbox's artifact builds a new version of its
 * `AWS::Lambda::MicrovmImage`, and AWS caps the versions per image. Unlike a
 * function's `$LATEST`, the version that serves launches is one of the listed
 * versions: deleting it is allowed and silently moves launches to the previous
 * version, so it is never a candidate.
 */

const SDK = { sdkVersion: 3 }

// MicroVM states that still depend on the image version they started from;
// a suspended MicroVM resumes from that version's snapshot.
const IN_USE_STATES = new Set(['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED'])

// Version states that are still building (a concurrent deploy).
const BUILDING_STATES = new Set(['PENDING', 'IN_PROGRESS'])

// Version states that are already on their way out.
const DELETING_STATES = new Set(['DELETING', 'DELETED'])

const newestFirst = (a, b) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

/**
 * Pick the versions of one image to delete.
 *
 * Kept: the live version, the `number` newest other successful versions,
 * versions still building, and versions MicroVMs still use (these do not count
 * toward `number`, as aliased function versions do not). Failed versions are
 * deleted without counting toward `number`. Order is by creation time.
 *
 * @param {object} params
 * @param {Array<{imageVersion: string, state: string, createdAt: Date|string}>} params.versions
 * @param {string|undefined} params.liveVersion - `latestActiveImageVersion`
 * @param {Set<string>} params.inUseVersions
 * @param {number} params.number - Older versions to keep besides the live one
 * @returns {{candidates: string[], retained: Array<{version: string, reason: string}>}}
 */
export function selectPruneVersionsForImage({
  versions,
  liveVersion,
  inUseVersions,
  number,
}) {
  if (!liveVersion) return { candidates: [], retained: [] }

  const retained = []
  const successful = []
  const failed = []
  for (const v of [...versions].sort(newestFirst)) {
    const id = String(v.imageVersion)
    if (id === liveVersion || DELETING_STATES.has(v.state)) continue
    if (BUILDING_STATES.has(v.state)) {
      retained.push({ version: id, reason: 'building' })
      continue
    }
    if (inUseVersions.has(id)) {
      retained.push({ version: id, reason: 'in use' })
      continue
    }
    if (v.state === 'SUCCESSFUL') successful.push(id)
    else failed.push(id)
  }

  return {
    candidates: [...successful.slice(number), ...failed],
    retained,
  }
}

async function listAll(provider, method, input) {
  const items = []
  let nextToken
  do {
    const response = await provider.request(
      'LambdaMicrovms',
      method,
      { ...input, ...(nextToken && { nextToken }) },
      SDK,
    )
    items.push(...(response?.items || []))
    nextToken = response?.nextToken
  } while (nextToken)
  return items
}

/**
 * @returns {Promise<string|undefined>} the image's live version
 */
export async function getLiveImageVersion(provider, imageArn) {
  const image = await provider.request(
    'LambdaMicrovms',
    'getMicrovmImage',
    { imageIdentifier: imageArn },
    SDK,
  )
  return image?.latestActiveImageVersion
}

export function listImageVersions(provider, imageArn) {
  return listAll(provider, 'listMicrovmImageVersions', {
    imageIdentifier: imageArn,
  })
}

/**
 * @returns {Promise<Set<string>>} versions that a MicroVM still runs or can resume from
 */
export async function listInUseImageVersions(provider, imageArn) {
  const microvms = await listAll(provider, 'listMicrovms', {
    imageIdentifier: imageArn,
  })
  return new Set(
    microvms
      .filter((m) => IN_USE_STATES.has(m.state))
      .map((m) => String(m.imageVersion)),
  )
}

// Deleting a version puts its image into UPDATING for a few seconds, and the
// image refuses another delete meanwhile ("MicroVM Image is already in state:
// UPDATING")
const isImageBusy = (error) =>
  error?.providerError?.code === 'ConflictException' ||
  error?.providerError?.statusCode === 409 ||
  /already in state/i.test(error?.message ?? '')

/**
 * Delete one version, retrying while its image is busy with another change.
 */
export async function deleteImageVersion(
  provider,
  imageArn,
  imageVersion,
  { sleep, intervalMs = 2000, attempts = 30 },
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await provider.request(
        'LambdaMicrovms',
        'deleteMicrovmImageVersion',
        { imageIdentifier: imageArn, imageVersion },
        SDK,
      )
    } catch (error) {
      if (!isImageBusy(error) || attempt >= attempts) throw error
      await sleep(intervalMs)
    }
  }
}

export const isAccessDenied = (error) =>
  error?.providerError?.code === 'AccessDeniedException'

const isNotFound = (error) =>
  error?.providerError?.code === 'ResourceNotFoundException'

/**
 * Wait until deleted versions are gone. A delete returns `DELETING` and the
 * version disappears seconds later; waiting lets the next delete through and a
 * deploy that follows a manual prune build into the freed slots.
 *
 * @returns {Promise<string[]>} versions still present when the wait ran out
 */
export async function waitForImageVersionsDeleted(
  provider,
  imageArn,
  imageVersions,
  { sleep, intervalMs = 2000, timeoutMs = 60000 },
) {
  let pending = [...imageVersions]
  const deadline = Date.now() + timeoutMs
  while (pending.length > 0 && Date.now() < deadline) {
    await sleep(intervalMs)
    const stillThere = []
    for (const imageVersion of pending) {
      try {
        await provider.request(
          'LambdaMicrovms',
          'getMicrovmImageVersion',
          { imageIdentifier: imageArn, imageVersion },
          SDK,
        )
        stillThere.push(imageVersion)
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    }
    pending = stillThere
  }
  return pending
}
