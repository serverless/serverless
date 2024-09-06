export default {
  async setBucketName() {
    if (this.bucketName) {
      return this.bucketName
    }

    return this.provider
      .getServerlessDeploymentBucketName()
      .then(({ bucketToUse, existingStackBucket }) => {
        this.bucketName = bucketToUse
        this.existingStackBucket = existingStackBucket
      })
  },
}
