import path from 'path'
import { promises as fsp } from 'fs'

/**
 * Files and folders that serve the serverless/examples repository (its
 * catalogue and its live tests) and are not part of a new project.
 */
const EXAMPLE_REPO_FILES = ['example.json']
const EXAMPLE_REPO_DIRS = ['test', 'events']

const lineContent = (line) => line.replace(/\r?\n$/, '')
const isBlank = (line) => line !== undefined && lineContent(line).trim() === ''

/**
 * The "Verified" badge line that serverless/examples writes under a README's
 * H1. The slug is the example's directory with "/" replaced by "__".
 * @param {string} templateName - The example's directory in serverless/examples
 * @returns {string}
 */
const verifiedBadgeLine = (templateName) => {
  const slug = templateName.split('/').join('__')
  return `[![Verified](https://raw.githubusercontent.com/serverless/examples/verified/badges/${slug}.svg)](https://github.com/serverless/examples/blob/verified/results.json)`
}

/**
 * Remove the serverless/examples header from a README: the metadata comment
 * at the very top (`<!--` ... `title:` ... `-->`) and the "Verified" badge
 * line right under the H1. Everything else is returned unchanged.
 * @param {string} content - README content
 * @param {string} templateName - The example's directory in serverless/examples
 * @returns {string}
 */
export const stripExampleReadmeHeader = (content, templateName) => {
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : ''
  const lines = content.slice(bom.length).split(/(?<=\n)/)

  // Metadata comment: must open on the first line and carry a "title:" key
  if (lines.length && lineContent(lines[0]).trim() === '<!--') {
    const end = lines.findIndex((line) => lineContent(line).trim() === '-->')
    const hasTitle =
      end > 0 && lines.slice(1, end).some((line) => /^\s*title\s*:/.test(line))
    if (hasTitle) {
      let next = end + 1
      while (isBlank(lines[next])) next += 1
      lines.splice(0, next)
    }
  }

  // Badge: the first non-blank line after the H1, which must be the first
  // non-blank line of the README
  const h1 = lines.findIndex((line) => !isBlank(line))
  if (h1 !== -1 && /^# /.test(lines[h1])) {
    let badge = h1 + 1
    while (isBlank(lines[badge])) badge += 1
    if (
      lines[badge] !== undefined &&
      lineContent(lines[badge]).trim() === verifiedBadgeLine(templateName)
    ) {
      // Keep a single blank line between the H1 and the text that follows
      const removeCount =
        isBlank(lines[badge - 1]) && isBlank(lines[badge + 1]) ? 2 : 1
      lines.splice(badge, removeCount)
    }
  }

  return bom + lines.join('')
}

/**
 * Remove the files a serverless/examples template carries only for that
 * repository: `example.json`, the `test/` and `events/` folders, and the
 * README's metadata comment and "Verified" badge. A template without them
 * is left as it is.
 * @param {object} params
 * @param {string} params.templateDir - The new project's directory
 * @param {string} params.templateName - The example's directory in serverless/examples
 */
export const removeExampleRepoFiles = async ({ templateDir, templateName }) => {
  for (const name of EXAMPLE_REPO_FILES) {
    const filePath = path.join(templateDir, name)
    const stats = await fsp.lstat(filePath).catch(() => null)
    if (stats?.isFile()) await fsp.rm(filePath)
  }
  for (const name of EXAMPLE_REPO_DIRS) {
    const dirPath = path.join(templateDir, name)
    const stats = await fsp.lstat(dirPath).catch(() => null)
    if (stats?.isDirectory()) await fsp.rm(dirPath, { recursive: true })
  }

  const readmePath = path.join(templateDir, 'README.md')
  const readme = await fsp.readFile(readmePath, 'utf8').catch(() => null)
  if (readme === null) return
  const cleaned = stripExampleReadmeHeader(readme, templateName)
  if (cleaned !== readme) await fsp.writeFile(readmePath, cleaned)
}
