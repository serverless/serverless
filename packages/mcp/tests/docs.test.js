import { jest, describe, test, expect, beforeEach } from '@jest/globals'

const mockReaddir = jest.fn()
const mockStat = jest.fn()
const mockReadFile = jest.fn()

await jest.unstable_mockModule('node:fs/promises', () => {
  return {
    readdir: mockReaddir,
    stat: mockStat,
    readFile: mockReadFile,
  }
})

const { getDocs } = await import('../src/tools/docs.js')

describe('Docs Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReaddir.mockResolvedValue([])
  })

  test('should reject path traversal attempts', async () => {
    const result = await getDocs({
      product: 'sf',
      paths: ['../../etc/passwd'],
    })

    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain(
      'Invalid path: sf/../../etc/passwd',
    )
    expect(mockStat).not.toHaveBeenCalled()
  })
})
