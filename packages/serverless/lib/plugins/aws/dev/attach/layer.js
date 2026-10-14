/**
 * The Dev Mode layer: built with the CLI, published lazily into the user's account once per
 * account, region and build (the zip's sha256 is in the version description), shared by every
 * service, stage and developer there. Old versions are never deleted: a teammate's session may use
 * one, and functions keep working even if a version is deleted.
 */
import { createHash } from 'crypto'
import fsp from 'fs/promises'
import { ServerlessError } from '@serverless/util'
import {
  layerArtifactPath,
  layerName,
  runsFromReleasedBundle,
} from './naming.js'

/**
 * The layer zip ships with the released CLI, so a missing one there means a damaged installation;
 * in a source checkout it has not been built yet.
 */
export const readLayerArtifact = async (
  arch,
  {
    readFile = fsp.readFile,
    pathFor = layerArtifactPath,
    released = runsFromReleasedBundle(),
  } = {},
) => {
  const file = pathFor(arch)
  let bytes
  try {
    bytes = await readFile(file)
  } catch (error) {
    const next = released
      ? 'Reinstall the Serverless Framework, then run the command again.'
      : 'In a source checkout, build it with "npm run build:devmode:layer -w @serverless/framework" (needs Go).'
    throw new ServerlessError(
      `The Dev Mode layer for ${arch} is missing (${file}: ${error.message}). ${next}`,
      'DEV_MODE_LAYER_MISSING',
      { stack: false },
    )
  }
  return {
    arch,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

const DESCRIPTION_PREFIX = 'Serverless Framework Dev Mode layer sha256:'
export const layerDescription = (sha256) => `${DESCRIPTION_PREFIX}${sha256}`
// The whole description Dev Mode publishes with: the prefix and the zip's SHA-256, nothing else.
const DESCRIPTION = /^Serverless Framework Dev Mode layer sha256:[0-9a-f]{64}$/

/**
 * Which of `layerArns` (versions of Dev Mode's layer names) Dev Mode published: those whose
 * description is the one it publishes with. A function that has such a version without Dev Mode's
 * wrapper and variables was left so by something that removed them; a session replaces the layer
 * when it attaches the function. One ListLayerVersions per layer name, a call every session makes
 * anyway. A listing that fails names none: those functions keep their deployed code.
 */
export const publishedByDevMode = async ({
  lambda,
  layerArns,
  logger = { debug() {} },
}) => {
  const wanted = new Set(layerArns)
  const found = new Set()
  const names = [...new Set(layerArns.map((arn) => arn.split(':')[6]))]
  for (const name of names) {
    try {
      for await (const version of lambda.listLayerVersions(name)) {
        if (
          wanted.has(version.LayerVersionArn) &&
          DESCRIPTION.test(version.Description ?? '')
        ) {
          found.add(version.LayerVersionArn)
        }
      }
    } catch (error) {
      logger.debug(
        `Dev Mode could not list the versions of the layer ${name} (${error.message}): it treats them as layers it did not publish`,
      )
    }
  }
  return found
}

/** What Lambda reports as a version's `Content.CodeSha256` for this zip: its SHA-256, in base64. */
export const codeSha256Of = (artifact) =>
  createHash('sha256').update(artifact.bytes).digest('base64')

/**
 * The newest version of this build whose content Lambda reports as exactly this CLI's zip. The
 * description only finds the candidates: anyone who can publish a version of the layer can copy
 * it, so each candidate's `Content.CodeSha256` is read (`GetLayerVersion`) and a version whose
 * content differs is never used (`logger.debug` says so). A publish retried after a network error
 * can leave two versions of one build; either works, the newest is picked.
 */
export const findLayerVersion = async ({
  lambda,
  artifact,
  logger = { debug() {} },
}) => {
  const name = layerName(artifact.arch)
  const candidates = []
  for await (const version of lambda.listLayerVersions(name)) {
    if (version.Description?.includes(`sha256:${artifact.sha256}`)) {
      candidates.push(version)
    }
  }
  candidates.sort((a, b) => b.Version - a.Version)
  const expected = codeSha256Of(artifact)
  for (const candidate of candidates) {
    const details = await lambda.getLayerVersion(name, candidate.Version)
    if (details?.Content?.CodeSha256 === expected) {
      return candidate.LayerVersionArn
    }
    logger.debug(
      `Dev Mode does not use ${candidate.LayerVersionArn}: its content is not the layer this CLI ships.`,
    )
  }
  return null
}

export const ensureLayerVersion = async ({ lambda, artifact, logger }) => {
  const existing = await findLayerVersion({ lambda, artifact, logger })
  if (existing) return { arn: existing, published: false }
  const version = await lambda.publishLayerVersion({
    LayerName: layerName(artifact.arch),
    Description: layerDescription(artifact.sha256),
    Content: { ZipFile: artifact.bytes },
    CompatibleArchitectures: [artifact.arch],
  })
  return { arn: version.LayerVersionArn, published: true }
}
