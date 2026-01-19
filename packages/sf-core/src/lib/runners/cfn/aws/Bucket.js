import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import path from 'path'
import { getFunctionsDirectories, zip } from '../utils.js'
import { addProxyToAwsClient } from '@serverless/util'

/**
 * Bucket class to manage the deployment bucket
 */
export default class Bucket {
  constructor({ region = null, credentials = null, name, stackName }) {
    this.region = region
    this.credentials = credentials

    this.name = name
    this.url = `https://${this.name}.s3.amazonaws.com`

    const dateTime = new Date().toISOString().replace(/[^0-9]/g, '-')
    this.deploymentId = dateTime.slice(0, dateTime.lastIndexOf('-'))
    this.deploymentDir = `serverless/${stackName}/${this.deploymentId}`

    this.templateKey = `${this.deploymentDir}/template.json`
    this.templateUrl = `${this.url}/${encodeURIComponent(this.templateKey)}`

    this.client = addProxyToAwsClient(
      new S3Client({
        region,
        credentials,
      }),
    )
  }

  /**
   * Check if the bucket exists
   */
  async exists() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.name }))
      return true
    } catch (error) {
      if (error.name === 'NotFound') {
        return false // Bucket does not exist
      }
      throw error
    }
  }

  /**
   * Upload the functions zip files to the bucket
   * and return the url/uri for each function
   *
   * @param {string} servicePath
   * @param {Object} templateFile
   * @returns
   */
  async uploadFunctions({ servicePath, templateFile }) {
    const functions = await zip(
      getFunctionsDirectories({ servicePath, templateFile }),
    )

    for (const [functionName, { zip }] of Object.entries(functions)) {
      const key = `${this.deploymentDir}/${functionName}.zip`
      const url = `${this.url}/${key}`
      const uri = `s3://${this.name}/${this.deploymentDir}/${functionName}.zip`

      functions[functionName].key = key
      functions[functionName].url = url
      functions[functionName].uri = uri

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.name,
          Key: key,
          Body: zip,
          ContentType: 'application/zip',
        }),
      )
    }
    return functions
  }

  /**
   * Empty the bucket contents
   * Must be used before deleting the bucket
   */
  async empty() {
    const objects = []

    // list all objects in the bucket
    const { Contents } = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.name }),
    )

    if (Contents?.length && Contents.length > 0) {
      Contents.forEach((object) => {
        objects.push({
          Key: object.Key,
        })
      })

      // delete all objects in bucket
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.name,
          Delete: {
            Objects: objects,
          },
        }),
      )
    }
  }
}
