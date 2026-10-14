import {
  DEV_BUILD_REQUEST,
  closeDevBuildRequest,
  currentDevBuildRequest,
  openDevBuildRequest,
} from '../../../../lib/utils/dev-build-request.js'

describe('the dev build request', () => {
  test('exists only between open and close, under one documented name', () => {
    const serverless = {}
    expect(currentDevBuildRequest(serverless)).toBeNull()
    const request = openDevBuildRequest(serverless, {
      functions: ['api', 'worker'],
    })
    expect(serverless[DEV_BUILD_REQUEST]).toBe(request)
    expect(currentDevBuildRequest(serverless)).toBe(request)
    closeDevBuildRequest(serverless, request)
    expect(DEV_BUILD_REQUEST in serverless).toBe(false)
  })

  test('records covered and built functions, only among those asked for', () => {
    const request = openDevBuildRequest({}, { functions: ['api', 'worker'] })
    request.cover('api')
    request.cover('worker')
    request.markBuilt('api')
    request.markBuilt('not-asked')
    request.cover('api')
    expect(request.result()).toEqual({
      covered: ['api', 'worker'],
      built: ['api'],
    })
    expect(Object.isFrozen(request.functions)).toBe(true)
  })

  test('records the handler file a build plugin wrote, only for functions it asks for', () => {
    const request = openDevBuildRequest({}, { functions: ['api', 'worker'] })
    request.markBuilt('api', 'src/api.mjs')
    request.markBuilt('worker')
    request.markBuilt('not-asked', 'elsewhere.js')
    expect(request.files()).toEqual({ api: 'src/api.mjs' })
    expect(request.result()).toEqual({
      covered: [],
      built: ['api', 'worker'],
    })
  })

  test('closing an older request leaves the current one', () => {
    const serverless = {}
    const first = openDevBuildRequest(serverless, { functions: ['a'] })
    const second = openDevBuildRequest(serverless, { functions: ['b'] })
    closeDevBuildRequest(serverless, first)
    expect(currentDevBuildRequest(serverless)).toBe(second)
  })
})
