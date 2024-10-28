export default {
  async resolveState(serverless) {
    if (
      serverless?.state?.putServiceState &&
      serverless?.state?.getServiceState
    ) {
      return
    }
    Object.assign(serverless.state, await serverless.state.resolveStateStore())
  },
}
