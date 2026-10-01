import { readFile } from 'fs/promises'
import path from 'path'
import url from 'url'
import yaml from 'js-yaml'

// The release publishes to users within minutes of a push to main, so these
// tests keep two promises: nothing releases unless every test passed, and the
// shared test workflow can never publish anything itself.
const repoRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../../../..',
)
const workflowPath = (name) => path.join(repoRoot, '.github/workflows', name)
const load = async (name) =>
  yaml.load(await readFile(workflowPath(name), 'utf8'))

const RELEASE_PLATFORMS = [
  'ubuntu-latest',
  'ubuntu-24.04-arm',
  'windows-latest',
]

const needsOf = (job) => [job.needs ?? []].flat()
// Text that belongs only to the release jobs in release-framework.yml.
const RELEASE_ONLY =
  /prepareReleaseTars|npm publish|RELEASES_MONGO_URI|NPM_TOKEN|PublicServerlessRepoAccessRole|contents: write|write-all/

const TEST_SECRETS = ['SERVERLESS_ACCESS_KEY_DEV', 'SERVERLESS_LICENSE_KEY_DEV']
const SHARED_PERMISSIONS = { 'id-token': 'write', contents: 'read' }
// The only status-free conditions release jobs may carry. A condition with no
// status function implies success(), so these still require every job they
// need to have passed.
const ALLOWED_RELEASE_IFS = {
  'release-stable': 'needs.release-canary.outputs.new_version',
}

const ancestorsOf = (jobs, id, seen = new Set()) => {
  for (const dependency of needsOf(jobs[id])) {
    if (!seen.has(dependency)) {
      seen.add(dependency)
      ancestorsOf(jobs, dependency, seen)
    }
  }
  return seen
}

describe('release workflow gate', () => {
  test('runs only on a push to main or a manual dispatch', async () => {
    const workflow = await load('release-framework.yml')
    expect(Object.keys(workflow.on).sort()).toEqual([
      'push',
      'workflow_dispatch',
    ])
    expect(workflow.on.workflow_dispatch).toBeNull()
    expect(Object.keys(workflow.on.push).sort()).toEqual(['branches', 'paths'])
    expect(workflow.on.push.branches).toEqual(['main'])
  })

  test('every job that is not a test job depends on all test jobs', async () => {
    const { jobs } = await load('release-framework.yml')
    const testJobs = Object.keys(jobs).filter((id) => id.startsWith('test'))
    const otherJobs = Object.keys(jobs).filter((id) => !id.startsWith('test'))
    expect(testJobs.sort()).toEqual(['test-engine', 'tests'])
    expect(otherJobs.length).toBeGreaterThan(0)
    for (const id of otherJobs) {
      expect({ id, needs: [...ancestorsOf(jobs, id)] }).toEqual({
        id,
        needs: expect.arrayContaining(testJobs),
      })
    }
  })

  // Checked per job, not per step: a job's steps run only once the job starts,
  // and a release job starts only after every job it needs passed. Steps may
  // tolerate their own failures (tagging does), which can't skip a test.
  test('no job can run past a failed or cancelled test, and tests always run', async () => {
    const { jobs } = await load('release-framework.yml')
    for (const [id, job] of Object.entries(jobs)) {
      expect({ id, if: job.if }).toEqual({ id, if: ALLOWED_RELEASE_IFS[id] })
      expect({ id, continueOnError: job['continue-on-error'] }).toEqual({
        id,
        continueOnError: undefined,
      })
    }
  })

  test('the release tests every platform, on the default AWS SDK path, through the shared workflow', async () => {
    const { jobs } = await load('release-framework.yml')
    expect(jobs.tests.uses).toBe('./.github/workflows/test-framework.yml')
    expect(JSON.parse(jobs.tests.with.platforms)).toEqual(RELEASE_PLATFORMS)
    expect(jobs.tests.with['aws-sdk'] ?? '').toBe('')
    expect(jobs.tests.permissions).toEqual(SHARED_PERMISSIONS)
    expect(Object.keys(jobs.tests.secrets).sort()).toEqual(TEST_SECRETS)
  })
})

describe('pull request CI', () => {
  test('contains no release steps and can only read the repository', async () => {
    const workflow = await load('ci-framework.yml')
    const text = await readFile(workflowPath('ci-framework.yml'), 'utf8')
    expect(text).not.toMatch(RELEASE_ONLY)
    expect(workflow.permissions).toEqual(SHARED_PERMISSIONS)
    expect(workflow.jobs.tests.uses).toBe(
      './.github/workflows/test-framework.yml',
    )
    expect(Object.keys(workflow.jobs.tests.secrets).sort()).toEqual(
      TEST_SECRETS,
    )
  })
})

describe('shared test workflow', () => {
  test('runs only when another workflow calls it, and takes only the test secrets', async () => {
    const workflow = await load('test-framework.yml')
    expect(Object.keys(workflow.on)).toEqual(['workflow_call'])
    expect(Object.keys(workflow.on.workflow_call.secrets).sort()).toEqual(
      TEST_SECRETS,
    )
  })

  test('contains no release steps, roles or secrets, and can only read the repository', async () => {
    const workflow = await load('test-framework.yml')
    const text = await readFile(workflowPath('test-framework.yml'), 'utf8')
    expect(text).not.toMatch(RELEASE_ONLY)
    expect(workflow.permissions).toEqual(SHARED_PERMISSIONS)
    for (const [id, job] of Object.entries(workflow.jobs)) {
      expect({ id, permissions: job.permissions }).toEqual({
        id,
        permissions: undefined,
      })
    }
  })

  test('every job runs on every platform it is given', async () => {
    const { jobs } = await load('test-framework.yml')
    for (const [id, job] of Object.entries(jobs)) {
      expect({
        id,
        platform: job.strategy.matrix.platform,
        runsOn: job['runs-on'],
        exclude: job.strategy.matrix.exclude,
      }).toEqual({
        id,
        platform: '${{ fromJSON(inputs.platforms) }}',
        runsOn: '${{ matrix.platform }}',
        exclude: undefined,
      })
    }
  })

  test('no test job or step can be skipped or soft-fail', async () => {
    const { jobs } = await load('test-framework.yml')
    for (const [id, job] of Object.entries(jobs)) {
      expect({
        id,
        if: job.if,
        continueOnError: job['continue-on-error'],
      }).toEqual({ id, if: undefined, continueOnError: undefined })
      for (const step of job.steps) {
        expect({
          id,
          step: step.name,
          continueOnError: step['continue-on-error'],
        }).toEqual({ id, step: step.name, continueOnError: undefined })
      }
    }
  })
})
