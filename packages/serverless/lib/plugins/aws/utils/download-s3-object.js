import fs from 'node:fs'

/**
 * Download an S3 object to a local file: a `package.artifact` given as an S3
 * URI is fetched this way before packaging uses it as a local zip.
 *
 * @param {object} params
 * @param {object} params.provider - the AWS provider
 * @param {{ Bucket: string, Key: string }} params.s3Object - from `parseS3URI`
 * @param {string} params.filePath - where to write the object
 * @param {string} [params.region] - the region to request; the provider's
 *   region when unset
 * @returns {Promise<string>} `filePath`, once the file is written
 */
export default async function downloadS3Object({
  provider,
  s3Object,
  filePath,
  region,
}) {
  const result = await provider.request('S3', 'getObject', s3Object, {
    region,
  })

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath)
    if (result && result.Body && typeof result.Body.pipe === 'function') {
      // AWS SDK v3: Body is a Readable stream. Piping it to the file consumes
      // the stream, which frees the socket, without buffering the object.
      // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html#amazon-s3-stream-vs-buffer
      result.Body.pipe(writeStream).on('error', reject).on('close', resolve)
    } else {
      // AWS SDK v2: Body is a Buffer or string the SDK already buffered.
      writeStream.on('error', reject)
      writeStream.on('close', resolve)
      writeStream.end(result && result.Body ? result.Body : result)
    }
  })
  return filePath
}
