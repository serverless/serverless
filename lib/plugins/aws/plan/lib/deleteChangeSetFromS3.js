'use strict'
const naming = require('./naming')

function deleteChangeSetFromS3() {
  const provider = this.provider;
  const s3FolderPath = naming.getChangeSetS3FolderPath(this);
  const bucketName = this.bucketName;
  return provider.request(
    'S3',
    'listObjectsV2',
    { Bucket: bucketName, Prefix: s3FolderPath }
  ).then(response => {
    const files = response.Contents.map(entry => ({ Key: entry.Key }));
    files.push({ Key: s3FolderPath });
    return provider.request(
      'S3',
      'deleteObjects',
      { Bucket: bucketName, Delete: { Objects: files } }
    )
  })
}

module.exports = {
  deleteChangeSetFromS3
};