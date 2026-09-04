import fs from 'fs'
import os from 'os'
import path from 'path'

// No module mocking: this exercises the REAL resolveConfigAndGetState — the
// exact entry point the pinned cross-stage lookup calls — against a real
// dependency config on disk.
//
// It pins the MECHANISM behind forwarding Compose params to that lookup: the
// dependency's own serverless.yml resolves `${param:...}` from the params it is
// handed, so an empty param set makes those variables unresolvable and the
// error aborts the whole Compose run. The failure happens during variable
// resolution — before authentication and before any AWS call — so this stays
// offline.
//
// The complementary "the pinned lookup now receives the real params" contract is
// pinned by pinned-state-compose-params.test.js (call-shape assertions) and
// end-to-end by the compose-service-provider integration fixture, whose
// `orders-db` consumes a compose-file `${param:...}`.
const { resolveConfigAndGetState } =
  await import('../../../../../src/lib/runners/compose/state.js')

describe('pinned dependency config resolution depends on the Compose params it is handed', () => {
  let workingDir

  beforeAll(() => {
    workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-state-param-'))
    fs.writeFileSync(
      path.join(workingDir, 'serverless.yml'),
      [
        'service: pinned-dep',
        'provider:',
        '  name: aws',
        '  region: ${param:depRegion}',
        '',
      ].join('\n'),
    )
  })

  afterAll(() => {
    fs.rmSync(workingDir, { recursive: true, force: true })
  })

  test('an empty param set makes a compose-supplied ${param:...} unresolvable', async () => {
    let error
    try {
      await resolveConfigAndGetState({
        command: ['get-state'],
        options: { stage: 'prod' },
        compose: {
          workingDir,
          params: {},
          serviceParams: {},
          isWithinCompose: true,
          serviceName: 'pinned-dep',
        },
        state: { getServiceState: async () => undefined },
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeDefined()
    expect(error.code).toBe('MISSING_VARIABLE_RESULT')
    expect(error.message).toContain('${param:depRegion}')
  }, 60000)
})
