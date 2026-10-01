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
  'latest-arm-linux',
  'gh-windows-latest',
]
// Expressions that let a job run after a job it needs failed or was cancelled.
const GATE_OVERRIDES = /always\(\)|cancelled\(\)|failure\(\)/

const needsOf = (job) => [job.needs ?? []].flat()

describe('release workflow gate', () => {
  test('every release job depends, directly or through another job, on all test jobs', async () => {
    const { jobs } = await load('release-framework.yml')
    const testJobs = Object.keys(jobs).filter((id) => id.startsWith('test'))
    const releaseJobs = Object.keys(jobs).filter((id) =>
      id.startsWith('release'),
    )
    expect(testJobs).toEqual(expect.arrayContaining(['test-engine', 'tests']))
    expect(releaseJobs.length).toBeGreaterThan(0)

    const ancestors = (id, seen = new Set()) => {
      for (const dependency of needsOf(jobs[id])) {
        if (!seen.has(dependency)) {
          seen.add(dependency)
          ancestors(dependency, seen)
        }
      }
      return seen
    }
    for (const id of releaseJobs) {
      expect({ id, needs: [...ancestors(id)] }).toEqual({
        id,
        needs: expect.arrayContaining(testJobs),
      })
    }
  })

  test('no job can run past a failed or cancelled test, and tests always run', async () => {
    const { jobs } = await load('release-framework.yml')
    for (const [id, job] of Object.entries(jobs)) {
      expect({ id, if: String(job.if ?? '') }).not.toEqual({
        id,
        if: expect.stringMatching(GATE_OVERRIDES),
      })
      expect({ id, continueOnError: job['continue-on-error'] }).toEqual({
        id,
        continueOnError: undefined,
      })
      if (id.startsWith('test')) {
        expect({ id, if: job.if }).toEqual({ id, if: undefined })
      }
    }
  })

  test('the release tests every platform through the shared workflow', async () => {
    const { jobs } = await load('release-framework.yml')
    expect(jobs.tests.uses).toBe('./.github/workflows/test-framework.yml')
    expect(JSON.parse(jobs.tests.with.platforms)).toEqual(RELEASE_PLATFORMS)
  })
})

describe('shared test workflow', () => {
  test('runs only when another workflow calls it', async () => {
    const workflow = await load('test-framework.yml')
    expect(Object.keys(workflow.on)).toEqual(['workflow_call'])
  })

  test('contains no release steps, roles or secrets', async () => {
    const text = await readFile(workflowPath('test-framework.yml'), 'utf8')
    expect(text).not.toMatch(
      /prepareReleaseTars|npm publish|RELEASES_MONGO_URI|NPM_TOKEN|PublicServerlessRepoAccessRole|contents: write/,
    )
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
