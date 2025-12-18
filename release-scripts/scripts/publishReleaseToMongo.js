import { MongoClient, ServerApiVersion } from 'mongodb'

// type ReleaseRecord = {
//   version: string;
//   installable: boolean;
//   releaseDate: string;
//   s3Key: string;
//   s3Bucket: string;
//   downloadUrl: string;
// };

// type FrameworkReleaseMetadata = {
//   metadataVersion: string;
//   blockedVersions: string[];
//   supportedVersions: string[];
// };

const mongoUri = process.env.RELEASES_MONGO_URI

if (mongoUri === undefined || mongoUri === '') {
  throw new Error('Missing required environment variable: RELEASES_MONGO_URI')
}

const mongo = new MongoClient(mongoUri, {
  serverApi: { strict: false, version: ServerApiVersion.v1 },
})

await mongo.connect()

const releaseMetadataCollection = mongo.db('db').collection('release-metadata')
const releaseCollection = mongo.db('db').collection('releases')

const metadata = await releaseMetadataCollection.findOne({
  metadataVersion: '1',
})

if (metadata === null) {
  throw new Error('Release metadata not found')
}

const version = process.argv[2]
await releaseCollection.insertOne({
  version,
  installable: true,
  releaseDate: new Date().toISOString(),
  s3Key: `serverless-v${version}.tgz`,
  s3Bucket: `install.serverless.com`,
  downloadUrl: `https://install.serverless.com/archives/serverless-${version}.tgz`,
})

await releaseMetadataCollection.updateOne(
  { _id: metadata._id },
  { $push: { supportedVersions: process.argv[2] } },
)

await mongo.close()
