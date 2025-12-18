import { Octokit } from '@octokit/rest'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

/**
 * Fetches the latest version of the Axiom Lambda layer.
 *
 * @returns {Promise<number>} - A promise that resolves to the latest layer version number.
 * @throws {Error} - Throws an error if the layer version format is not recognized.
 */
export const fetchLatestLayerVersion = async () => {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  })
  const response = await (async () => {
    try {
      return await octokit.repos.getLatestRelease({
        owner: 'axiomhq',
        repo: 'axiom-lambda-extension',
      })
    } catch (err) {
      if (err.message.includes('Bad credentials')) {
        throw new ServerlessError(
          'Invalid GitHub token provided. Please check the GITHUB_TOKEN environment variable. Original error from GitHub: ' +
            err.message,
          ServerlessErrorCodes.axiom.AXIOM_GITHUB_TOKEN_INVALID,
        )
      }
      throw err
    }
  })()
  const tagName = response.data.tag_name
  const versionMatch = tagName.match(/v(\d+)/)
  if (versionMatch?.[1]) {
    return parseInt(versionMatch[1], 10)
  } else {
    throw new Error(`Layer version format not recognized: ${tagName}`)
  }
}

/**
 * Gets the ARN for the Axiom Lambda layer based on the region and architecture.
 *
 * @param {{ region: string, arch: string }} params - The parameters for fetching the layer ARN.
 * @param {string} params.region - The AWS region.
 * @param {string} params.arch - The architecture type.
 * @param {number} params.version - The version of the layer.
 * @returns {Promise<string>} - A promise that resolves to the layer ARN string.
 */
export const getLayerArn = async ({ region, arch, version }) => {
  return `arn:aws:lambda:${region}:694952825951:layer:axiom-extension-${arch}:${version}`
}
