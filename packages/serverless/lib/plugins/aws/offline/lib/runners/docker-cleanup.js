/**
 * Best-effort removal of orphan offline Java containers left over from a
 * prior process that crashed or was killed with SIGKILL. Identified by
 * the `serverless-offline-java-` name prefix.
 *
 * Per-container failures are logged as warnings; the function never
 * throws — boot continues even if cleanup fails.
 *
 * @param {object} options
 * @param {object} options.dockerClient  DockerClient wrapper from
 *   `@serverless/util`; reached for raw dockerode via `getDockerodeClient()`.
 * @param {object} [options.log]
 * @returns {Promise<void>}
 */
export async function cleanupOrphanContainers({ dockerClient, log }) {
  const docker = dockerClient.getDockerodeClient()

  let orphans
  try {
    orphans = await docker.listContainers({
      all: true,
      filters: { name: ['serverless-offline-java-'] },
    })
  } catch (err) {
    if (typeof log?.warning === 'function') {
      log.warning(
        `Could not list orphan offline Java containers: ${err.message}. ` +
          'Continuing; orphans may need manual cleanup via `docker rm -f`.',
      )
    }
    return
  }

  if (orphans.length === 0) return

  if (typeof log?.notice === 'function') {
    log.notice(
      `Removing ${orphans.length} orphan offline Java container(s) from a prior run.`,
    )
  }

  for (const orphan of orphans) {
    try {
      await docker.getContainer(orphan.Id).remove({ force: true })
    } catch (err) {
      if (typeof log?.warning === 'function') {
        log.warning(
          `Could not remove orphan container ${orphan.Names?.[0] ?? orphan.Id}: ${err.message}.`,
        )
      }
    }
  }
}
