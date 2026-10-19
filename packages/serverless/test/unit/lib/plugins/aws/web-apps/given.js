import { ZipArchive } from 'archiver'
import fs from 'node:fs'
import AwsProvider from '../../../../../../lib/plugins/aws/provider.js'

/**
 * An AWS provider whose role, retention and prefix helpers are the real ones,
 * reading `providerConfig` as `serverless.service.provider`.
 *
 * @param {object} [providerConfig]
 * @param {object} [service] - extra `serverless.service` fields
 */
export const givenProvider = (providerConfig = {}, service = {}) => {
  const provider = Object.create(AwsProvider.prototype)
  provider.serverless = {
    service: { service: 'shop', provider: providerConfig, ...service },
  }
  provider.getStage = () => 'dev'
  provider.getRegion = () => 'us-east-1'
  return provider
}

/** The context `ServerlessWebApps#getContext()` returns for `shop`/`dev`. */
export const givenContext = (overrides = {}) => ({
  serviceName: 'shop',
  stage: 'dev',
  region: 'us-east-1',
  serviceDir: '/svc',
  ...overrides,
})

/**
 * Write a zip with the given `{ name: content }` entries.
 *
 * @param {string} zipPath
 * @param {Record<string, string>} files
 */
export const givenZip = async (zipPath, files) => {
  const zip = new ZipArchive()
  const output = fs.createWriteStream(zipPath)
  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    zip.pipe(output)
    for (const [name, content] of Object.entries(files)) {
      zip.append(content, { name, date: new Date(0) })
    }
    zip.finalize().catch(reject)
  })
}
