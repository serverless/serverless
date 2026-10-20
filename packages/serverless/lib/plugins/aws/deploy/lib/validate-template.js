import getS3EndpointForRegion from '../../utils/get-s3-endpoint-for-region.js'
import ServerlessError from '../../../../serverless-error.js'
import {
  getWebFunctionsUnavailableContext,
  serviceHasWebApps,
} from '../../lib/web-apps.js'

/**
 * Whether CloudFormation rejected the template because the Region does not
 * have the Web Function resource types.
 */
const isWebFunctionTypeUnrecognized = (message = '') =>
  message.includes('Unrecognized resource types') &&
  message.includes('AWS::Lambda::WebFunction')

export default {
  async validateTemplate() {
    const bucketName = this.bucketName
    const artifactDirectoryName =
      this.serverless.service.package.artifactDirectoryName
    const compiledTemplateFileName =
      this.provider.naming.getCompiledTemplateS3Suffix()
    const s3Endpoint = getS3EndpointForRegion(this.provider.getRegion())
    const params = {
      TemplateURL: `https://${s3Endpoint}/${bucketName}/${artifactDirectoryName}/${compiledTemplateFileName}`,
    }

    return this.provider
      .request('CloudFormation', 'validateTemplate', params)
      .catch((error) => {
        let errorMessage = [
          'The CloudFormation template is invalid:',
          ` ${error.message}`,
        ].join('')
        if (
          serviceHasWebApps(this.serverless) &&
          isWebFunctionTypeUnrecognized(error.message)
        ) {
          errorMessage += `\n${getWebFunctionsUnavailableContext(
            this.provider.getRegion(),
          )}`
        }
        throw new ServerlessError(
          errorMessage,
          'INVALID_AWS_CLOUDFORMATION_TEMPLATE',
        )
      })
  },
}
