import { paginateListObjectsV2 } from '@aws-sdk/client-s3'

// Every key under `prefix`, across as many ListObjectsV2 pages as it takes
// (one page holds at most 1,000 keys).
export const listObjectKeys = async (client, bucketName, prefix) => {
  const keys = []
  for await (const page of paginateListObjectsV2(
    { client },
    { Bucket: bucketName, Prefix: prefix },
  )) {
    keys.push(...(page.Contents ?? []).map(({ Key }) => Key))
  }
  return keys
}

// Compose saves a service's state at
// `services/traditional/<stack ARN with "/" replaced by "_">/state/state.json`.
// A state bucket shared by test runs keeps every run's keys, because `remove`
// resets a state file to `{}` instead of deleting it. Listing only the keys of
// the given stacks keeps the result small however large the bucket grows.
export const listStackStateKeys = async ({
  s3Client,
  bucketName,
  accountId,
  region,
  stackNames,
}) => {
  const keysPerStack = await Promise.all(
    stackNames.map((stackName) =>
      listObjectKeys(
        s3Client,
        bucketName,
        `services/traditional/arn:aws:cloudformation:${region}:${accountId}:stack_${stackName}_`,
      ),
    ),
  )
  return keysPerStack.flat()
}
