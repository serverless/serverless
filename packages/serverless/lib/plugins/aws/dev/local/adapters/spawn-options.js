/**
 * How every adapter starts a worker: no shell, no console window, only the given environment, and
 * on POSIX as the leader of its own process group. A terminal sends Ctrl+C to its whole foreground
 * group, so in the CLI's group every worker would die before the session stops it; in its own
 * group only the CLI hears it, and the laptop runtime signals the group, which also reaches what a
 * handler started. The worker still exits once the CLI is gone (the runtime clients watch for
 * that). Windows has no process groups: there a worker stays in the CLI's console, as before.
 */
export const workerSpawnOptions = ({
  cwd,
  env,
  platform = process.platform,
}) => ({
  cwd,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  ...(platform !== 'win32' && { detached: true }),
})
