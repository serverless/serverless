/**
 * What the laptop runtime holds while it runs: a session temp directory with the empty AWS and
 * boto config files the handlers are pointed at, the Lambda Runtime API and the credentials
 * endpoint on loopback.
 */
import fs from 'fs'
import path from 'path'
import { createRuntimeApi } from './runtime-api.js'
import { createCredentialsServer } from './credentials.js'
import { removeStaleTempDirs, sessionTempPrefix } from './leftovers.js'

/**
 * Opens the runtime's resources onto `resources` (a new object by default) and returns it. Each
 * one is set there as soon as it exists, so `close()` also closes what a start that failed half
 * way had opened.
 */
export const openRuntimeResources = async (
  { tmpRoot, pid, isAlive, randomBytes, now, debug },
  resources = {},
) => {
  resources.close = async () => {
    await resources.api?.close()
    await resources.credentials?.close()
    if (resources.tmpDir) {
      try {
        fs.rmSync(resources.tmpDir, { recursive: true, force: true })
      } catch (error) {
        debug(`Dev Mode could not remove ${resources.tmpDir}: ${error.message}`)
      }
    }
  }
  removeStaleTempDirs({
    tmpRoot,
    isAlive,
    onError: (dir, error) =>
      debug(`Dev Mode could not remove ${dir}: ${error.message}`),
  })
  // Named after this process, so a later session can tell when it is left over.
  resources.tmpDir = fs.mkdtempSync(path.join(tmpRoot, sessionTempPrefix(pid)))
  // Only the files leftovers.js recognises (SESSION_TEMP_FILES) belong here.
  resources.configFiles = {
    config: path.join(resources.tmpDir, 'aws-config'),
    credentials: path.join(resources.tmpDir, 'aws-credentials'),
    boto: path.join(resources.tmpDir, 'boto-config'),
  }
  for (const file of Object.values(resources.configFiles)) {
    fs.writeFileSync(file, '')
  }
  resources.api = createRuntimeApi()
  await resources.api.listen()
  resources.credentials = createCredentialsServer({ randomBytes, now })
  await resources.credentials.listen()
  return resources
}
