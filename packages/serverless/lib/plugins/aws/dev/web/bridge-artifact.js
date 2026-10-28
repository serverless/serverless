/**
 * The web bridge zip a web app's dev revision is created from. It ships with the CLI
 * (`npm run build:devmode:web-bridge -w @serverless/framework` in a source checkout) and is put in
 * the stage's deployment bucket once per build, under
 * `serverless-dev-mode/<service>/<stage>/bridge/<first 16 hex of its SHA-256>.zip`: a key fixes its
 * content, so a key that exists is not uploaded again. The session sweeps leave that prefix alone;
 * `serverless remove` deletes it with the stage's other Dev Mode objects.
 *
 * Lambda reads the code from the bucket with the deployment bucket's settings, as for the deployed
 * revision, so no version id is needed: the key alone names one content.
 */
import { createHash } from 'crypto'
import fsp from 'fs/promises'
import { ServerlessError } from '@serverless/util'
import {
  runsFromReleasedBundle,
  webBridgeArtifactPath,
} from '../attach/naming.js'
import { bridgePrefix } from '../relay/side-channel.js'
import { uploadArtifactIfMissing } from '../../lib/content-addressed-artifacts.js'

/** The key of the zip with SHA-256 `sha256` (hex) for one service and stage. */
export const webBridgeKey = ({ service, stage, sha256 }) =>
  `${bridgePrefix({ service, stage })}${sha256.slice(0, 16)}.zip`

/**
 * The zip's bytes and SHA-256. A missing zip in the released CLI means a damaged installation; in
 * a source checkout it was not built yet.
 */
export const readWebBridgeArtifact = async ({
  readFile = fsp.readFile,
  file = webBridgeArtifactPath(),
  released = runsFromReleasedBundle(),
} = {}) => {
  let bytes
  try {
    bytes = await readFile(file)
  } catch (error) {
    const next = released
      ? 'Reinstall the Serverless Framework, then run the command again.'
      : 'In a source checkout, build it with "npm run build:devmode:web-bridge -w @serverless/framework".'
    throw new ServerlessError(
      `The Dev Mode web bridge is missing (${file}: ${error.message}). ${next}`,
      'DEV_MODE_WEB_BRIDGE_MISSING',
      { stack: false },
    )
  }
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/**
 * Puts the zip in the deployment bucket unless its key is there already; resolves the
 * `{ bucket, key }` a dev revision's code is created from.
 */
export const uploadWebBridge = async ({
  provider,
  serverless,
  artifact,
  upload = uploadArtifactIfMissing,
}) => {
  const { bytes, sha256 } = artifact ?? (await readWebBridgeArtifact())
  const bucket = await provider.getServerlessDeploymentBucketName()
  const key = webBridgeKey({
    service: serverless.service.service,
    stage: provider.getStage(),
    sha256,
  })
  await upload({
    provider,
    bucket,
    key,
    body: bytes,
    deploymentBucketObject: serverless.service.provider?.deploymentBucketObject,
  })
  return { bucket, key }
}
