import os from 'os'
import path from 'path'
import { promises as fsp } from 'fs'
import {
  stripExampleReadmeHeader,
  removeExampleRepoFiles,
} from '../../../../../src/lib/runners/core/onboarding-template-cleanup.js'

const frontmatter = [
  '<!--',
  "title: 'Node Express API service backed by DynamoDB on AWS'",
  "description: 'This template demonstrates how to deploy an API.'",
  'layout: Doc',
  'framework: v4',
  'platform: AWS',
  'language: nodeJS',
  'priority: 3',
  "authorLink: 'https://github.com/serverless'",
  "authorName: 'Serverless, Inc.'",
  "authorAvatar: 'https://avatars1.githubusercontent.com/u/13742415?s=200&v=4'",
  '-->',
  '',
].join('\n')

const badge = (slug) =>
  `[![Verified](https://raw.githubusercontent.com/serverless/examples/verified/badges/${slug}.svg)](https://github.com/serverless/examples/blob/verified/results.json)`

const body = [
  '# Serverless Framework Node Express API with DynamoDB on AWS',
  '',
  'This template deploys an Express API.',
  '',
  '## Deploy',
  '',
  '```',
  'serverless deploy',
  '```',
  '',
].join('\n')

const bodyWithBadge = (slug) =>
  [
    '# Serverless Framework Node Express API with DynamoDB on AWS',
    '',
    badge(slug),
    '',
    'This template deploys an Express API.',
    '',
    '## Deploy',
    '',
    '```',
    'serverless deploy',
    '```',
    '',
  ].join('\n')

const name = 'aws-node-express-dynamodb-api'

describe('stripExampleReadmeHeader', () => {
  it('removes the metadata comment and the badge of a standard README', () => {
    const readme = `${frontmatter}\n${bodyWithBadge(name)}`
    expect(stripExampleReadmeHeader(readme, name)).toBe(body)
  })

  it('removes the metadata comment of a README without a badge', () => {
    expect(stripExampleReadmeHeader(`${frontmatter}\n${body}`, name)).toBe(body)
  })

  it('removes the badge of a README without a metadata comment', () => {
    expect(stripExampleReadmeHeader(bodyWithBadge(name), name)).toBe(body)
  })

  it('leaves a README without a metadata comment or badge unchanged', () => {
    expect(stripExampleReadmeHeader(body, name)).toBe(body)
  })

  it('keeps CRLF line endings and a byte order mark', () => {
    const crlf = (text) => text.replace(/\n/g, '\r\n')
    const readme = `\uFEFF${crlf(`${frontmatter}\n${bodyWithBadge(name)}`)}`
    expect(stripExampleReadmeHeader(readme, name)).toBe(`\uFEFF${crlf(body)}`)
  })

  it('removes a badge that directly follows the H1', () => {
    const readme = body.replace(/^(# .*\n)/, (h1) => `${h1}${badge(name)}\n`)
    expect(stripExampleReadmeHeader(readme, name)).toBe(body)
  })

  it('keeps a badge for another example', () => {
    const readme = bodyWithBadge('aws-node-http-api')
    expect(stripExampleReadmeHeader(readme, name)).toBe(readme)
  })

  it('keeps a badge that is not right under the H1', () => {
    const readme = `${body}\n${badge(name)}\n`
    expect(stripExampleReadmeHeader(readme, name)).toBe(readme)
  })

  it('keeps a badge when the README does not start with an H1', () => {
    const readme = `Intro\n\n${bodyWithBadge(name)}`
    expect(stripExampleReadmeHeader(readme, name)).toBe(readme)
  })

  it('uses the nested example slug for the badge', () => {
    const nested = 'aws-node/nested'
    const readme = bodyWithBadge('aws-node__nested')
    expect(stripExampleReadmeHeader(readme, nested)).toBe(body)
  })

  it('keeps a comment at the top that has no title key', () => {
    const readme = `<!--\nNote for maintainers\n-->\n\n${body}`
    expect(stripExampleReadmeHeader(readme, name)).toBe(readme)
  })

  it('keeps a comment that is not at the very top', () => {
    const readme = `${body}\n${frontmatter}`
    expect(stripExampleReadmeHeader(readme, name)).toBe(readme)
  })

  it('keeps an unclosed comment at the top', () => {
    const readme = `<!--\ntitle: 'Unclosed'\n\n${body}`
    expect(stripExampleReadmeHeader(readme, name)).toBe(readme)
  })
})

describe('removeExampleRepoFiles', () => {
  let templateDir

  const write = async (relativePath, content = '') => {
    const filePath = path.join(templateDir, relativePath)
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, content)
  }

  const listFiles = async (dir = templateDir) => {
    const entries = await fsp.readdir(dir, {
      recursive: true,
      withFileTypes: true,
    })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path
          .relative(templateDir, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join('/'),
      )
      .sort()
  }

  beforeEach(async () => {
    templateDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'sf-onboarding-cleanup-'),
    )
  })

  afterEach(async () => {
    await fsp.rm(templateDir, { recursive: true, force: true })
  })

  it('removes example.json, test/, events/ and the README header', async () => {
    await write('README.md', `${frontmatter}\n${bodyWithBadge(name)}`)
    await write('example.json', '{}')
    await write('test/smoke.mjs', 'export default {}')
    await write('events/event.json', '{}')
    await write('handler.js', 'export const handler = () => {}')
    await write('serverless.yml', 'service: my-app\n')
    await write('.gitignore', 'node_modules\n')

    await removeExampleRepoFiles({ templateDir, templateName: name })

    expect(await listFiles()).toEqual([
      '.gitignore',
      'README.md',
      'handler.js',
      'serverless.yml',
    ])
    expect(
      await fsp.readFile(path.join(templateDir, 'README.md'), 'utf8'),
    ).toBe(body)
    expect(
      await fsp.readFile(path.join(templateDir, 'handler.js'), 'utf8'),
    ).toBe('export const handler = () => {}')
  })

  it('leaves a template without repository files unchanged', async () => {
    await write('README.md', body)
    await write('handler.js', 'export const handler = () => {}')
    await write('serverless.yml', 'service: my-app\n')
    const readmePath = path.join(templateDir, 'README.md')
    const { mtimeMs } = await fsp.stat(readmePath)

    await removeExampleRepoFiles({ templateDir, templateName: name })

    expect(await listFiles()).toEqual([
      'README.md',
      'handler.js',
      'serverless.yml',
    ])
    expect(await fsp.readFile(readmePath, 'utf8')).toBe(body)
    expect((await fsp.stat(readmePath)).mtimeMs).toBe(mtimeMs)
  })

  it('works without a README', async () => {
    await write('example.json', '{}')
    await write('serverless.yml', 'service: my-app\n')

    await removeExampleRepoFiles({ templateDir, templateName: name })

    expect(await listFiles()).toEqual(['serverless.yml'])
  })

  it('keeps nested test/ and events/ folders and a test file', async () => {
    await write('README.md', body)
    await write('test', 'not a folder')
    await write('service/test/unit.test.js', '')
    await write('service/events/event.json', '{}')
    await write('service/example.json', '{}')

    await removeExampleRepoFiles({ templateDir, templateName: name })

    expect(await listFiles()).toEqual([
      'README.md',
      'service/events/event.json',
      'service/example.json',
      'service/test/unit.test.js',
      'test',
    ])
  })
})
