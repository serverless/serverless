import path from 'path'
import os from 'os'
import { URL } from 'url'
import qs from 'querystring'
import { promises as fsp } from 'fs'
import { promisify } from 'util'
import { exec } from 'child_process'
import {
  dirExists,
  copyDirContents,
  removeFileOrDirectory,
  unzipFile,
} from '../fs/index.js'

const execAsync = promisify(exec)

/**
 * Returns directory path
 * @param length - The length of the path
 * @param parts - The parts of the path
 * @returns The directory path
 */
const getPathDirectory = (length, parts) => {
  if (!parts) {
    return ''
  }
  return parts.slice(length).filter(Boolean).join(path.sep)
}

/**
 * Validates URL
 * @param url - URL object
 * @param hostname - Hostname to validate against
 * @param service - Service name for error message
 * @param owner - Repository owner
 * @param repo - Repository name
 */
const validateUrl = ({ url, hostname, service, owner, repo }) => {
  if (url.hostname !== hostname || !owner || !repo) {
    const errorMessage = `The URL must be a valid ${service} URL in the following format: https://${hostname}/owner/repo`
    throw new Error(errorMessage)
  }
}

/**
 * Check if the URL is pointing to a Git repository
 * @param url - The URL to check
 * @returns Boolean indicating if the URL is a plain Git URL
 */
const isPlainGitURL = (url) => {
  return (
    (url.startsWith('https') || url.startsWith('git@')) && url.endsWith('.git')
  )
}

/**
 * Function to safely extract a string value from the query object
 * @param url - URL object
 * @param param - The query parameter to extract
 * @returns The string value of the query parameter
 */
const getStringQueryParam = (url, param) => {
  // Native URL object uses .search (with leading ?) not .query
  const queryString = url.search ? url.search.slice(1) : ''
  const query = qs.parse(queryString)
  const value = query[param]
  // Check if the value is an array and return the first element if so.
  // Otherwise, return the value directly.
  return Array.isArray(value) ? value[0] : value
}

/**
 * Parses a GitHub URL and returns repository information
 * @param url - Instance of URL class
 * @returns Parsed repository information
 */
const parseGitHubURL = (url) => {
  // Splitting the pathname to get the repository details
  const parts = url.pathname.split('/')
  const pathLength = 4
  const isSubdirectory = parts.length > pathLength
  const owner = parts[1]
  const repo = parts[2]
  const branch = isSubdirectory ? parts[pathLength] : 'master'
  const isGitHubEnterprise = url.hostname !== 'github.com'

  // Validating GitHub URL if it's not a GitHub Enterprise URL
  if (!isGitHubEnterprise) {
    validateUrl({ url, hostname: 'github.com', service: 'GitHub', owner, repo })
  }

  // Constructing the download URL
  const downloadUrl = `https://${isGitHubEnterprise ? url.hostname : 'github.com'}/${owner}/${repo}/archive/${branch}.zip`

  // Returning parsed repository information
  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    username: url.username || '',
    password: url.password || '',
  }
}

/**
 * Parse Bitbucket URL
 * @param url - URL object
 * @returns Parsed repository information
 */
const parseBitbucketURL = (url) => {
  const pathLength = 4
  const parts = url.pathname.split('/')
  const isSubdirectory = parts.length > pathLength
  const owner = parts[1]
  const repo = parts[2]

  // Native URL object uses .search (with leading ?) not .query
  const queryString = url.search ? url.search.slice(1) : ''
  const query = qs.parse(queryString)
  // Use the helper function to safely extract the 'at' parameter
  const branch =
    'at' in query
      ? decodeURIComponent(getStringQueryParam(url, 'at'))
      : 'master'

  // validate if given url is a valid Bitbucket url
  validateUrl({
    url,
    hostname: 'bitbucket.org',
    service: 'Bitbucket',
    owner,
    repo,
  })

  const downloadUrl = `https://bitbucket.org/${owner}/${repo}/get/${branch}.zip`

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    username: url.username || '',
    password: url.password || '',
  }
}

/**
 * Parse Bitbucket server URL
 * @param url
 * @returns
 */
const parseBitbucketServerURL = (url) => {
  const pathLength = 9
  const parts = url.pathname.split('/')
  const isSubdirectory = parts.length > pathLength
  const owner = parts[5]
  const repo = parts[7]

  // Native URL object uses .search (with leading ?) not .query
  const queryString = url.search ? url.search.slice(1) : ''
  const query = qs.parse(queryString)
  // Use the helper function to safely extract the 'at' parameter
  const branch =
    'at' in query
      ? decodeURIComponent(getStringQueryParam(url, 'at'))
      : 'master'

  const downloadUrl = `${url.protocol}//${url.hostname}/rest/api/latest/projects/${owner}/repos/${repo}/archive${url.search}&format=zip`

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    username: url.username || '',
    password: url.password || '',
  }
}

/**
 * Retrieve Bitbucket server info
 * @param url - URL object
 * @returns A Promise resolving to a boolean
 */
const retrieveBitbucketServerInfo = async (url) => {
  const versionInfoPath = `${url.protocol}//${url.hostname}/rest/api/1.0/application-properties`
  const resp = await fetch(versionInfoPath)
  const body = await resp.json()
  return body.displayName === 'Bitbucket'
}

/**
 * Parse GitLab URL
 * @param url
 * @returns
 */
const parseGitlabURL = (url) => {
  const pathLength = 4
  const parts = url.pathname.split('/')
  const isSubdirectory = parts.length > pathLength
  const owner = parts[1]
  const repo = parts[2]

  const branch = isSubdirectory ? parts[pathLength] : 'master'

  // validate if given url is a valid GitLab url
  validateUrl({
    url,
    hostname: 'gitlab.com',
    service: 'Bitbucket',
    owner,
    repo,
  })

  const downloadUrl = `https://gitlab.com/${owner}/${repo}/-/archive/${branch}/${repo}-${branch}.zip`

  return {
    owner,
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    pathToDirectory: getPathDirectory(pathLength + 1, parts),
    username: url.username || '',
    password: url.password || '',
  }
}

/**
 * Parse plain Git URL
 * @param url
 * @returns
 */
const parsePlainGitURL = (url) => {
  const branch = 'master'
  const downloadUrl = url
  const isSubdirectory = false
  // Handle both HTTPS URLs (with /) and SSH URLs (with : before repo path)
  // Examples:
  //   https://example.com/team/my-template.git -> my-template
  //   git@bitbucket.org:team/my-template.git -> my-template
  const match = url.match(/.+[/:]([^/]+)\.git$/)
  const repo = match ? match[1] : url
  return {
    repo,
    branch,
    downloadUrl,
    isSubdirectory,
    username: '',
    password: '',
  }
}

/**
 * Parse URL
 * @param inputUrl
 * @returns
 */
const parseUrl = (inputUrl) => {
  // Ensure the input URL does not end with a slash
  const sanitizedUrl = inputUrl.replace(/\/$/, '')

  try {
    // Create a new URL object
    const url = new URL(sanitizedUrl)
    return url
  } catch (error) {
    // Handle any errors that might occur during URL parsing
    console.error('Invalid URL:', error.message)
    return null
  }
}

/**
 * Parse repository URL
 * @param inputUrl - The input URL
 * @returns A Promise
 */
export const parseRepoURL = async (inputUrl) => {
  if (!inputUrl) {
    return new Error('URL is required')
  }

  // Handle plain Git URLs (including SSH URLs like git@...)
  // These need special handling before URL parsing since they're not valid URLs
  if (isPlainGitURL(inputUrl)) {
    return parsePlainGitURL(inputUrl)
  }

  const url = parseUrl(inputUrl.replace(/\/$/, ''))

  // check if url parameter is a valid url
  if (!url || !url.host) {
    return new Error('The URL you passed is not valid')
  }

  if (url.auth) {
    const [username, password] = url.auth.split(':')
    url.username = username
    url.password = password
  }

  if (url.hostname === 'github.com' || url.hostname.includes('github.')) {
    return parseGitHubURL(url)
  } else if (url.hostname === 'bitbucket.org') {
    return parseBitbucketURL(url)
  } else if (url.hostname === 'gitlab.com') {
    return parseGitlabURL(url)
  }

  // Check if it's a private Bitbucket server
  const msg =
    'The URL you passed is not one of the valid providers: "GitHub", "GitHub Entreprise", "Bitbucket", "Bitbucket Server" or "GitLab".'
  const err = new Error(msg)
  const isBitbucket = await retrieveBitbucketServerInfo(url)
  if (!isBitbucket) {
    throw err
  }

  // build download URL
  let parsedBitbucketServerURL
  try {
    parsedBitbucketServerURL = parseBitbucketServerURL(url)
  } catch (error) {
    throw err
  }
  return parsedBitbucketServerURL
}

/**
 * Clone a git repository to a specified path
 * @param gitUrl - The git URL to clone
 * @param targetPath - The path to clone to
 * @returns A Promise that resolves when clone is complete
 */
const cloneGitRepo = async (gitUrl, targetPath) => {
  await execAsync(`git clone "${gitUrl}" "${targetPath}"`)
}

/**
 * Download template from repository
 * @param inputUrl - The URL of the template
 * @param newTemplateName - A custom name to be used for the Service
 * @param downloadPath - The path to download the template
 * @returns A Promise
 */
export const downloadTemplate = async (inputUrl, newTemplateName) => {
  // Parse the repository URL
  const repoInformation = await parseRepoURL(inputUrl)
  const { username, password } = repoInformation

  let subdirectory
  if (repoInformation.isSubdirectory) {
    subdirectory = repoInformation.pathToDirectory.split('/').splice(-1)[0]
  }

  const existingServiceName = subdirectory || repoInformation.repo
  const tmpDownloadPath = path.join(os.tmpdir(), repoInformation.repo)
  const newServicePath = path.join(
    process.cwd(),
    newTemplateName || existingServiceName,
  )

  // Check if a folder with the same name already exists
  if (await dirExists(newServicePath)) {
    const errorMessage = `A folder named "${newServicePath}" already exists.`
    throw new Error(errorMessage)
  }

  // Handle plain Git URLs (e.g., git@bitbucket.org:... or https://...*.git)
  // These require git clone instead of HTTP download
  if (isPlainGitURL(inputUrl)) {
    await cloneGitRepo(inputUrl, newServicePath)

    // Remove the .git folder to disassociate from the template repository
    await removeFileOrDirectory(path.join(newServicePath, '.git'))

    // Remove serverless.template.yml if it exists
    await removeFileOrDirectory(
      path.join(newServicePath, 'serverless.template.yml'),
    )

    return newServicePath
  }

  // Download repo contents via HTTP for non-git URLs
  const downloadOptions = {
    timeout: 30000,
    extract: true,
    strip: 1,
    username,
    password,
  }
  let downloadedDataPath = await downloadDataFromUri(
    repoInformation.downloadUrl,
    tmpDownloadPath,
    downloadOptions,
  )

  // Check if the downloaded file is a zip file
  if (downloadedDataPath.endsWith('.zip')) {
    const unzipPath = path.join(
      tmpDownloadPath,
      path.basename(repoInformation.downloadUrl, '.zip'),
    )
    // Get the extracted contents and point to the path variable to it
    downloadedDataPath = await unzipFile(downloadedDataPath, unzipPath)
  }

  const directory = path.join(
    downloadedDataPath,
    repoInformation.pathToDirectory,
  )
  await copyDirContents(directory, newServicePath)

  // Remove the temporary directory
  await removeFileOrDirectory(tmpDownloadPath)

  // Remove serverless.template.yml if it exists
  await removeFileOrDirectory(
    path.join(newServicePath, 'serverless.template.yml'),
  )

  return newServicePath
}

/**
 * Helper function to get the filename from a URL path
 */
const filenameFromPath = (res) => path.basename(new URL(res.url).pathname)

/**
 * Helper function to get the file extension from MIME type
 * @param res
 * @returns
 */
const getExtFromMime = (res) => {
  const header = res.headers.get('content-type')
  return header ? header.split('/')[1] : null
}

/**
 * Function to determine the filename from the response
 * @param res
 * @param data
 * @returns
 */
const getFilename = async (res, data) => {
  const contentDisposition = res.headers.get('content-disposition')

  if (contentDisposition) {
    const matches = contentDisposition.match(/filename="(.+)"/)
    if (matches?.[1]) {
      return matches[1]
    }
  }

  let filename = filenameFromPath(res)
  if (!path.extname(filename)) {
    const ext = getExtFromMime(res)
    if (ext) {
      filename = `${filename}.${ext}`
    }
  }

  return filename
}

/**
 * Main function to download and optionally save the file
 * @param uri
 * @param output
 * @param opts
 * @returns
 */
const downloadDataFromUri = async (uri, output, opts) => {
  const res = await fetch(uri, opts)
  const arrayBuffer = await res.arrayBuffer()
  const data = Buffer.from(arrayBuffer)

  const downloadedDataPath = path.join(output, await getFilename(res, data))
  await fsp.mkdir(path.dirname(downloadedDataPath), { recursive: true })
  await fsp.writeFile(downloadedDataPath, data)

  return downloadedDataPath
}

export default {
  downloadTemplate,
  parseRepoURL,
}
