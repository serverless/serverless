import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginManagerSrc = readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'lib',
    'classes',
    'plugin-manager.js',
  ),
  'utf8',
)

describe('plugin-manager wires the offline plugin', () => {
  it('imports the OfflinePlugin module', () => {
    expect(pluginManagerSrc).toMatch(
      /import\s+pluginAwsOffline\s+from\s+['"]\.\.\/plugins\/aws\/offline\/index\.js['"]/,
    )
  })

  it('includes pluginAwsOffline in the internalPlugins array', () => {
    expect(pluginManagerSrc).toMatch(
      /internalPlugins\s*=\s*\[[^\]]*pluginAwsOffline/s,
    )
  })

  it('imports the top-level Offline command shell', () => {
    expect(pluginManagerSrc).toMatch(
      /import\s+pluginOffline\s+from\s+['"]\.\.\/plugins\/offline\.js['"]/,
    )
  })

  it('includes pluginOffline in the internalPlugins array', () => {
    expect(pluginManagerSrc).toMatch(
      /internalPlugins\s*=\s*\[[^\]]*pluginOffline/s,
    )
  })

  it('registers offline in bundledPluginDefinitions with community override allowed', () => {
    const re = /bundledPluginDefinitions\s*=\s*\[(.*?)\]\s*\n/s
    const match = pluginManagerSrc.match(re)
    expect(match).not.toBeNull()
    const block = match[1]
    expect(block).toMatch(/module:\s*pluginAwsOffline/)
    expect(block).toMatch(
      /externalNames:\s*\[\s*['"]serverless-offline['"]\s*\]/,
    )
    expect(block).toMatch(/allowCommunityOverride:\s*true/)
  })

  it('adds a serverless-offline migration notice branch in logBundledPluginNotice', () => {
    expect(pluginManagerSrc).toMatch(
      /pluginName === ['"]serverless-offline['"]/,
    )
    expect(pluginManagerSrc).toMatch(
      /serverless\.com\/framework\/docs\/providers\/aws\/guide\/offline/,
    )
  })
})
