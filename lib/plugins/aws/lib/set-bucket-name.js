export default {
  async setBucketName() {
    if (this.bucketName) {
      return this.bucketName
    }

    return this.provider
      .getServerlessDeploymentBucketName()
      .then(({ bucketToUse, existingStackBucket, globalBucketUsed }) => {
        this.bucketName = bucketToUse
        this.existingStackBucket = existingStackBucket
        this.globalDeploymentBucketUsed = globalBucketUsed
      })
  },
}
