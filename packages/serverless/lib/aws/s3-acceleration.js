import { log } from '@serverless/util'

const accelerationCompatibleS3Methods = new Set(['upload', 'putObject'])

export const shouldS3Accelerate = (method, params) => {
  if (
    accelerationCompatibleS3Methods.has(method) &&
    params &&
    params.isS3TransferAccelerationEnabled
  ) {
    log.notice('Using S3 Transfer Acceleration Endpoint')
    return true
  }
  return false
}
