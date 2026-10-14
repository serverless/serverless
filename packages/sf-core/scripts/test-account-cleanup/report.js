// Lists what the cleanup would delete in the test account the current AWS
// credentials belong to: leftover integration-test stacks, state-bucket keys
// of test stacks that no longer exist, and Dev Mode test resources (suffixed
// broker roles and layers, payload objects under `serverless-dev-mode/` in the
// deployment buckets). It deletes nothing.
//
// The output is public (CI job summaries of a public repository), so it
// prints counts, the names of matched test stacks, which the test fixtures
// already make public, and the names of suffixed Dev Mode test roles and
// layers. It never prints account IDs, bucket names, state keys or the names
// of stacks it keeps.
//
//   node scripts/test-account-cleanup/report.js --regions us-east-1,us-east-2
import { appendFile } from 'fs/promises'
import {
  CloudFormationClient,
  paginateListStacks,
} from '@aws-sdk/client-cloudformation'
import { IAMClient, paginateListRoles } from '@aws-sdk/client-iam'
import { LambdaClient, paginateListLayers } from '@aws-sdk/client-lambda'
import {
  ListObjectVersionsCommand,
  S3Client,
  paginateListBuckets,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  DEV_MODE_PREFIX,
  isAccessDenied,
  isDeploymentBucket,
  stackIdFromStateKey,
  stackIdRegion,
  staleDevModeLayers,
  staleDevModeObjects,
  staleDevModeRoles,
  staleStacks,
  staleStateKeys,
  stateStackStatuses,
} from './rules.js'

const STATE_BUCKET_PARAMETER = '/serverless-framework/state/s3-bucket'
// The test accounts are shared with running test suites; back off on throttling.
const clientConfig = (region) => ({
  region,
  maxAttempts: 10,
  retryMode: 'adaptive',
})

const parseRegions = (argv) => {
  const index = argv.indexOf('--regions')
  const value = index === -1 ? 'us-east-1' : argv[index + 1]
  return value.split(',').filter(Boolean)
}

// What the run is doing, so a failure can say where it stopped. AWS error
// messages are never printed: they can name the account or a bucket.
let step = 'starting'

// Every stack in the region, including those deleted in the last 90 days
// (DELETE_COMPLETE), which CloudFormation still lists with their ids. Each
// region is listed once.
const listings = new Map()
const listStacks = (region) => {
  if (!listings.has(region)) {
    listings.set(
      region,
      (async () => {
        const client = new CloudFormationClient(clientConfig(region))
        const stacks = []
        for await (const page of paginateListStacks({ client }, {})) {
          stacks.push(...(page.StackSummaries ?? []))
        }
        return stacks
      })(),
    )
  }
  return listings.get(region)
}

const reportStateBucket = async (now, log) => {
  step = 'reading the state bucket parameter'
  const ssm = new SSMClient(clientConfig('us-east-1'))
  let bucket
  try {
    const { Parameter } = await ssm.send(
      new GetParameterCommand({ Name: STATE_BUCKET_PARAMETER }),
    )
    bucket = JSON.parse(Parameter.Value)
  } catch (error) {
    if (error.name === 'ParameterNotFound') return { found: false }
    throw error
  }

  step = 'listing the state bucket'
  const s3 = new S3Client(clientConfig(bucket.bucketRegion))
  const objects = []
  for await (const page of paginateListObjectsV2(
    { client: s3 },
    { Bucket: bucket.bucketName, Prefix: 'services/' },
  )) {
    objects.push(...(page.Contents ?? []))
  }

  // The keys belong to stacks in any region, so list each region they name.
  const regions = new Set()
  for (const { Key } of objects) {
    const id = stackIdFromStateKey(Key)
    if (id) regions.add(stackIdRegion(id))
  }
  const stacksByRegion = new Map()
  for (const region of [...regions].sort()) {
    step = `listing stacks in ${region}`
    log(`Listing stacks in ${region} for the state bucket`)
    stacksByRegion.set(region, await listStacks(region))
  }
  const statusById = stateStackStatuses(objects, stacksByRegion)
  log(`State bucket: ${objects.length} keys`)
  const stale = staleStateKeys(objects, statusById, now)
  return { found: true, total: objects.length, stale: stale.length }
}

// Dev Mode test leftovers: suffixed broker roles (IAM is global), suffixed layers in each region,
// and payload objects under the Dev Mode prefix of each region's deployment buckets. Step names
// never include a bucket name: they are printed on failure. A listing the role may not make
// leaves its part null and adds a warning; any other error still fails the run.
const reportDevMode = async (regions, now, log) => {
  const warnings = []
  const listed = async (what, list) => {
    try {
      return await list()
    } catch (error) {
      if (!isAccessDenied(error)) throw error
      warnings.push(`could not list ${what} (${error.name}): not checked`)
      return null
    }
  }

  step = 'listing IAM roles'
  log('Listing IAM roles for Dev Mode test leftovers')
  const iam = new IAMClient(clientConfig('us-east-1'))
  const roles = await listed('IAM roles (iam:ListRoles)', async () => {
    const all = []
    for await (const page of paginateListRoles({ client: iam }, {})) {
      all.push(...(page.Roles ?? []))
    }
    return all
  })

  step = 'listing S3 buckets'
  const buckets = await listed('S3 buckets (s3:ListAllMyBuckets)', async () => {
    const all = []
    for await (const page of paginateListBuckets(
      { client: new S3Client(clientConfig('us-east-1')) },
      {},
    )) {
      all.push(...(page.Buckets ?? []).map(({ Name }) => Name))
    }
    return all
  })

  const byRegion = []
  for (const region of regions) {
    step = `listing Lambda layers in ${region}`
    log(`Listing Lambda layers in ${region}`)
    const lambda = new LambdaClient(clientConfig(region))
    const layers = await listed(
      `Lambda layers in ${region} (lambda:ListLayers)`,
      async () => {
        const all = []
        for await (const page of paginateListLayers({ client: lambda }, {})) {
          all.push(...(page.Layers ?? []))
        }
        return all
      },
    )

    step = `listing Dev Mode objects in the deployment buckets of ${region}`
    const s3 = new S3Client(clientConfig(region))
    const entries =
      buckets &&
      (await listed(
        `Dev Mode objects in ${region} (s3:ListBucketVersions)`,
        async () => {
          const all = []
          for (const Bucket of buckets.filter((name) =>
            isDeploymentBucket(name, region),
          )) {
            let KeyMarker
            let VersionIdMarker
            for (;;) {
              const page = await s3.send(
                new ListObjectVersionsCommand({
                  Bucket,
                  Prefix: DEV_MODE_PREFIX,
                  KeyMarker,
                  VersionIdMarker,
                }),
              )
              all.push(...(page.Versions ?? []), ...(page.DeleteMarkers ?? []))
              if (!page.IsTruncated) break
              KeyMarker = page.NextKeyMarker
              VersionIdMarker = page.NextVersionIdMarker
            }
          }
          return all
        },
      ))
    byRegion.push({
      region,
      layers: layers && staleDevModeLayers(layers, now),
      objects: entries && staleDevModeObjects(entries, now),
    })
  }
  return {
    roles: roles && staleDevModeRoles(roles, now),
    byRegion,
    warnings,
  }
}

const main = async () => {
  const now = new Date()
  const regions = parseRegions(process.argv)
  const log = (line) => console.error(line)
  const summary = ['## Test account cleanup (dry run: nothing is deleted)', '']

  for (const region of regions) {
    step = `listing stacks in ${region}`
    log(`Listing stacks in ${region}`)
    const stacks = (await listStacks(region)).filter(
      ({ StackStatus }) => StackStatus !== 'DELETE_COMPLETE',
    )
    const stale = staleStacks(stacks, now)
    summary.push(
      `### ${region}`,
      '',
      `- ${stacks.length} stacks, ${stale.length} leftover test stacks would be deleted, ${stacks.length - stale.length} kept`,
    )
    if (stale.length) {
      summary.push('', '<details><summary>Leftover test stacks</summary>', '')
      for (const { StackName, StackStatus } of stale.sort((a, b) =>
        a.StackName.localeCompare(b.StackName),
      )) {
        summary.push(`- \`${StackName}\` (${StackStatus})`)
      }
      summary.push('', '</details>')
    }
    summary.push('')
  }

  const state = await reportStateBucket(now, log)
  summary.push(
    '### Default state bucket',
    '',
    state.found
      ? `- ${state.total} keys, ${state.stale} keys of test stacks that no longer exist would be deleted`
      : '- None in this account',
    '',
  )

  const devMode = await reportDevMode(regions, now, log)
  summary.push('### Dev Mode test leftovers', '')
  for (const warning of devMode.warnings) summary.push(`- Warning: ${warning}`)
  if (devMode.roles) {
    summary.push(
      `- ${devMode.roles.length} broker roles of Dev Mode tests would be deleted`,
    )
  }
  if (devMode.roles?.length) {
    summary.push('', '<details><summary>Broker roles</summary>', '')
    for (const name of devMode.roles.map(({ RoleName }) => RoleName).sort()) {
      summary.push(`- \`${name}\``)
    }
    summary.push('', '</details>', '')
  }
  for (const { region, layers, objects } of devMode.byRegion) {
    const counts = [
      layers && `${layers.length} test layers`,
      objects &&
        `${objects.count} objects under \`serverless-dev-mode/\` in deployment buckets`,
    ].filter(Boolean)
    if (counts.length) {
      summary.push(`- ${region}: ${counts.join(', and ')} would be deleted`)
    }
    const names = [
      ...(layers ?? []).map(({ LayerName }) => `layer \`${LayerName}\``),
      ...(objects?.testStages ?? []).map((name) => `objects of \`${name}\``),
    ].sort()
    if (names.length) {
      summary.push('', `<details><summary>${region}</summary>`, '')
      for (const name of names) summary.push(`  - ${name}`)
      summary.push('', '</details>', '')
    }
  }
  summary.push('')

  const text = summary.join('\n')
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
}

try {
  await main()
} catch (error) {
  console.error(
    `Cleanup report failed while ${step}: ${error?.name ?? 'Error'}`,
  )
  process.exitCode = 1
}
