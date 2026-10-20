import { jest } from '@jest/globals'
import validateTemplate from '../../../../../../../lib/plugins/aws/deploy/lib/validate-template.js'
import ServerlessError from '../../../../../../../lib/serverless-error.js'

const createContext = ({ region = 'us-west-2', request, webApps } = {}) => ({
  ...validateTemplate,
  bucketName: 'deployment-bucket',
  serverless: {
    service: {
      package: { artifactDirectoryName: 'serverless/my-service/dev/12345' },
    },
    configurationInput: { webApps },
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

  describe('when the Region has no Lambda Web Functions', () => {
    const unrecognized = () =>
      Object.assign(
        new Error(
          'Template format error: Unrecognized resource types: [AWS::Lambda::WebFunction, AWS::Lambda::WebFunctionRevision]',
        ),
        { code: 'AWS_CLOUD_FORMATION_VALIDATE_TEMPLATE_VALIDATION_ERROR' },
      )

    it('follows the AWS message with the cause', async () => {
      const context = createContext({
        region: 'eu-south-2',
        request: jest.fn().mockRejectedValue(unrecognized()),
        webApps: { api: { entry: 'src/server.js' } },
      })

      await expect(context.validateTemplate()).rejects.toMatchObject({
        code: 'INVALID_AWS_CLOUDFORMATION_TEMPLATE',
        message:
          'The CloudFormation template is invalid: Template format error: Unrecognized resource types: [AWS::Lambda::WebFunction, AWS::Lambda::WebFunctionRevision]\n' +
          "AWS Lambda Web Functions aren't available in eu-south-2. Deploy to a Region that offers them.",
      })
    })

    it('leaves the message alone for a service without web apps', async () => {
      const context = createContext({
        request: jest.fn().mockRejectedValue(unrecognized()),
      })

      await expect(context.validateTemplate()).rejects.toMatchObject({
        message:
          'The CloudFormation template is invalid: Template format error: Unrecognized resource types: [AWS::Lambda::WebFunction, AWS::Lambda::WebFunctionRevision]',
      })
    })

    it('leaves other unrecognized types alone', async () => {
      const context = createContext({
        request: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Template format error: Unrecognized resource types: [AWS::Foo::Bar]',
            ),
          ),
        webApps: { api: { entry: 'src/server.js' } },
      })

      await expect(context.validateTemplate()).rejects.toMatchObject({
        message:
          'The CloudFormation template is invalid: Template format error: Unrecognized resource types: [AWS::Foo::Bar]',
      })
    })
  })
})
