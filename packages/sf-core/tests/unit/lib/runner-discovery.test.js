import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { log } from '@serverless/util'
import { findRunner } from '../../../src/lib/router.js'

const TEMPLATE_YAML = `Resources:
  Bucket:
    Type: AWS::S3::Bucket
`

const TEMPLATE_JSON = JSON.stringify({
  Resources: { Bucket: { Type: 'AWS::S3::Bucket' } },
})

const SAMCONFIG_TOML = `version = 0.1
[default.deploy.parameters]
stack_name = "test-stack"
`

const SAMCONFIG_YAML = `version: 0.1
default:
  deploy:
    parameters:
      stack_name: test-stack
`

const SERVERLESS_YML = `service: test-service
provider:
  name: aws
`

const MJS_HELPER = `export function populate() {
  return 'not a config file'
}
`

const makeDir = async (files = {}) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sf-runner-discovery-'))
  for (const [fileName, content] of Object.entries(files)) {
    await writeFile(path.join(dir, fileName), content)
  }
  return dir
}

const find = async (workingDir) =>
  findRunner({
    logger: log.get('test:runner-discovery'),
    options: {},
    workingDir,
  })

describe('default config file runner discovery', () => {
  describe('CFN runner is selected for SAM-supported file names', () => {
    test.each([
      ['template.yaml', TEMPLATE_YAML],
      ['template.yml', TEMPLATE_YAML],
      ['template.json', TEMPLATE_JSON],
      ['samconfig.toml', SAMCONFIG_TOML],
      ['samconfig.yaml', SAMCONFIG_YAML],
      ['samconfig.yml', SAMCONFIG_YAML],
    ])('%s selects CfnRunner', async (fileName, content) => {
      const dir = await makeDir({ [fileName]: content })
      const result = await find(dir)
      expect(result?.RunnerClass?.name).toBe('CfnRunner')
    })
  })

  describe('files SAM does not support are not treated as templates', () => {
    test.each(['template.mjs', 'template.js', 'template.cjs', 'template.ts'])(
      '%s alone selects no runner',
      async (fileName) => {
        const dir = await makeDir({ [fileName]: MJS_HELPER })
        const result = await find(dir)
        expect(result).toBeFalsy()
      },
    )

    test('samconfig.json alone selects no runner', async () => {
      const dir = await makeDir({ 'samconfig.json': '{"version": 0.1}' })
      const result = await find(dir)
      expect(result).toBeFalsy()
    })

    test('template.html alone selects no runner and does not throw', async () => {
      const dir = await makeDir({ 'template.html': '<html></html>' })
      const result = await find(dir)
      expect(result).toBeFalsy()
    })
  })

  describe('framework config discovery keeps matching every supported extension', () => {
    test.each([
      ['serverless.yml', SERVERLESS_YML],
      ['serverless.yaml', SERVERLESS_YML],
      ['serverless.json', JSON.stringify({ service: 'test-service' })],
      [
        'serverless.mjs',
        "export default { service: 'test-service', provider: { name: 'aws' } }\n",
      ],
    ])('%s selects TraditionalRunner', async (fileName, content) => {
      const dir = await makeDir({ [fileName]: content })
      const result = await find(dir)
      expect(result?.RunnerClass?.name).toBe('TraditionalRunner')
    })

    test('serverless-compose.yml selects ComposeRunner', async () => {
      const dir = await makeDir({
        'serverless-compose.yml': 'services:\n  svc:\n    path: ./svc\n',
      })
      const result = await find(dir)
      expect(result?.RunnerClass?.name).toBe('ComposeRunner')
    })
  })

  describe('framework projects with unrelated template.* files', () => {
    test('serverless.yml wins over a template.mjs helper module', async () => {
      const dir = await makeDir({
        'serverless.yml': SERVERLESS_YML,
        'template.mjs': MJS_HELPER,
      })
      const result = await find(dir)
      expect(result?.RunnerClass?.name).toBe('TraditionalRunner')
      expect(path.basename(result.configFilePath)).toBe('serverless.yml')
    })

    test('serverless.yml wins over a template.html file', async () => {
      const dir = await makeDir({
        'serverless.yml': SERVERLESS_YML,
        'template.html': '<html></html>',
      })
      const result = await find(dir)
      expect(result?.RunnerClass?.name).toBe('TraditionalRunner')
    })

    test('template.yaml still wins over serverless.yml (existing precedence)', async () => {
      const dir = await makeDir({
        'serverless.yml': SERVERLESS_YML,
        'template.yaml': TEMPLATE_YAML,
      })
      const result = await find(dir)
      expect(result?.RunnerClass?.name).toBe('CfnRunner')
    })
  })
})

describe('CfnRunner.readTemplateFile', () => {
  test('throws TEMPLATE_FILE_NOT_FOUND when samconfig has no SAM-supported template next to it', async () => {
    const { CfnRunner } = await import('../../../src/lib/runners/cfn/cfn.js')
    const dir = await mkdtemp(path.join(tmpdir(), 'sf-runner-discovery-'))
    await writeFile(path.join(dir, 'samconfig.toml'), 'version = 0.1\n')
    await writeFile(
      path.join(dir, 'template.mjs'),
      'export function populate() {}\n',
    )
    const runner = new CfnRunner({
      config: { default: { deploy: { parameters: {} } } },
      command: ['deploy'],
      configFilePath: path.join(dir, 'samconfig.toml'),
      options: {},
      versionFramework: '0.0.0',
    })
    await expect(runner.readTemplateFile()).rejects.toMatchObject({
      code: 'TEMPLATE_FILE_NOT_FOUND',
    })
  })
})
