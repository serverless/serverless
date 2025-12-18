export default {
  async setBucketName() {
    if (this.bucketName) {
      return this.bucketName
    }

    return this.provider
      .getServerlessDeploymentBucketName()
      .then((deploymentBucket) => {
        this.bucketName = deploymentBucket
        this.deploymentBucketInStack = this.provider.deploymentBucketInStack
        this.globalDeploymentBucketUsed =
          this.provider.globalDeploymentBucketUsed
      })
  },
}
