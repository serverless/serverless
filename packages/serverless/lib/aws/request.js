import v2Request from './v2/request.js'
import v3Request from './v3/request.js'

const USE_V3 = String(process.env.SLS_AWS_SDK || '').toLowerCase() === '3'

const awsRequest = (...args) =>
  USE_V3 ? v3Request(...args) : v2Request(...args)
awsRequest.memoized = (...args) =>
  USE_V3 ? v3Request.memoized(...args) : v2Request.memoized(...args)

export default awsRequest
