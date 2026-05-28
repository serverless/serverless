import ServerlessError from '../../../../../serverless-error.js'
import { runtimeToImage as javaRuntimeToImage } from './java-image.js'

/**
 * @param {string | undefined | null} runtime
 * @param {string | undefined | null} artifactPath
 * @returns {boolean}
 */
export function isDockerSupportedRuntime(runtime, artifactPath = null) {
  const rt = String(runtime ?? '')
  if (/^nodejs\d+\.x$/.test(rt)) return true
  if (/^python\d+\.\d+$/.test(rt)) return true
  if (/^ruby\d+\.\d+$/.test(rt)) return true
  if (/^java\d+(\.al2)?$/.test(rt)) return true
  if (/^provided\.(al2|al2023)$/.test(rt)) return true
  return Boolean(
    artifactPath?.endsWith('.jar') && /^provided\.(al2|al2023)$/.test(rt),
  )
}

/**
 * @param {string | undefined | null} runtime
 * @param {string | undefined | null} artifactPath
 * @returns {string}
 */
export function runtimeToDockerImage(runtime, artifactPath = null) {
  const rt = String(runtime ?? '')
  if (/^java\d+(\.al2)?$/.test(rt)) return javaRuntimeToImage(rt)

  if (artifactPath?.endsWith('.jar') && /^provided\.(al2|al2023)$/.test(rt)) {
    return javaRuntimeToImage(rt)
  }

  const nodeMatch = rt.match(/^nodejs(\d+)\.x$/)
  if (nodeMatch) return `public.ecr.aws/lambda/nodejs:${nodeMatch[1]}`

  const pythonMatch = rt.match(/^python(\d+\.\d+)$/)
  if (pythonMatch) return `public.ecr.aws/lambda/python:${pythonMatch[1]}`

  const rubyMatch = rt.match(/^ruby(\d+\.\d+)$/)
  if (rubyMatch) return `public.ecr.aws/lambda/ruby:${rubyMatch[1]}`

  if (rt === 'provided.al2') return 'public.ecr.aws/lambda/provided:al2'
  if (rt === 'provided.al2023') return 'public.ecr.aws/lambda/provided:al2023'

  throw new ServerlessError(
    `Runtime "${runtime}" is not supported by the Docker offline runner. ` +
      'Supported Docker runtimes are Node.js, Python, Ruby, Java, provided.al2, and provided.al2023.',
    'OFFLINE_DOCKER_RUNTIME_UNSUPPORTED',
  )
}

/**
 * @param {string | undefined | null} architecture
 * @returns {'linux/amd64' | 'linux/arm64'}
 */
export function architectureToDockerPlatform(architecture) {
  return architecture === 'arm64' ? 'linux/arm64' : 'linux/amd64'
}

/**
 * @param {string | undefined | null} architecture
 * @returns {'amd64' | 'arm64'}
 */
export function architectureToGoArch(architecture) {
  return architecture === 'arm64' ? 'arm64' : 'amd64'
}
