import Hapi from '@hapi/hapi'
import { registerRuntimeApiRoutes } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/runtime-api-routes.js'
import { createInvocationQueue } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/invocation-queue.js'

describe('registerRuntimeApiRoutes (scaffold)', () => {
  let server
  let queue

  beforeEach(async () => {
    queue = createInvocationQueue()
    server = Hapi.server({ port: 0 })
    registerRuntimeApiRoutes(server, { queue })
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('registers GET /runtime/{functionKey}/2018-06-01/runtime/invocation/next', () => {
    const route = server.match(
      'GET',
      '/runtime/fn1/2018-06-01/runtime/invocation/next',
    )
    expect(route).not.toBeNull()
  })

  it('registers POST /runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/response', () => {
    const route = server.match(
      'POST',
      '/runtime/fn1/2018-06-01/runtime/invocation/abc/response',
    )
    expect(route).not.toBeNull()
  })

  it('registers POST /runtime/{functionKey}/2018-06-01/runtime/invocation/{requestId}/error', () => {
    const route = server.match(
      'POST',
      '/runtime/fn1/2018-06-01/runtime/invocation/abc/error',
    )
    expect(route).not.toBeNull()
  })
})
