import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  ServerSideEncryption,
} from '@aws-sdk/client-s3'
import { sendAwsRequest } from './clients.js'

export const resolveVariableFromS3 = async (
  logger,
  credentials,
  config,
  region,
  resolutionDetails,
  key,
) => {
  let resolvedDetails = { ...resolutionDetails } // Clone resolutionDetails
  if (!resolvedDetails?.bucketName && !resolvedDetails?.objectKey) {
    if (key.startsWith('arn:aws:s3:::')) {
      // Split the ARN into its components
      const arnParts = key.split(':')
      // The S3 ARN structure is:
      // arn:aws:s3:::bucket_name/object_key
      const resource = arnParts[5]
      // Separate the bucket name from the object key
      const resourceParts = resource.split('/')

      const bucketName = resourceParts[0]
      const objectKey = resourceParts.slice(1).join('/')
      resolvedDetails = {
        objectKey: objectKey,
        bucketName: bucketName,
      }
    } else if (key.startsWith('s3://')) {
      // Remove the 's3://' prefix and split the rest by '/'
      const [, , bucketName, ...keyParts] = key.split('/')
      // Join the remaining parts to reconstruct the object path
      resolvedDetails = {
        objectKey: keyParts.join('/'),
        bucketName: bucketName,
      }
    } else {
      // Assume there's no prefix and the key is just the bucket name and object path
      const [bucketName, ...keyParts] = key.split('/')
      resolvedDetails = {
        objectKey: keyParts.join('/'),
        bucketName: bucketName,
      }
    }
  }
  if (resolvedDetails?.bucketName && !resolvedDetails?.objectKey) {
    resolvedDetails.objectKey = key
  }
  const command = new GetObjectCommand({
    Bucket: resolvedDetails?.bucketName,
    Key: resolvedDetails?.objectKey,
  })
  const response = await (async () => {
    try {
      return await sendAwsRequest({
        service: 's3',
        credentials,
        region,
        logger,
        command,
        target: `${resolvedDetails?.bucketName}/${resolvedDetails?.objectKey}`,
      })
    } catch (error) {
      const name = error.name
      if (error instanceof NoSuchKey || name === 'NoSuchKey') {
        logger.debug(`s3 key ${key} not found`)
        return null
      }
      throw error
    }
  })()

  if (!response) {
    return null
  }

  return new Promise((resolve, reject) => {
    let fileContent = ''
    response.Body.on('data', (chunk) => {
      fileContent += chunk
    })
    response.Body.on('end', () => {
      resolve(fileContent)
    })
    response.Body.on('error', reject)
  })
}

export const storeDataInS3 = async (
  logger,
  credentials,
  region,
  resolutionDetails,
  key,
  value,
) => {
  let resolvedDetails = { ...resolutionDetails } // Clone resolutionDetails
  if (!resolvedDetails?.bucketName && !resolvedDetails?.objectKey) {
    if (key.startsWith('arn:aws:s3:::')) {
      // Split the ARN into its components
      const arnParts = key.split(':')
      // The S3 ARN structure is:
      // arn:aws:s3:::bucket_name/object_key
      const resource = arnParts[5]
      // Separate the bucket name from the object key
      const resourceParts = resource.split('/')

      const bucketName = resourceParts[0]
      const objectKey = resourceParts.slice(1).join('/')
      resolvedDetails = {
        objectKey: objectKey,
        bucketName: bucketName,
      }
    } else if (key.startsWith('s3://')) {
      // Remove the 's3://' prefix and split the rest by '/'
      const [, , bucketName, ...keyParts] = key.split('/')
      // Join the remaining parts to reconstruct the object path
      resolvedDetails = {
        objectKey: keyParts.join('/'),
        bucketName: bucketName,
      }
    } else {
      // Assume there's no prefix and the key is just the bucket name and object path
      const [bucketName, ...keyParts] = key.split('/')
      resolvedDetails = {
        objectKey: keyParts.join('/'),
        bucketName: bucketName,
      }
    }
  }
  if (resolvedDetails?.bucketName && !resolvedDetails?.objectKey) {
    resolvedDetails.objectKey = key
  }
  if (!isValidServerSideEncryption(resolutionDetails?.serverSideEncryption)) {
    throw new Error(
      `Invalid ServerSideEncryption value of s3 resolver: ${resolutionDetails?.serverSideEncryption}`,
    )
  }
  const command = new PutObjectCommand({
    Bucket: resolvedDetails?.bucketName,
    Key: resolvedDetails?.objectKey,
    Body: value,
    ServerSideEncryption: resolutionDetails?.serverSideEncryption || undefined,
  })
  await sendAwsRequest({
    service: 's3',
    credentials,
    region,
    logger,
    command,
    target: `${resolvedDetails?.bucketName}/${resolvedDetails?.objectKey}`,
  })
}

const isValidServerSideEncryption = (value) => {
  return !value || Object.values(ServerSideEncryption).includes(value)
}
