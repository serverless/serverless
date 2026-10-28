import path from 'path'
import {
  ARCHITECTURES,
  isReleasedBundleDir,
  layerArtifactPathFrom,
  webBridgeArtifactPathFrom,
} from '../../../../../../../lib/plugins/aws/dev/attach/naming.js'

test('the source tree keeps the zips next to the attach module', () => {
  const moduleDir = path.join(
    '/repo',
    'packages',
    'serverless',
    'lib',
    'plugins',
    'aws',
    'dev',
    'attach',
  )
  expect(layerArtifactPathFrom(moduleDir, 'arm64')).toBe(
    path.join(
      '/repo',
      'packages',
      'serverless',
      'lib',
      'plugins',
      'aws',
      'dev',
      'layer',
      'dist',
      'serverless-dev-arm64.zip',
    ),
  )
})

test('layerArtifactPathFrom resolves the bundled location from <package>/dist', () => {
  expect(layerArtifactPathFrom(path.join('/pkg', 'dist'), 'x86_64')).toBe(
    path.join(
      '/pkg',
      'lib',
      'plugins',
      'aws',
      'dev',
      'layer',
      'dist',
      'serverless-dev-x86_64.zip',
    ),
  )
})

test('the web bridge zip sits in dev/web/bridge/dist, from the source tree and from <package>/dist', () => {
  const sourceDir = path.join('/repo', 'lib', 'plugins', 'aws', 'dev', 'attach')
  expect(webBridgeArtifactPathFrom(sourceDir)).toBe(
    path.join(
      '/repo',
      'lib',
      'plugins',
      'aws',
      'dev',
      'web',
      'bridge',
      'dist',
      'sls-dev-web-bridge.zip',
    ),
  )
  expect(webBridgeArtifactPathFrom(path.join('/pkg', 'dist'))).toBe(
    path.join(
      '/pkg',
      'lib',
      'plugins',
      'aws',
      'dev',
      'web',
      'bridge',
      'dist',
      'sls-dev-web-bridge.zip',
    ),
  )
})

test('both Lambda architectures are built', () => {
  expect(ARCHITECTURES).toEqual(['x86_64', 'arm64'])
})

test('only the bundle directory <package>/dist counts as the released CLI', () => {
  expect(isReleasedBundleDir(path.join('/pkg', 'dist'))).toBe(true)
  expect(
    isReleasedBundleDir(
      path.join(
        '/repo',
        'packages',
        'serverless',
        'lib',
        'plugins',
        'aws',
        'dev',
        'attach',
      ),
    ),
  ).toBe(false)
})
