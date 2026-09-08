import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { resolveDocPath } from '../src/tools/docs.js'

// Exercises resolveDocPath against a real directory tree with real links.
// The mocked suite in docs.test.js proves the tool wires the helper in; this
// one proves the helper's containment property holds on the actual filesystem.
//
// Layout under a fresh temp directory:
//   root/
//     outside/secret.txt
//     real-docs/            ← the real base
//       guide.md
//       alias.md            → guide.md            (link inside the base)
//       leak.md             → ../outside/secret.txt (file link escaping)
//       leak-dir            → ../outside           (directory link escaping)
//     docs                  → real-docs           (the base reached via a link)

let root
let realDocs
let linkedDocs
let symlinksSupported = true

async function trySymlink(target, linkPath, type) {
  try {
    await fs.symlink(target, linkPath, type)
    return true
  } catch (error) {
    // Windows without Developer Mode refuses symlink creation with EPERM.
    if (error.code === 'EPERM') {
      console.warn(`Skipping symlink cases: ${error.message}`)
      return false
    }
    throw error
  }
}

beforeAll(async () => {
  // Deliberately NOT realpath'd: on macOS os.tmpdir() is /var/... while the
  // real path is /private/var/..., so passing the unresolved base exercises
  // the requirement that the base itself is resolved before comparison.
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-mcp-docs-resolve-'))
  realDocs = path.join(root, 'real-docs')
  linkedDocs = path.join(root, 'docs')
  const outside = path.join(root, 'outside')

  await fs.mkdir(realDocs)
  await fs.mkdir(outside)
  await fs.writeFile(path.join(realDocs, 'guide.md'), '# Guide\n')
  await fs.writeFile(path.join(outside, 'secret.txt'), 'SECRET\n')

  symlinksSupported =
    (await trySymlink('guide.md', path.join(realDocs, 'alias.md'), 'file')) &&
    (await trySymlink(
      path.join('..', 'outside', 'secret.txt'),
      path.join(realDocs, 'leak.md'),
      'file',
    )) &&
    (await trySymlink(
      path.join('..', 'outside'),
      path.join(realDocs, 'leak-dir'),
      'dir',
    )) &&
    (await trySymlink('real-docs', linkedDocs, 'dir'))
})

afterAll(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
})

describe('resolveDocPath on a real filesystem', () => {
  test('serves a plain file inside the base', async () => {
    const result = await resolveDocPath(realDocs, 'guide.md')
    expect(result).toMatchObject({ isWithinBase: true, exists: true })
    expect(result.resolvedPath).toBe(
      await fs.realpath(path.join(realDocs, 'guide.md')),
    )
  })

  test('reports a missing path as not existing but within the base', async () => {
    const result = await resolveDocPath(realDocs, 'missing.md')
    expect(result).toMatchObject({ isWithinBase: true, exists: false })
  })

  test('reports a file used as a directory as not existing', async () => {
    const result = await resolveDocPath(realDocs, 'guide.md/nested.md')
    expect(result).toMatchObject({ isWithinBase: true, exists: false })
  })

  test('rejects lexical escapes without touching the filesystem', async () => {
    const result = await resolveDocPath(realDocs, '../outside/secret.txt')
    expect(result).toMatchObject({ isWithinBase: false, exists: false })
  })

  test('rejects a file link whose target leaves the base', async () => {
    if (!symlinksSupported) return
    const result = await resolveDocPath(realDocs, 'leak.md')
    expect(result).toMatchObject({ isWithinBase: false, exists: true })
  })

  test('rejects a directory link whose target leaves the base', async () => {
    if (!symlinksSupported) return
    const result = await resolveDocPath(realDocs, 'leak-dir')
    expect(result).toMatchObject({ isWithinBase: false, exists: true })
    const nested = await resolveDocPath(realDocs, 'leak-dir/secret.txt')
    expect(nested).toMatchObject({ isWithinBase: false, exists: true })
  })

  test('allows a link whose target stays inside the base', async () => {
    if (!symlinksSupported) return
    const result = await resolveDocPath(realDocs, 'alias.md')
    expect(result).toMatchObject({ isWithinBase: true, exists: true })
    expect(result.resolvedPath).toBe(
      await fs.realpath(path.join(realDocs, 'guide.md')),
    )
  })

  test('allows a plain file when the base itself is reached through a link', async () => {
    if (!symlinksSupported) return
    const result = await resolveDocPath(linkedDocs, 'guide.md')
    expect(result).toMatchObject({ isWithinBase: true, exists: true })
    expect(result.resolvedPath).toBe(
      await fs.realpath(path.join(realDocs, 'guide.md')),
    )
  })

  test('still rejects an escaping link when the base is reached through a link', async () => {
    if (!symlinksSupported) return
    const result = await resolveDocPath(linkedDocs, 'leak.md')
    expect(result).toMatchObject({ isWithinBase: false, exists: true })
  })
})
