import { jest, describe, test, expect, beforeEach } from '@jest/globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mockReaddir = jest.fn()
const mockStat = jest.fn()
const mockReadFile = jest.fn()
const mockRealpath = jest.fn()

await jest.unstable_mockModule('node:fs/promises', () => {
  const fsMock = {
    readdir: mockReaddir,
    stat: mockStat,
    readFile: mockReadFile,
    realpath: mockRealpath,
  }
  return { ...fsMock, default: fsMock }
})

const { getDocs } = await import('../src/tools/docs.js')

// Same resolution the tool performs via fromRepoRoot('docs/sf'): this file
// lives in packages/mcp/tests, three levels below the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsBase = path.resolve(__dirname, '../../..', 'docs/sf')

describe('Docs Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReaddir.mockResolvedValue([])
    // Default: every path is already real.
    mockRealpath.mockImplementation(async (p) => p)
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
    expect(mockRealpath).not.toHaveBeenCalled()
  })

  test('should reject a link whose target resolves outside the docs directory', async () => {
    const requested = path.resolve(docsBase, 'leak.md')
    const outside = path.resolve(docsBase, '..', '..', 'outside', 'secret.txt')
    mockRealpath.mockImplementation(async (p) =>
      p === requested ? outside : p,
    )
    mockStat.mockResolvedValue({ isDirectory: () => false })
    mockReadFile.mockResolvedValue('SECRET')

    const result = await getDocs({ product: 'sf', paths: ['leak.md'] })

    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain('Invalid path: sf/leak.md')
    expect(result.content[0].text).not.toContain('SECRET')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('should serve a file when the docs directory itself sits behind a link', async () => {
    const realBase = path.resolve(docsBase, '..', '..', 'real-docs-location')
    const requested = path.resolve(docsBase, 'guide.md')
    const realRequested = path.resolve(realBase, 'guide.md')
    mockRealpath.mockImplementation(async (p) => {
      if (p === docsBase) return realBase
      if (p === requested) return realRequested
      return p
    })
    mockStat.mockResolvedValue({ isDirectory: () => false })
    mockReadFile.mockResolvedValue('# Guide')

    const result = await getDocs({ product: 'sf', paths: ['guide.md'] })

    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain('# Guide')
    expect(mockStat).toHaveBeenCalledWith(realRequested)
    expect(mockReadFile).toHaveBeenCalledWith(realRequested, 'utf-8')
  })

  test('should report other filesystem errors as not found, without the raw message', async () => {
    const requested = path.resolve(docsBase, 'loop.md')
    mockRealpath.mockImplementation(async (p) => {
      if (p !== requested) return p
      const error = new Error(`ELOOP: too many symbolic links, realpath '${p}'`)
      error.code = 'ELOOP'
      throw error
    })

    const result = await getDocs({ product: 'sf', paths: ['loop.md'] })

    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain('Path "sf/loop.md" not found.')
    expect(result.content[0].text).not.toContain('ELOOP')
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('should fall back to suggestions when the path does not exist', async () => {
    mockRealpath.mockImplementation(async (p) => {
      if (p === docsBase) return p
      const error = new Error(`ENOENT: no such file or directory, ${p}`)
      error.code = 'ENOENT'
      throw error
    })

    const result = await getDocs({ product: 'sf', paths: ['missing.md'] })

    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain('Path "sf/missing.md" not found.')
    expect(mockReadFile).not.toHaveBeenCalled()
  })
})
