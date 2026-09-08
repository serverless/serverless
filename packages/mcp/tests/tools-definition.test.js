import { jest, describe, test, expect, beforeAll } from '@jest/globals'

import { registerTools } from '../src/tools-definition.js'

// Pins the registered tool contracts that the implementations depend on, so
// the schema advertised to MCP clients cannot drift from what the tool
// handlers actually read.

const registered = new Map()

beforeAll(() => {
  const server = {
    tool: jest.fn((name, description, shape, handler) => {
      registered.set(name, { description, shape, handler })
    }),
  }
  registerTools(server)
})

describe('registered tool contracts', () => {
  test('service-summary requires cloudProvider and does not declare serviceType', () => {
    const { shape } = registered.get('service-summary')

    expect(shape.serviceType).toBeUndefined()
    expect(shape.cloudProvider.safeParse(undefined).success).toBe(false)
    expect(shape.cloudProvider.safeParse('aws').success).toBe(true)
    // Only providers with resource handlers are advertised.
    expect(shape.cloudProvider.safeParse('gcp').success).toBe(false)
  })

  test('service-summary keeps serviceName optional for per-resource calls', () => {
    const { shape } = registered.get('service-summary')

    expect(shape.serviceName.safeParse(undefined).success).toBe(true)
    expect(shape.serviceWideAnalysis.safeParse(undefined).success).toBe(true)
  })
})
