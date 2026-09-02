import { jest } from '@jest/globals'
import validateTemplate from '../../../../../../../lib/plugins/aws/deploy/lib/validate-template.js'
import ServerlessError from '../../../../../../../lib/serverless-error.js'

const createContext = ({ region = 'us-west-2', request } = {}) => ({
  ...validateTemplate,
  bucketName: 'deployment-bucket',
  serverless: {
    service: {
      package: { artifactDirectoryName: 'serverless/my-service/dev/12345' },
    },
  },
  provider: {
    getRegion: () => region,
    naming: {
      getCompiledTemplateS3Suffix: () =>
        'compiled-cloudformation-template.json',
    },
    request: request || jest.fn().mockResolvedValue({}),
  },
})

describe('validateTemplate', () => {
  it('should call CloudFormation validateTemplate with a regional TemplateURL', async () => {
    const request = jest.fn().mockResolvedValue({})
    const context = createContext({ region: 'us-west-2', request })

    await context.validateTemplate()

    expect(request).toHaveBeenCalledWith('CloudFormation', 'validateTemplate', {
      TemplateURL:
        'https://s3.us-west-2.amazonaws.com/deployment-bucket/serverless/my-service/dev/12345/compiled-cloudformation-template.json',
    })
  })

  it('should use the regional endpoint for us-east-1 as well', async () => {
    const request = jest.fn().mockResolvedValue({})
    const context = createContext({ region: 'us-east-1', request })

    await context.validateTemplate()

    expect(request).toHaveBeenCalledWith('CloudFormation', 'validateTemplate', {
      TemplateURL:
        'https://s3.us-east-1.amazonaws.com/deployment-bucket/serverless/my-service/dev/12345/compiled-cloudformation-template.json',
    })
  })

  it('should wrap validation errors in a ServerlessError', async () => {
    const request = jest.fn().mockRejectedValue(new Error('Invalid template'))
    const context = createContext({ request })

    await expect(context.validateTemplate()).rejects.toThrow(ServerlessError)
    await expect(context.validateTemplate()).rejects.toThrow(
      'The CloudFormation template is invalid: Invalid template',
    )
  })
})
