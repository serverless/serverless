import { getOrCreateDefaultBucket } from './index.js'
import { v4 as uuidv4 } from 'uuid'
import { log, ServerlessError, ServerlessErrorCodes } from '@serverless/util'

const SSM_PARAMETER_NAME = '/serverless-framework/deployment/s3-bucket'
const S3_BUCKET_NAME_PREFIX = 'serverless-framework-deployments'

export const getOrCreateGlobalDeploymentBucket = async ({
  credentials,
  region,
  logger = log.get('core:deployment-bucket'),
}) => {
  try {
    return await getOrCreateDefaultBucket({
      ssmParameterName: SSM_PARAMETER_NAME,
      s3BucketName: `${S3_BUCKET_NAME_PREFIX}-${region}-${uuidv4().slice(0, 13)}`,
      credentials,
      region,
      logger,
    })
  } catch (err) {
    if (
      err.name === 'AccessDeniedException' ||
      err.name === 'AccessDenied' ||
      err?.originalName === 'AccessDeniedException' ||
      err?.originalName === 'AccessDenied'
    ) {
      const customErr = new ServerlessError(
        `Access denied when storing the parameter "${SSM_PARAMETER_NAME}". Please check your permissions and try again. ` +
          `You have the following options:\n` +
          `• Ensure you have permission to create SSM and S3 resources.\n` +
          `• Use the "provider.deploymentBucket" field to specify an existing S3 bucket.\n` +
          `• Manually create the S3 bucket and SSM parameter.\n\n` +
          `For more details, please refer to the documentation: https://www.serverless.com/framework/docs/guides/deployment-bucket\n\n` +
          `Original error: ${err.message}`,
        ServerlessErrorCodes.deploymentBucket
          .DEPLOYMENT_BUCKET_INSUFFICIENT_PERMISSIONS,
      )
      customErr.stack = undefined
      throw customErr
    }
    throw err
  }
}
