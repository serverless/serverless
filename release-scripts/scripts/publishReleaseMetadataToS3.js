// https://install.serverless.com/versions.json
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: 'us-east-1',
})

const versionsFile = await s3Client.send(
  new GetObjectCommand({
    Bucket: 'install.serverless.com',
    Key: 'versions.json',
  }),
)

// Convert the response body stream to text and parse as JSON
const versionsData = JSON.parse(await versionsFile.Body.transformToString())

console.log(versionsData)

const newSupportedVersion = process.argv[2]

// A repeated release run must not list the version twice
if (versionsData.supportedVersions.includes(newSupportedVersion)) {
  console.log('Version already listed in S3, nothing to change')
  process.exit(0)
}

versionsData.supportedVersions.push(newSupportedVersion)

await s3Client.send(
  new PutObjectCommand({
    Bucket: 'install.serverless.com',
    Key: 'versions.json',
    Body: JSON.stringify(versionsData),
  }),
)

console.log('New supported version added to S3')
