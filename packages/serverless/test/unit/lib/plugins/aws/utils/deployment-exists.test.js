import {
  deploymentDirectoryName,
  deploymentExists,
  hasDeployment,
} from '../../../../../../lib/plugins/aws/utils/deployment-exists.js'

const naming = {
  getCompiledTemplateS3Suffix: () => 'compiled-cloudformation-template.json',
}
const TIMESTAMP = '1790000000000'
const DIRECTORY = `${TIMESTAMP}-${new Date(Number(TIMESTAMP)).toISOString()}`
const response = (file = 'compiled-cloudformation-template.json') => ({
  Contents: [{ Key: `serverless/svc/dev/${DIRECTORY}/${file}` }],
})
const at = (overrides) => ({
  response: response(),
  deploymentPrefix: 'serverless',
  serviceName: 'svc',
  stage: 'dev',
  timestamp: TIMESTAMP,
  naming,
  ...overrides,
})

test('the directory of a deployment, from milliseconds or a date string', () => {
  expect(deploymentDirectoryName(TIMESTAMP)).toBe(DIRECTORY)
  expect(
    deploymentDirectoryName(new Date(Number(TIMESTAMP)).toISOString()),
  ).toBe(DIRECTORY)
  expect(() => deploymentDirectoryName('not a time')).toThrow(RangeError)
})

test('a deployment exists when its compiled template is in its directory', () => {
  expect(deploymentExists(at())).toBe(true)
  expect(deploymentExists(at({ timestamp: '1700000000000' }))).toBe(false)
  expect(deploymentExists(at({ response: response('svc.zip') }))).toBe(false)
  expect(deploymentExists(at({ stage: 'prod' }))).toBe(false)
  expect(deploymentExists(at({ response: {} }))).toBe(false)
})

test('a timestamp that is not a time is not a deployment, and never throws', () => {
  expect(deploymentExists(at({ timestamp: 'not a time' }))).toBe(false)
})

test('hasDeployment matches directory and template file', () => {
  const deployments = [[{ directory: DIRECTORY, file: 'template.json' }]]
  expect(
    hasDeployment({
      deployments,
      directory: DIRECTORY,
      templateSuffix: 'template.json',
    }),
  ).toBe(true)
  expect(
    hasDeployment({
      deployments,
      directory: 'x',
      templateSuffix: 'template.json',
    }),
  ).toBe(false)
})
