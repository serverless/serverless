import memoize from 'memoizee'
import ServerlessError from '../../serverless-error.js'
import { shouldS3Accelerate } from '../s3-acceleration.js'
import * as S3 from '@aws-sdk/client-s3'
import * as STS from '@aws-sdk/client-sts'
import * as ECR from '@aws-sdk/client-ecr'
import * as CloudFormationNS from '@aws-sdk/client-cloudformation'
import * as CloudWatch from '@aws-sdk/client-cloudwatch'
import * as CloudWatchLogs from '@aws-sdk/client-cloudwatch-logs'
import * as LambdaNS from '@aws-sdk/client-lambda'
import * as IAM from '@aws-sdk/client-iam'
import * as APIGatewayNS from '@aws-sdk/client-api-gateway'
import * as ApiGatewayV2NS from '@aws-sdk/client-apigatewayv2'
import * as IoTNS from '@aws-sdk/client-iot'
import { addProxyToAwsClient } from '@serverless/util'

const nsByService = {
  S3,
  STS,
  ECR,
  CloudFormation: CloudFormationNS,
  CloudWatch,
  CloudWatchLogs,
  Lambda: LambdaNS,
  IAM,
  APIGateway: APIGatewayNS,
  ApiGatewayV2: ApiGatewayV2NS,
  IoT: IoTNS,
}

export const canonicalizeServiceName = (name) => (name === 'Iot' ? 'IoT' : name)
export const getNamespaceForService = (name) =>
  nsByService[canonicalizeServiceName(name)]
export const pascalCase = (s) =>
  s.replace(/(^|_|-|\.|\/)\w/g, (m) =>
    m.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
  )

export const createV3ClientFactory = () => {
  const getV3Client = memoize(
    (service, method) => {
      const params = service.params || {}
      const credentials = params.accessKeyId
        ? {
            accessKeyId: params.accessKeyId,
            secretAccessKey: params.secretAccessKey,
            sessionToken: params.sessionToken,
          }
        : undefined
      const common = {
        region: params.region,
        credentials,
      }
      const canonical = canonicalizeServiceName(service.name)
      const ns = getNamespaceForService(service.name)
      if (!ns) {
        throw new ServerlessError(
          `Unsupported AWS service for v3 request path: ${service.name}`,
          'AWS_V3_UNSUPPORTED_SERVICE',
        )
      }
      const clientName = `${canonical}Client`
      const ClientCtor = ns[clientName]
      if (!ClientCtor) {
        throw new ServerlessError(
          `Cannot resolve v3 client constructor: ${clientName}`,
          'AWS_V3_CLIENT_NOT_FOUND',
        )
      }
      if (canonical === 'S3') {
        const client = new ClientCtor({
          ...common,
          useAccelerateEndpoint: shouldS3Accelerate(method, params),
          followRegionRedirects: true,
        })
        return addProxyToAwsClient(client)
      }
      return addProxyToAwsClient(new ClientCtor(common))
    },
    {
      normalizer: ([service, method]) => {
        const key = {
          name: service.name,
          region: service.params?.region,
          accessKeyId: service.params?.accessKeyId,
          accelerate:
            service.name === 'S3' &&
            shouldS3Accelerate(method, service.params || {}),
        }
        return JSON.stringify(key)
      },
    },
  )
  return { getV3Client }
}
