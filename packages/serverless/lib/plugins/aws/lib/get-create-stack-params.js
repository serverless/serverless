export default {
  getCreateStackParams(options) {
    const params = {
      ...this.getSharedStackActionParams(options),
      OnFailure: 'DELETE',
    }

    if (this.serverless.service.provider.disableRollback) {
      delete params.OnFailure
      params.DisableRollback = this.serverless.service.provider.disableRollback
    }

    return params
  },
}
