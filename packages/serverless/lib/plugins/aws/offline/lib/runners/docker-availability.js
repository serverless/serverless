import ServerlessError from '../../../../../serverless-error.js'

/**
 * Verify that a Docker daemon is reachable before booting the Java runner.
 *
 * Calls `ping()` on the underlying dockerode client and translates failures
 * into actionable `ServerlessError`s. Three error codes are surfaced:
 *
 *   - `OFFLINE_DOCKER_BINARY_MISSING` when the socket cannot be located
 *     (dockerode raises `ENOENT`). Almost always means Docker isn't
 *     installed on the host.
 *   - `OFFLINE_DOCKER_PERMISSION_DENIED` when the socket exists but
 *     this user can't open it (`EACCES`). On Linux, usually means the
 *     user isn't in the `docker` group.
 *   - `OFFLINE_DOCKER_DAEMON_NOT_RUNNING` for every other failure mode,
 *     including `ECONNREFUSED` from a stopped daemon. Wraps the
 *     underlying error message so the user sees the original cause.
 *
 * Resolves with `undefined` on success.
 *
 * @param {object} args
 * @param {{ getDockerodeClient: () => { ping: () => Promise<unknown> } }} args.dockerClient
 *   The shared `DockerClient` wrapper from `@serverless/util`.
 * @returns {Promise<void>}
 */
export async function assertDockerAvailable({ dockerClient }) {
  const docker = dockerClient.getDockerodeClient()
  try {
    await docker.ping()
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new ServerlessError(
        'Docker not found. Install Docker Desktop (macOS/Windows) or the Docker engine (Linux) and retry — Java functions require a running Docker daemon.',
        'OFFLINE_DOCKER_BINARY_MISSING',
      )
    }
    if (err && err.code === 'EACCES') {
      throw new ServerlessError(
        'Permission denied connecting to the Docker daemon socket. ' +
          'On Linux, add your user to the `docker` group: ' +
          '`sudo usermod -aG docker $USER` (then log out and back in). ' +
          'On macOS/Windows, restart Docker Desktop.',
        'OFFLINE_DOCKER_PERMISSION_DENIED',
      )
    }
    const detail = err && err.message ? err.message : String(err)
    throw new ServerlessError(
      `Docker daemon not reachable (${detail}). Start Docker Desktop or run \`systemctl start docker\` on Linux and retry.`,
      'OFFLINE_DOCKER_DAEMON_NOT_RUNNING',
    )
  }
}
