import { describe, expect, test } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import {
  CLIENT_FILES,
  clientPath,
  clientPathFrom,
  tsxLoaderUrl,
} from '../../../../../../../lib/plugins/aws/dev/local/paths.js'

describe('runtime client paths', () => {
  test('the released bundle maps onto the source-tree layout the release copies to', () => {
    const bundle = path.join(path.sep, 'pkg', 'dist')
    expect(clientPathFrom(bundle, CLIENT_FILES.node)).toBe(
      path.join(
        path.sep,
        'pkg',
        'lib',
        'plugins',
        'aws',
        'dev',
        'local',
        'clients',
        'node-client.mjs',
      ),
    )
  })

  test('the source tree keeps the clients next to the module', () => {
    expect(fs.existsSync(clientPath(CLIENT_FILES.node))).toBe(true)
  })

  test('the Python client ships next to the Node one', () => {
    expect(fs.existsSync(clientPath(CLIENT_FILES.python))).toBe(true)
  })

  test('the tsx loader resolves from this package, and a failed resolution is null', () => {
    expect(tsxLoaderUrl()).toMatch(/^file:.*tsx.*\.mjs$/)
    expect(
      tsxLoaderUrl(() => {
        throw new Error('not found')
      }),
    ).toBeNull()
  })
})
