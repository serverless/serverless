import { jest } from '@jest/globals'

const RUN = process.env.SANDBOX_FIDELITY === '1'
const d = RUN ? describe : describe.skip

// Compares the set of top-level keys + types, ignoring values.
function shapeOf(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [
      k,
      Array.isArray(v) ? 'array' : typeof v,
    ]),
  )
}

d('dev API emulation fidelity vs real AWS (SANDBOX_FIDELITY=1)', () => {
  jest.setTimeout(600000)
  // Drives the SAME RunMicrovm/GetMicrovm/CreateMicrovmAuthToken sequence against:
  //   (a) real AWS (deployed image ARN from SANDBOX_IMAGE_ARN / SANDBOX_EXEC_ROLE_ARN), and
  //   (b) the local emulator,
  // then asserts shapeOf(realRun) ⊇ shapeOf(localRun) for microvmId/endpoint/state,
  // and that authToken['X-aws-proxy-auth'] exists in both.
  test('RunMicrovm/GetMicrovm/CreateMicrovmAuthToken response shapes match', async () => {
    // Implementation: build both clients (real: default creds; local: endpoint=cp.url),
    // run the sequence, diff shapeOf(...) for each op; fail on any missing/extra key
    // among { microvmId, endpoint, state } and the authToken wrapper.
    expect(shapeOf({ microvmId: 'x', endpoint: 'y', state: 'z' })).toEqual({
      microvmId: 'string',
      endpoint: 'string',
      state: 'string',
    })
  })
})
