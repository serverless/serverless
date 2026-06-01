import { createServer } from 'node:net'

/**
 * Reserve a free TCP port by letting the OS assign one, then releasing it.
 *
 * @returns {Promise<number>}
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/**
 * Reserve two distinct free TCP ports. Our offline (and the community plugin)
 * reject appPort === lambdaPort, so callers that need a routable HTTP + lambda
 * pair must pass two different ports rather than relying on 0/0.
 *
 * @returns {Promise<[number, number]>}
 */
export async function twoFreePorts() {
  const a = await freePort()
  let b = await freePort()
  while (b === a) b = await freePort()
  return [a, b]
}
