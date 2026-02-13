import AWS from '../../aws/v2/sdk.js'
import _ from 'lodash'
import naming from './lib/naming.js'
import fsp from 'fs/promises'
import getS3EndpointForRegion from './utils/get-s3-endpoint-for-region.js'
import memoizeeMethods from 'memoizee/methods.js'
import albValidate from './package/compile/events/alb/lib/validate.js'
import awsS3ConfigSchema from './package/compile/events/s3/config-schema.js'
import d from 'd'
import path from 'path'
import spawnExt from 'child-process-ext/spawn.js'
import ServerlessError from '../../serverless-error.js'
import awsRequest from '../../aws/request.js'
import { cfValue } from '../../utils/aws-schema-get-cf-value.js'
import reportDeprecatedProperties from '../../utils/report-deprecated-properties.js'
import deepSortObjectByKey from '../../utils/deep-sort-object-by-key.js'
import {
  getOrCreateGlobalDeploymentBucket,
  log,
  progress,
} from '@serverless/util'

const { ALB_LISTENER_REGEXP } = albValidate

const isLambdaArn = RegExp.prototype.test.bind(/^arn:[^:]+:lambda:/)
const isEcrUri = RegExp.prototype.test.bind(
  /^\d+\.dkr\.ecr\.[a-z0-9-]+..amazonaws.com\/([^@]+)|([^@:]+@sha256:[a-f0-9]{64})$/,
)

function caseInsensitive(str) {
  return { type: 'string', regexp: new RegExp(`^${str}$`, 'i').toString() }
}

function resolveRuntimeManagement(input) {
  if (typeof input === 'string') {
    return {
      mode: input,
    }
  }
  return input
}

const constants = {
  providerName: 'aws',
}

const imageNamePattern = '^[a-z][a-z0-9-_]{1,31}$'

const apiGatewayUsagePlan = {
  description: `API Gateway usage plan throttling and quota configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#setting-api-keys-for-your-rest-api
@example
usagePlan:
  quota:
    limit: 5000
    period: MONTH
  throttle:
    burstLimit: 200
    rateLimit: 100`,
  type: 'object',
  properties: {
    quota: {
      description: `Daily/weekly/monthly request quota limits.`,
      type: 'object',
      properties: {
        limit: {
          description: `Maximum number of requests allowed in the period.`,
          type: 'integer',
          minimum: 0,
        },
        offset: {
          description: `Number of requests subtracted from the initial quota window.`,
          type: 'integer',
          minimum: 0,
        },
        period: {
          description: `Quota period unit.`,
          enum: ['DAY', 'WEEK', 'MONTH'],
        },
      },
      additionalProperties: false,
    },
    throttle: {
      description: `Burst and steady-state request rate controls.`,
      type: 'object',
      properties: {
        burstLimit: {
          description: `Maximum requests allowed in a short burst.`,
          type: 'integer',
          minimum: 0,
        },
        rateLimit: {
          description: `Steady-state requests per second.`,
          type: 'integer',
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}

const baseAlbAuthorizerProperties = {
  onUnauthenticatedRequest: {
    description: `Behavior when the incoming request is unauthenticated.`,
    enum: ['allow', 'authenticate', 'deny'],
  },
  requestExtraParams: {
    description: `Additional query parameters forwarded to the identity provider.`,
    type: 'object',
    maxProperties: 10,
    additionalProperties: { type: 'string' },
  },
  scope: {
    description: `OAuth scope string requested during authentication.`,
    type: 'string',
  },
  sessionCookieName: {
    description: `Name of the authentication session cookie.`,
    type: 'string',
  },
  sessionTimeout: {
    description: `Session timeout in seconds.`,
    type: 'integer',
    minimum: 0,
  },
}

const oidcAlbAuthorizer = {
  description: `OIDC authorizer configuration for ALB listeners.
@see https://www.serverless.com/framework/docs/providers/aws/events/alb#add-cognitocustom-idp-provider-authentication`,
  type: 'object',
  properties: {
    type: { description: `Authorizer type discriminator.`, const: 'oidc' },
    authorizationEndpoint: {
      description: `OIDC authorization endpoint URL.`,
      format: 'uri',
      type: 'string',
    },
    clientId: { description: `OIDC client identifier.`, type: 'string' },
    clientSecret: { description: `OIDC client secret.`, type: 'string' },
    issuer: { description: `OIDC issuer URL.`, format: 'uri', type: 'string' },
    tokenEndpoint: {
      description: `OIDC token endpoint URL.`,
      format: 'uri',
      type: 'string',
    },
    userInfoEndpoint: {
      description: `OIDC userinfo endpoint URL.`,
      format: 'uri',
      type: 'string',
    },
    ...baseAlbAuthorizerProperties,
  },
  required: [
    'type',
    'authorizationEndpoint',
    'clientId',
    'issuer',
    'tokenEndpoint',
    'userInfoEndpoint',
  ],
  additionalProperties: false,
}

const cognitoAlbAuthorizer = {
  description: `Amazon Cognito authorizer configuration for ALB listeners.
@see https://www.serverless.com/framework/docs/providers/aws/events/alb#add-cognitocustom-idp-provider-authentication`,
  type: 'object',
  properties: {
    type: { description: `Authorizer type discriminator.`, const: 'cognito' },
    userPoolArn: {
      description: `ARN of the Cognito User Pool.`,
      $ref: '#/definitions/awsArn',
    },
    userPoolClientId: {
      description: `Cognito app client identifier.`,
      type: 'string',
    },
    userPoolDomain: {
      description: `Cognito User Pool domain prefix or domain name.`,
      type: 'string',
    },
    ...baseAlbAuthorizerProperties,
  },
  required: ['type', 'userPoolArn', 'userPoolClientId', 'userPoolDomain'],
  additionalProperties: false,
}

class AwsProvider {
  constructor(serverless, options) {
    this.naming = { provider: this }
    this.options = options
    this.provider = this // only load plugin in an AWS service context
    this.serverless = serverless
    // Notice: provider.sdk is used by plugins. Do not remove without deprecating first and
    //         offering a reliable alternative
    this.sdk = AWS
    this.serverless.setProvider(constants.providerName, this)

    if ('aws' in serverless.credentialProviders) {
      this.resolveCredentials = serverless.credentialProviders.aws
    } else {
      throw new Error('Credential Resolver must be defined')
    }

    /**
     * Some of our users need to continue using the legacy deployment buckets
     * managed by the stack itself (aka v3 deployment buckets).
     * This flag gives allows them to do that.
     */
    this.isLegacyDeploymentBucketEnabled =
      this.options['enable-legacy-deployment-bucket'] ||
      process.env.ENABLE_LEGACY_DEPLOYMENT_BUCKET ||
      this.serverless.service.provider.enableLegacyDeploymentBucket

    this.hooks = {
      initialize: () => {
        // Support deploymentBucket configuration as an object
        const provider = this.serverless.service.provider
        if (provider && provider.deploymentBucket) {
          if (_.isObject(provider.deploymentBucket)) {
            // store the object in a new variable so that it can be reused later on
            provider.deploymentBucketObject = provider.deploymentBucket
            if (provider.deploymentBucket.name) {
              // (re)set the value of the deploymentBucket property to the name (which is a string)
              provider.deploymentBucket = provider.deploymentBucket.name
            } else {
              provider.deploymentBucket = null
            }
          }
        }
        reportDeprecatedProperties(
          'PROVIDER_IAM_SETTINGS_V3',
          {
            'provider.role': 'provider.iam.role',
            'provider.rolePermissionsBoundary':
              'provider.iam.role.permissionsBoundary',
            'provider.iam.role.permissionBoundary':
              'provider.iam.role.permissionsBoundary',
            'provider.iamManagedPolicies': 'provider.iam.role.managedPolicies',
            'provider.iamRoleStatements': 'provider.iam.role.statements',
            'provider.cfnRole': 'provider.iam.deploymentRole',
          },
          { serviceConfig: this.serverless.service },
        )
      },
    }

    if (this.serverless.service.provider.name === 'aws') {
      // Below ideally should be in hooks.initialize, but variables resolution depend on this
      this.serverless.service.provider.region = this.getRegion()
      serverless.configSchemaHandler.defineProvider('aws', {
        definitions: {
          awsAccountId: {
            description: `12-digit AWS account identifier.`,
            type: 'string',
            pattern: '^\\d{12}$',
          },
          awsAlbListenerArn: {
            description: `ALB listener ARN string.`,
            type: 'string',
            pattern: ALB_LISTENER_REGEXP.source,
          },
          awsAlexaEventToken: {
            description: `Alexa Skill or Smart Home application ID token.`,
            type: 'string',
            minLength: 0,
            maxLength: 256,
            pattern: '^[a-zA-Z0-9._\\-]+$',
          },
          awsApiGatewayAbbreviatedArn: {
            description: `Abbreviated ARN for API Gateway resource policies.`,
            type: 'string',
            pattern: '^execute-api:/',
          },
          awsApiGatewayApiKeys: {
            description: `API Gateway API key definitions.`,
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                {
                  $ref: '#/definitions/awsApiGatewayApiKeysProperties',
                },
                {
                  type: 'object',
                  maxProperties: 1,
                  additionalProperties: {
                    type: 'array',
                    items: {
                      oneOf: [
                        { type: 'string' },
                        {
                          $ref: '#/definitions/awsApiGatewayApiKeysProperties',
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
          awsApiGatewayApiKeysProperties: {
            description: `API Gateway API key configuration.`,
            type: 'object',
            properties: {
              name: { description: `API key name.`, type: 'string' },
              value: {
                description: `API key value (20-128 characters).`,
                type: 'string',
              },
              description: {
                description: `Description of the API key.`,
                type: 'string',
              },
              customerId: {
                description: `Customer ID for usage tracking.`,
                type: 'string',
              },
              enabled: {
                description: `Whether the API key is enabled.
@default true`,
                type: 'boolean',
              },
            },
            additionalProperties: false,
          },
          awsHttpApiPayload: {
            description: `HTTP API payload format version.
@default '2.0'
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api#event-payload-format
@example 2.0`,
            type: 'string',
            enum: ['1.0', '2.0'],
          },
          awsArn: {
            description: `AWS ARN string or CloudFormation intrinsic that resolves to an ARN.`,
            anyOf: [
              { $ref: '#/definitions/awsArnString' },
              { $ref: '#/definitions/awsCfFunction' },
            ],
          },
          awsArnString: {
            description: `AWS ARN string starting with arn:.`,
            type: 'string',
            pattern: '^arn:',
          },
          awsCfArrayInstruction: {
            description: `Array of CloudFormation instructions or Fn::Split.`,
            anyOf: [
              {
                type: 'array',
                items: { $ref: '#/definitions/awsCfInstruction' },
              },
              { $ref: '#/definitions/awsCfSplit' },
            ],
          },
          awsSecretsManagerArnString: {
            description: `AWS Secrets Manager secret ARN.`,
            type: 'string',
            pattern:
              'arn:[a-z-]+:secretsmanager:[a-z0-9-]+:\\d+:secret:[A-Za-z0-9/_+=.@-]+',
          },
          awsCfFunction: {
            description: `CloudFormation intrinsic function.`,
            anyOf: [
              { $ref: '#/definitions/awsCfImport' },
              { $ref: '#/definitions/awsCfJoin' },
              { $ref: '#/definitions/awsCfGetAtt' },
              { $ref: '#/definitions/awsCfRef' },
              { $ref: '#/definitions/awsCfSub' },
              { $ref: '#/definitions/awsCfBase64' },
              { $ref: '#/definitions/awsCfToJsonString' },
            ],
          },
          awsCfForEach: {
            description: `CloudFormation Fn::ForEach loop construct.`,
            type: 'array',
            minItems: 3,
            maxItems: 3,
          },
          awsCfGetAtt: {
            description: `CloudFormation Fn::GetAtt intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::GetAtt': {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: { type: 'string', minLength: 1 },
              },
            },
            required: ['Fn::GetAtt'],
            additionalProperties: false,
          },
          awsCfGetAZs: {
            description: `CloudFormation Fn::GetAZs intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::GetAZs': {
                oneOf: [
                  { type: 'string', minLength: 1 },
                  { $ref: '#/definitions/awsCfRef' },
                ],
              },
            },
            required: ['Fn::GetAZs'],
            additionalProperties: false,
          },
          awsCfImport: {
            description: `CloudFormation Fn::ImportValue intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::ImportValue': {},
            },
            additionalProperties: false,
            required: ['Fn::ImportValue'],
          },
          awsCfIf: {
            description: `CloudFormation Fn::If conditional intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::If': {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: { $ref: '#/definitions/awsCfInstruction' },
              },
            },
            required: ['Fn::If'],
            additionalProperties: false,
          },
          awsCfImportLocallyResolvable: {
            description: `CloudFormation Fn::ImportValue that resolves to a string.`,
            type: 'object',
            properties: {
              'Fn::ImportValue': { type: 'string' },
            },
            additionalProperties: false,
            required: ['Fn::ImportValue'],
          },
          awsCfInstruction: {
            description: `String value or CloudFormation intrinsic function.`,
            anyOf: [
              { type: 'string', minLength: 1 },
              { $ref: '#/definitions/awsCfFunction' },
            ],
          },
          awsCfJoin: {
            description: `CloudFormation Fn::Join intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::Join': {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: [{ type: 'string' }, { type: 'array' }],
                additionalItems: false,
              },
            },
            required: ['Fn::Join'],
            additionalProperties: false,
          },
          awsCfSelect: {
            description: `CloudFormation Fn::Select intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::Select': {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: {
                  anyOf: [
                    { type: 'number' },
                    { type: 'string' },
                    { type: 'array' },
                    { $ref: '#/definitions/awsCfFindInMap' },
                    { $ref: '#/definitions/awsCfGetAtt' },
                    { $ref: '#/definitions/awsCfGetAZs' },
                    { $ref: '#/definitions/awsCfIf' },
                    { $ref: '#/definitions/awsCfSplit' },
                    { $ref: '#/definitions/awsCfRef' },
                  ],
                },
              },
            },
            required: ['Fn::Select'],
            additionalProperties: false,
          },
          awsCfRef: {
            description: `CloudFormation Ref intrinsic function.`,
            type: 'object',
            properties: {
              Ref: { type: 'string', minLength: 1 },
            },
            required: ['Ref'],
            additionalProperties: false,
          },
          awsCfSplit: {
            description: `CloudFormation Fn::Split intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::Split': {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: {
                  oneOf: [
                    { type: 'string' },
                    { $ref: '#/definitions/awsCfFunction' },
                  ],
                },
              },
            },
            required: ['Fn::Split'],
            additionalProperties: false,
          },
          awsCfFindInMap: {
            description: `CloudFormation Fn::FindInMap intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::FindInMap': {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: {
                  oneOf: [
                    { type: 'string' },
                    { $ref: '#/definitions/awsCfFunction' },
                  ],
                },
              },
            },
            required: ['Fn::FindInMap'],
            additionalProperties: false,
          },
          awsCfSub: {
            description: `CloudFormation Fn::Sub intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::Sub': {},
            },
            required: ['Fn::Sub'],
            additionalProperties: false,
          },
          awsCfBase64: {
            description: `CloudFormation Fn::Base64 intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::Base64': {},
            },
          },
          awsCfToJsonString: {
            description: `CloudFormation Fn::ToJsonString intrinsic function.`,
            type: 'object',
            properties: {
              'Fn::ToJsonString': {
                anyOf: [{ type: 'object' }, { type: 'array' }],
              },
            },
            required: ['Fn::ToJsonString'],
            additionalProperties: false,
          },
          awsIamPolicyAction: { type: 'array', items: { type: 'string' } },
          awsIamPolicyPrincipal: {
            description: `IAM policy principal specification.`,
            anyOf: [
              { const: '*' },
              {
                type: 'object',
                properties: {
                  AWS: {
                    description: `AWS account principals (account IDs or ARNs).`,
                    anyOf: [
                      { const: '*' },
                      { $ref: '#/definitions/awsCfIf' },
                      {
                        type: 'array',
                        items: {
                          anyOf: [
                            { $ref: '#/definitions/awsAccountId' },
                            { $ref: '#/definitions/awsArn' },
                          ],
                        },
                      },
                    ],
                  },
                  Federated: { type: 'array', items: { type: 'string' } },
                  Service: { type: 'array', items: { type: 'string' } },
                  CanonicalUser: { type: 'array', items: { type: 'string' } },
                },
                additionalProperties: false,
              },
            ],
          },
          awsIamPolicyResource: {
            description: `IAM policy resource specification.`,
            anyOf: [
              { const: '*' },
              { $ref: '#/definitions/awsArn' },
              { $ref: '#/definitions/awsLogicalResourceId' },
              {
                type: 'array',
                items: {
                  anyOf: [
                    { const: '*' },
                    { $ref: '#/definitions/awsArn' },
                    { $ref: '#/definitions/awsLogicalResourceId' },
                  ],
                },
              },
            ],
          },
          // Definition of Statement taken from https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_grammar.html#policies-grammar-bnf
          awsIamPolicyStatements: {
            description: `IAM policy statement array.`,
            type: 'array',
            items: {
              type: 'object',
              properties: {
                Sid: {
                  description: `Statement identifier for reference.`,
                  type: 'string',
                },
                Effect: {
                  description: `Whether to allow or deny the actions.`,
                  enum: ['Allow', 'Deny'],
                },
                Action: {
                  description: `Service actions this statement applies to.`,
                  $ref: '#/definitions/awsIamPolicyAction',
                },
                NotAction: {
                  description: `Service actions excluded from this statement.`,
                  $ref: '#/definitions/awsIamPolicyAction',
                },
                Principal: { $ref: '#/definitions/awsIamPolicyPrincipal' },
                NotPrincipal: { $ref: '#/definitions/awsIamPolicyPrincipal' },
                Resource: {
                  description: `Resources this statement applies to.`,
                  $ref: '#/definitions/awsIamPolicyResource',
                },
                NotResource: {
                  description: `Resources excluded from this statement.`,
                  $ref: '#/definitions/awsIamPolicyResource',
                },
                Condition: {
                  description: `Conditions under which this statement applies.`,
                  type: 'object',
                },
              },
              additionalProperties: false,
              allOf: [
                { required: ['Effect'] },
                {
                  oneOf: [
                    { required: ['Action'] },
                    { required: ['NotAction'] },
                  ],
                },
                {
                  oneOf: [
                    { required: ['Resource'] },
                    { required: ['NotResource'] },
                  ],
                },
              ],
            },
          },
          awsKmsArn: {
            description: `KMS key ARN or CloudFormation intrinsic.`,
            anyOf: [
              { $ref: '#/definitions/awsCfFunction' },
              { type: 'string', pattern: '^arn:aws[a-z-]*:kms' },
            ],
          },
          awsLambdaArchitecture: {
            description: `Lambda instruction set architecture.
@default 'x86_64'
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#instruction-set-architecture
@example arm64`,
            enum: ['arm64', 'x86_64'],
          },
          awsLambdaEnvironment: {
            description: `Lambda environment variables map.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#environment-variables
@example
environment:
  TABLE_NAME: my-table
  STAGE: \${sls:stage}`,
            type: 'object',
            patternProperties: {
              '^[A-Za-z_][a-zA-Z0-9_]*$': {
                anyOf: [
                  { const: '' },
                  { $ref: '#/definitions/awsCfInstruction' },
                  { $ref: '#/definitions/awsCfIf' },
                  { $ref: '#/definitions/awsCfSelect' },
                ],
              },
            },
            additionalProperties: false,
          },
          awsLambdaLayers: {
            description: `Array of Lambda layer ARNs.`,
            type: 'array',
            items: { $ref: '#/definitions/awsArn' },
          },
          awsLambdaMemorySize: {
            description: `Lambda memory size in MB (128-10240).
@default 1024
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#configuration
@example 1024`,
            type: 'integer',
            minimum: 128,
            maximum: 32768,
          },
          awsLambdaRole: {
            description: `Lambda execution role ARN or CloudFormation reference.
@see https://www.serverless.com/framework/docs/providers/aws/guide/iam#custom-iam-roles`,
            anyOf: [
              { type: 'string', minLength: 1 },
              { $ref: '#/definitions/awsCfSub' },
              { $ref: '#/definitions/awsCfImport' },
              { $ref: '#/definitions/awsCfGetAtt' },
            ],
          },
          awsLambdaRuntime: {
            description: `Lambda runtime identifier.
@default 'nodejs20.x'
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions
@example nodejs20.x`,
            enum: [
              'dotnet6',
              'dotnet8',
              'dotnet10',
              'go1.x',
              'java25',
              'java21',
              'java17',
              'java11',
              'java8',
              'java8.al2',
              'nodejs14.x',
              'nodejs16.x',
              'nodejs18.x',
              'nodejs20.x',
              'nodejs22.x',
              'nodejs24.x',
              'provided',
              'provided.al2',
              'provided.al2023',
              'python3.7',
              'python3.8',
              'python3.9',
              'python3.10',
              'python3.11',
              'python3.12',
              'python3.13',
              'python3.14',
              'ruby2.7',
              'ruby3.2',
              'ruby3.3',
              'ruby3.4',
            ],
          },
          awsLambdaRuntimeManagement: {
            description: `Lambda runtime management configuration.`,
            oneOf: [
              {
                description: `Shorthand runtime management mode.`,
                enum: ['auto', 'onFunctionUpdate'],
              },
              {
                type: 'object',
                properties: {
                  mode: {
                    description: `Runtime management mode.`,
                    enum: ['auto', 'onFunctionUpdate', 'manual'],
                  },
                  arn: {
                    description: `Runtime version ARN used with manual runtime management mode.`,
                    $ref: '#/definitions/awsArn',
                  },
                },
                additionalProperties: false,
              },
            ],
          },
          awsLambdaTenancy: {
            description: `Lambda tenancy settings for dedicated tenancy environments.`,
            type: 'object',
            properties: {
              mode: {
                description: `Tenancy mode.`,
                anyOf: ['PER_TENANT'].map(caseInsensitive),
              },
            },
            additionalProperties: false,
            required: ['mode'],
          },
          awsLambdaCapacityProviderInstanceRequirements: {
            description: `EC2 instance type requirements for capacity provider compute.`,
            type: 'object',
            properties: {
              allowedInstanceTypes: {
                description: `Allowed EC2 instance types.`,
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
              },
              excludedInstanceTypes: {
                description: `Excluded EC2 instance types.`,
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
              },
              architectures: {
                description: `Required CPU architectures for compute instances.`,
                type: 'array',
                minItems: 1,
                maxItems: 1,
                items: { $ref: '#/definitions/awsLambdaArchitecture' },
              },
            },
            additionalProperties: false,
          },
          awsLambdaCapacityProviderScalingConfig: {
            description: `Auto-scaling configuration for a capacity provider.`,
            type: 'object',
            properties: {
              mode: {
                description: `Scaling mode: auto or manual.`,
                anyOf: ['auto', 'manual'].map(caseInsensitive),
              },
              maxVCpuCount: {
                description: `Maximum vCPU count for the capacity provider fleet.`,
                type: 'integer',
                minimum: 12,
                maximum: 15000,
              },
              policies: {
                description: `Target tracking scaling policies.`,
                type: 'array',
                minItems: 1,
                maxItems: 10,
                items: {
                  type: 'object',
                  properties: {
                    predefinedMetricType: {
                      description: `Predefined metric used for target tracking.`,
                      enum: ['LambdaCapacityProviderAverageCPUUtilization'],
                    },
                    targetValue: {
                      description: `Target value for the scaling metric.`,
                      type: 'number',
                      minimum: 0,
                      maximum: 100,
                    },
                  },
                  additionalProperties: false,
                  required: ['predefinedMetricType', 'targetValue'],
                },
              },
            },
            additionalProperties: false,
          },
          awsLambdaCapacityProviderConfig: {
            description: `Capacity provider configuration with permissions, VPC, and scaling.`,
            type: 'object',
            properties: {
              permissions: {
                description: `IAM permission configuration for the capacity provider.`,
                type: 'object',
                properties: {
                  operatorRole: { $ref: '#/definitions/awsArn' },
                },
                additionalProperties: false,
              },
              vpc: { $ref: '#/definitions/awsLambdaCapacityProviderVpcConfig' },
              instanceRequirements: {
                description: `EC2 instance type requirements.`,
                $ref: '#/definitions/awsLambdaCapacityProviderInstanceRequirements',
              },
              scaling: {
                description: `Auto-scaling configuration.`,
                $ref: '#/definitions/awsLambdaCapacityProviderScalingConfig',
              },
              kmsKeyArn: { $ref: '#/definitions/awsKmsArn' },
            },
            additionalProperties: false,
          },
          awsLambdaCapacityProviderFunctionScaling: {
            description: `Function-level scaling limits for a capacity provider.`,
            type: 'object',
            properties: {
              min: {
                description: `Minimum number of provisioned instances.`,
                type: 'integer',
                minimum: 0,
                maximum: 15000,
              },
              max: {
                description: `Maximum number of provisioned instances.`,
                type: 'integer',
                minimum: 0,
                maximum: 15000,
              },
            },
            additionalProperties: false,
          },
          awsLambdaCapacityProviderFunctionConfig: {
            description: `Function-specific capacity provider assignment settings.`,
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                description: `Capacity provider name.`,
                anyOf: [
                  { type: 'string' },
                  { $ref: '#/definitions/awsCfFunction' },
                ],
              },
              maxConcurrency: {
                description: `Maximum concurrency routed to this capacity provider.`,
                type: 'integer',
                minimum: 1,
                maximum: 1600,
              },
              memoryPerVCpu: {
                description: `Memory-to-vCPU ratio.`,
                enum: [2, 4, 8],
              },
              scaling: {
                description: `Scaling configuration for this provider assignment.`,
                $ref: '#/definitions/awsLambdaCapacityProviderFunctionScaling',
              },
            },
            additionalProperties: false,
          },
          awsLambdaDurableConfig: {
            description: `Durable function execution configuration.`,
            type: 'object',
            properties: {
              executionTimeout: {
                description: `Maximum execution time in seconds for durable functions.`,
                type: 'integer',
                minimum: 1,
                maximum: 31622400,
              },
              retentionPeriodInDays: {
                description: `Execution history retention period in days.`,
                type: 'integer',
                minimum: 1,
                maximum: 90,
              },
            },
            additionalProperties: false,
            required: ['executionTimeout'],
          },
          awsLambdaTimeout: {
            description: `Lambda timeout in seconds (1-900).
@default 6
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#configuration`,
            type: 'integer',
            minimum: 1,
            maximum: 900,
          },
          awsLambdaTracing: {
            description: `Lambda X-Ray tracing mode or boolean toggle.`,
            anyOf: [{ enum: ['Active', 'PassThrough'] }, { type: 'boolean' }],
          },
          awsLambdaVersioning: { type: 'boolean' },
          awsLambdaVpcConfig: {
            description: `VPC configuration for Lambda functions.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#vpc-configuration
@example
vpc:
  securityGroupIds:
    - sg-xxxxxxxx
  subnetIds:
    - subnet-xxxxxxxx
    - subnet-yyyyyyyy`,
            type: 'object',
            properties: {
              ipv6AllowedForDualStack: { type: 'boolean' },
              securityGroupIds: {
                description: `Security group IDs for the Lambda network interfaces.`,
                anyOf: [
                  {
                    type: 'array',
                    items: {
                      anyOf: [
                        { $ref: '#/definitions/awsCfInstruction' },
                        { $ref: '#/definitions/awsCfIf' },
                      ],
                    },
                    maxItems: 5,
                  },
                  { $ref: '#/definitions/awsCfSplit' },
                  { $ref: '#/definitions/awsCfFindInMap' },
                ],
              },
              subnetIds: {
                description: `Subnet IDs where Lambda creates network interfaces.`,
                anyOf: [
                  {
                    type: 'array',
                    items: {
                      anyOf: [
                        { $ref: '#/definitions/awsCfInstruction' },
                        { $ref: '#/definitions/awsCfIf' },
                      ],
                    },
                    maxItems: 16,
                  },
                  { $ref: '#/definitions/awsCfSplit' },
                  { $ref: '#/definitions/awsCfFindInMap' },
                ],
              },
            },
            additionalProperties: false,
            required: ['securityGroupIds', 'subnetIds'],
          },
          awsLambdaCapacityProviderVpcConfig: {
            description: `VPC configuration for capacity provider compute resources.`,
            type: 'object',
            properties: {
              securityGroupIds: {
                description: `Security group IDs for compute instances.`,
                anyOf: [
                  {
                    type: 'array',
                    items: {
                      anyOf: [
                        { $ref: '#/definitions/awsCfInstruction' },
                        { $ref: '#/definitions/awsCfIf' },
                      ],
                    },
                    maxItems: 5,
                  },
                  { $ref: '#/definitions/awsCfSplit' },
                  { $ref: '#/definitions/awsCfFindInMap' },
                ],
              },
              subnetIds: {
                description: `Subnet IDs for compute instances.`,
                anyOf: [
                  {
                    type: 'array',
                    items: {
                      anyOf: [
                        { $ref: '#/definitions/awsCfInstruction' },
                        { $ref: '#/definitions/awsCfIf' },
                      ],
                    },
                    maxItems: 16,
                  },
                  { $ref: '#/definitions/awsCfSplit' },
                  { $ref: '#/definitions/awsCfFindInMap' },
                ],
              },
            },
            additionalProperties: false,
            required: ['securityGroupIds', 'subnetIds'],
          },
          awsLogicalResourceId: {
            description: `CloudFormation logical resource ID pattern.`,
            type: 'string',
            pattern: '^[#A-Za-z0-9-_./]+[*]?$',
          },
          awsLogGroupName: {
            description: `CloudWatch Logs log group name.`,
            type: 'string',
            pattern: '^[/#A-Za-z0-9-_.]+$',
          },
          awsLogRetentionInDays: {
            description: `CloudWatch Logs retention period in days.`,
            type: 'number',
            // https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html#API_PutRetentionPolicy_RequestSyntax
            enum: [
              1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731,
              1827, 2192, 2557, 2922, 3288, 3653,
            ],
          },
          awsLambdaLoggingConfiguration: {
            description: `Lambda advanced logging configuration.`,
            type: 'object',
            properties: {
              applicationLogLevel: {
                description: `Application log level threshold.`,
                type: 'string',
                enum: ['DEBUG', 'ERROR', 'FATAL', 'INFO', 'TRACE', 'WARN'],
              },
              logFormat: {
                description: `Log output format.`,
                type: 'string',
                enum: ['JSON', 'Text'],
              },
              logGroup: {
                description: `CloudWatch Logs group name.`,
                type: 'string',
                pattern: '[\\.\\-_/#A-Za-z0-9]+',
                minLength: 1,
                maxLength: 512,
              },
              systemLogLevel: {
                description: `System log level threshold.`,
                type: 'string',
                enum: ['DEBUG', 'INFO', 'WARN'],
              },
            },
            additionalProperties: false,
          },
          awsLogDataProtectionPolicy: {
            description: `CloudWatch Logs data protection policy document.`,
            type: 'object',
            properties: {
              Name: { description: `Policy name.`, type: 'string' },
              Description: {
                description: `Policy description.`,
                type: 'string',
              },
              Version: {
                description: `Policy document version.`,
                type: 'string',
              },
              Statement: { description: `Policy statements.`, type: 'array' },
            },
            additionalProperties: false,
            required: ['Name', 'Version', 'Statement'],
          },
          awsResourceCondition: { type: 'string' },
          awsResourceDependsOn: { type: 'array', items: { type: 'string' } },
          awsResourcePolicyResource: {
            description: `API Gateway resource policy resource ARN.`,
            anyOf: [
              { const: '*' },
              { $ref: '#/definitions/awsArn' },
              // API Gateway Resource Policy resource property abbreviated syntax - https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies-examples.html
              { $ref: '#/definitions/awsApiGatewayAbbreviatedArn' },
              {
                type: 'array',
                items: {
                  anyOf: [
                    { const: '*' },
                    { $ref: '#/definitions/awsArn' },
                    // API Gateway Resource Policy resource property abbreviated syntax - https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies-examples.html
                    { $ref: '#/definitions/awsApiGatewayAbbreviatedArn' },
                  ],
                },
              },
            ],
          },
          awsResourcePolicyStatements: {
            description: `API Gateway resource policy statements.`,
            type: 'array',
            items: {
              type: 'object',
              properties: {
                Sid: {
                  description: `Statement identifier for reference.`,
                  type: 'string',
                },
                Effect: {
                  description: `Whether to allow or deny the actions.`,
                  enum: ['Allow', 'Deny'],
                },
                Action: {
                  description: `Service actions this statement applies to.`,
                  $ref: '#/definitions/awsIamPolicyAction',
                },
                NotAction: {
                  description: `Service actions excluded from this statement.`,
                  $ref: '#/definitions/awsIamPolicyAction',
                },
                Principal: { $ref: '#/definitions/awsIamPolicyPrincipal' },
                NotPrincipal: { $ref: '#/definitions/awsIamPolicyPrincipal' },
                Resource: {
                  description: `Resources this statement applies to.`,
                  $ref: '#/definitions/awsResourcePolicyResource',
                },
                NotResource: {
                  description: `Resources excluded from this policy statement.`,
                  $ref: '#/definitions/awsResourcePolicyResource',
                },
                Condition: {
                  description: `Conditions under which this statement applies.`,
                  type: 'object',
                },
              },
              additionalProperties: false,
              allOf: [
                { required: ['Effect'] },
                {
                  oneOf: [
                    { required: ['Action'] },
                    { required: ['NotAction'] },
                  ],
                },
                {
                  oneOf: [
                    { required: ['Resource'] },
                    { required: ['NotResource'] },
                  ],
                },
              ],
            },
          },
          awsResourceTags: {
            description: `AWS resource tags map.
@example
tags:
  Environment: production
  Team: backend
  Project: my-service`,
            type: 'object',
            patternProperties: {
              '^(?!aws:)[\\w./=+:\\-_\\x20]{1,128}$': {
                type: 'string',
                maxLength: 256,
              },
            },
            additionalProperties: false,
          },
          awsS3BucketName: {
            description: `Valid S3 bucket name.`,
            type: 'string',
            // pattern sourced from https://stackoverflow.com/questions/50480924/regex-for-s3-bucket-name
            pattern:
              '(?!^(\\d{1,3}\\.){3}\\d{1,3}$)(^(([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])\\.)*([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$)',
            minLength: 3,
            maxLength: 63,
          },
          ecrImageUri: {
            description: `ECR container image URI.`,
            type: 'string',
            pattern:
              '^\\d+\\.dkr\\.ecr\\.[a-z0-9-]+..amazonaws.com\\/([^@]+)|([^@:]+@sha256:[a-f0-9]{64})$',
          },
          filterPatterns: {
            description: `Event filter pattern for SQS, DynamoDB Streams, Kinesis.`,
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: { type: 'object' },
          },
          awsCustomDomain: {
            description: `Custom domain configuration object.`,
            type: 'object',
            properties: {
              name: { description: `Custom domain name.`, type: 'string' },
              basePath: {
                description: `Base path mapping for the API.`,
                type: 'string',
              },
              certificateName: {
                description: `Certificate name in ACM.`,
                type: 'string',
              },
              certificateArn: {
                description: `ACM certificate ARN.`,
                type: 'string',
              },
              createRoute53Record: {
                description: `Create Route53 A alias record.`,
                type: 'boolean',
              },
              createRoute53IPv6Record: {
                description: `Create Route53 AAAA alias record.`,
                type: 'boolean',
              },
              route53Profile: {
                description: `AWS profile used for Route53 operations.`,
                type: 'string',
              },
              route53Region: {
                description: `Region used for Route53 and ACM lookups.`,
                type: 'string',
              },
              endpointType: {
                description: `API Gateway endpoint type for the domain.`,
                type: 'string',
              },
              apiType: {
                description: `API type for domain mapping.`,
                type: 'string',
              },
              tlsTruststoreUri: {
                description: `S3 URI of the truststore for mutual TLS.`,
                type: 'string',
              },
              tlsTruststoreVersion: {
                description: `S3 version id of the truststore.`,
                type: 'string',
              },
              hostedZoneId: {
                description: `Route53 hosted zone id for DNS records.`,
                type: 'string',
              },
              hostedZonePrivate: {
                description: `Whether the hosted zone is private.`,
                type: 'boolean',
              },
              splitHorizonDns: {
                description: `Enable split-horizon DNS behavior.`,
                type: 'boolean',
              },
              enabled: {
                description: `Enable domain manager execution.`,
                anyOf: [{ type: 'boolean' }, { type: 'string' }],
              },
              securityPolicy: {
                description: `TLS security policy for the domain.`,
                type: 'string',
              },
              accessMode: {
                description: `Endpoint access mode of the domain.`,
                anyOf: ['BASIC', 'STRICT'].map(caseInsensitive),
              },
              autoDomain: {
                description: `Automatically create or update the custom domain.`,
                type: 'boolean',
              },
              autoDomainWaitFor: {
                description: `Wait duration before giving up domain creation.`,
                type: 'string',
              },
              allowPathMatching: {
                description: `Match existing base paths when mapping routes.`,
                type: 'boolean',
              },
              route53Params: {
                description: `Additional Route53 record parameters.`,
                type: 'object',
                additionalProperties: true,
              },
              preserveExternalPathMappings: {
                description: `Keep path mappings not managed by this service.`,
                type: 'boolean',
              },
            },
            additionalProperties: true,
          },
        },
        provider: {
          description: `AWS provider configuration properties.`,
          properties: {
            alb: {
              description: `Application Load Balancer configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/alb`,
              type: 'object',
              properties: {
                targetGroupPrefix: {
                  description: `Prefix for generated ALB target group names.
@example 'myapp'`,
                  type: 'string',
                  maxLength: 16,
                },
                authorizers: {
                  description: `Named ALB authorizer definitions.
@see https://www.serverless.com/framework/docs/providers/aws/events/alb#add-cognitocustom-idp-provider-authentication`,
                  type: 'object',
                  additionalProperties: {
                    anyOf: [oidcAlbAuthorizer, cognitoAlbAuthorizer],
                  },
                },
              },
              additionalProperties: false,
            },
            apiGateway: {
              description: `REST API Gateway (v1) configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway`,
              type: 'object',
              properties: {
                apiKeys: { $ref: '#/definitions/awsApiGatewayApiKeys' },
                apiKeySourceType: {
                  description: `Location where API Gateway reads API keys from.
@default 'HEADER'
@see https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-key-source.html`,
                  anyOf: ['HEADER', 'AUTHORIZER'].map(caseInsensitive),
                },
                binaryMediaTypes: {
                  description: `MIME types treated as binary payloads.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#binary-media-types
@example ['image/*', 'application/pdf']`,
                  type: 'array',
                  items: { type: 'string', pattern: '^\\S+\\/\\S+$' },
                },
                description: {
                  description: `REST API description.`,
                  type: 'string',
                },
                disableDefaultEndpoint: {
                  description: `Disable the default execute-api endpoint.`,
                  type: 'boolean',
                },
                endpoint: {
                  description: `REST API endpoint configuration.`,
                  type: 'object',
                  properties: {
                    securityPolicy: {
                      description: `TLS security policy for custom domain endpoints.`,
                      type: 'string',
                    },
                    accessMode: {
                      description: `Private API endpoint access mode.`,
                      anyOf: ['BASIC', 'STRICT'].map(caseInsensitive),
                    },
                    disable: {
                      description: `Disable endpoint creation for this API.`,
                      type: 'boolean',
                    },
                  },
                  additionalProperties: false,
                },
                metrics: {
                  description: `Enable CloudWatch metrics for API Gateway.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#detailed-cloudwatch-metrics`,
                  type: 'boolean',
                },
                minimumCompressionSize: {
                  description: `Minimum response size in bytes before compression is applied.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#compression
@example 1024`,
                  type: 'integer',
                  minimum: 0,
                  maximum: 10485760,
                },
                resourcePolicy: {
                  description: `Resource policy statements for controlling API access.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#resource-policy
@example
resourcePolicy:
  - Effect: Allow
    Principal: '*'
    Action: execute-api:Invoke
    Resource: execute-api:/*/*/*`,
                  $ref: '#/definitions/awsResourcePolicyStatements',
                },
                restApiId: {
                  description: `Existing REST API identifier.
@example 'abcd1234xy'`,
                  $ref: '#/definitions/awsCfInstruction',
                },
                restApiResources: {
                  description: `Existing REST API resource path-to-id mappings.
@example { '/users': 'abc123' }`,
                  anyOf: [
                    {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          resourceId: { type: 'string' },
                        },
                        required: [],
                        additionalProperties: false,
                      },
                    },
                    { type: 'object' },
                  ],
                },
                restApiRootResourceId: {
                  description: `Root resource id of an existing REST API.`,
                  $ref: '#/definitions/awsCfInstruction',
                },
                request: {
                  description: `Request schema definitions for API Gateway models.`,
                  type: 'object',
                  properties: {
                    schemas: {
                      description: `Named request model schemas.`,
                      type: 'object',
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          schema: {
                            description: `JSON Schema object.`,
                            type: 'object',
                          },
                          name: {
                            description: `Display name for this model.`,
                            type: 'string',
                          },
                          description: {
                            description: `Model description.`,
                            type: 'string',
                          },
                        },
                        required: ['schema'],
                        additionalProperties: false,
                      },
                    },
                  },
                  additionalProperties: false,
                },
                shouldStartNameWithService: {
                  description: `Prefix API name with service name.`,
                  type: 'boolean',
                },
                stage: {
                  description: `Custom stage name for the REST API deployment.`,
                  type: 'string',
                },
                timeoutInMillis: {
                  description: `Integration timeout in milliseconds.`,
                  type: 'integer',
                  minimum: 50,
                },
                usagePlan: {
                  description: `Usage plan definition for this REST API.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#setting-api-keys-for-your-rest-api`,
                  anyOf: [
                    apiGatewayUsagePlan,
                    {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: apiGatewayUsagePlan,
                        maxProperties: 1,
                      },
                    },
                  ],
                },
                websocketApiId: {
                  description: `ID of existing WebSocket API.`,
                  $ref: '#/definitions/awsCfInstruction',
                },
              },
              additionalProperties: false,
            },
            apiName: {
              description: `Custom REST API name.`,
              type: 'string',
            },
            // Accept either a string or an object for provider.domain
            domain: {
              description: `Single custom domain configuration entry.`,
              anyOf: [
                { type: 'string' },
                { $ref: '#/definitions/awsCustomDomain' },
              ],
            },
            // Accept an array of strings/objects, or a single object for provider.domains
            domains: {
              description: `Domain configuration entries for API Gateway custom domains.`,
              anyOf: [
                {
                  type: 'array',
                  items: {
                    anyOf: [
                      { type: 'string' },
                      { $ref: '#/definitions/awsCustomDomain' },
                    ],
                  },
                },
                { $ref: '#/definitions/awsCustomDomain' },
              ],
            },
            architecture: {
              description: `Default Lambda architecture for all functions.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#instruction-set-architecture`,
              $ref: '#/definitions/awsLambdaArchitecture',
            },
            cfnRole: {
              description: `CloudFormation deployment role ARN.
@deprecated Use provider.iam.deploymentRole instead.`,
              $ref: '#/definitions/awsArn',
            },
            cloudFront: {
              description: `CloudFront cache policy configuration for edge/event integrations.
@see https://www.serverless.com/framework/docs/providers/aws/events/cloudfront`,
              type: 'object',
              properties: {
                cachePolicies: {
                  description: `Named CloudFront cache policy definitions.`,
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      Comment: { type: 'string' },
                      DefaultTTL: { type: 'integer', minimum: 0 },
                      MaxTTL: { type: 'integer', minimum: 0 },
                      MinTTL: { type: 'integer', minimum: 0 },
                      ParametersInCacheKeyAndForwardedToOrigin: {
                        description: `Parameters included in the cache key and forwarded to the origin.`,
                        type: 'object',
                        properties: {
                          CookiesConfig: {
                            description: `Cookie forwarding and caching behavior.`,
                            type: 'object',
                            properties: {
                              CookieBehavior: {
                                description: `Cookie inclusion behavior for cache key.`,
                                enum: ['none', 'whitelist', 'allExcept', 'all'],
                              },
                              Cookies: {
                                description: `Cookie names to include in the cache key.`,
                                type: 'array',
                                items: { type: 'string' },
                              },
                            },
                            required: ['CookieBehavior'],
                            additionalProperties: false,
                          },
                          EnableAcceptEncodingBrotli: { type: 'boolean' },
                          EnableAcceptEncodingGzip: { type: 'boolean' },
                          HeadersConfig: {
                            description: `Header forwarding and caching behavior.`,
                            type: 'object',
                            properties: {
                              HeaderBehavior: { enum: ['none', 'whitelist'] },
                              Headers: {
                                description: `Header names to include in the cache key.`,
                                type: 'array',
                                items: { type: 'string' },
                              },
                            },
                            required: ['HeaderBehavior'],
                            additionalProperties: false,
                          },
                          QueryStringsConfig: {
                            description: `Query string forwarding and caching behavior.`,
                            type: 'object',
                            properties: {
                              QueryStringBehavior: {
                                description: `Query string inclusion behavior for cache key.`,
                                enum: ['none', 'whitelist', 'allExcept', 'all'],
                              },
                              QueryStrings: {
                                description: `Query string names to include in the cache key.`,
                                type: 'array',
                                items: { type: 'string' },
                              },
                            },
                            required: ['QueryStringBehavior'],
                            additionalProperties: false,
                          },
                        },
                        required: [
                          'CookiesConfig',
                          'EnableAcceptEncodingGzip',
                          'HeadersConfig',
                          'QueryStringsConfig',
                        ],
                        additionalProperties: false,
                      },
                    },
                    required: [
                      'DefaultTTL',
                      'MaxTTL',
                      'MinTTL',
                      'ParametersInCacheKeyAndForwardedToOrigin',
                    ],
                    additionalProperties: false,
                  },
                },
              },
              additionalProperties: false,
            },
            deploymentBucket: {
              description: `S3 deployment bucket configuration.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#deployment-bucket
@example
deploymentBucket:
  name: my-company-deployments`,
              anyOf: [
                { $ref: '#/definitions/awsS3BucketName' },
                {
                  type: 'object',
                  properties: {
                    blockPublicAccess: {
                      description: `Block all public access settings on the bucket.
@default false`,
                      type: 'boolean',
                    },
                    skipPolicySetup: {
                      description: `Skip automatic deployment bucket policy setup.`,
                      type: 'boolean',
                    },
                    maxPreviousDeploymentArtifacts: {
                      description: `Maximum number of previous deployment artifacts to retain.
@default 5`,
                      type: 'integer',
                      minimum: 0,
                    },
                    name: {
                      description: `Name of an existing deployment bucket.
@example 'my-company-deployments'`,
                      $ref: '#/definitions/awsS3BucketName',
                    },
                    versioning: {
                      description: `Enable bucket versioning.`,
                      type: 'boolean',
                    },
                    serverSideEncryption: {
                      description: `Server-side encryption algorithm.
@example 'AES256'`,
                      enum: ['AES256', 'aws:kms'],
                    },
                    sseCustomerAlgorithim: {
                      description: `SSE-C algorithm.`,
                      type: 'string',
                    },
                    sseCustomerKey: {
                      description: `SSE-C key.`,
                      type: 'string',
                    },
                    sseCustomerKeyMD5: {
                      description: `MD5 digest for the SSE-C key.`,
                      type: 'string',
                    },
                    sseKMSKeyId: {
                      description: `KMS key id used for SSE-KMS encryption.`,
                      type: 'string',
                    },
                    tags: {
                      description: `Deployment bucket resource tags.`,
                      $ref: '#/definitions/awsResourceTags',
                    },
                  },
                  additionalProperties: false,
                },
              ],
            },
            deploymentPrefix: {
              description: `S3 key prefix for deployment artifacts.
@default 'serverless'`,
              type: 'string',
            },
            disableRollback: {
              description: `Disable automatic CloudFormation rollback on failure.
@default false`,
              type: 'boolean',
            },
            endpointType: {
              description: `REST API Gateway endpoint type.
@default 'edge'
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#configuring-endpoint-types`,
              anyOf: ['REGIONAL', 'EDGE', 'PRIVATE'].map(caseInsensitive),
            },
            environment: {
              description: `Default environment variables for all functions.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#environment-variables`,
              $ref: '#/definitions/awsLambdaEnvironment',
            },
            eventBridge: {
              description: `EventBridge provider-level configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/event-bridge`,
              type: 'object',
              properties: {
                useCloudFormation: {
                  description: `Use CloudFormation for EventBridge rules instead of direct AWS API.
@default true`,
                  type: 'boolean',
                },
              },
              additionalProperties: false,
            },
            httpApi: {
              description: `HTTP API Gateway (v2) configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api
@example
httpApi:
  cors: true
  authorizers:
    myAuthorizer:
      type: jwt
      identitySource: $request.header.Authorization
      issuerUrl: https://example.com/
      audience:
        - my-audience`,
              type: 'object',
              properties: {
                authorizers: {
                  description: `Named HTTP API authorizer definitions.
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api#jwt-authorizers`,
                  type: 'object',
                  additionalProperties: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          type: {
                            description: `Authorizer type discriminator.`,
                            const: 'jwt',
                          },
                          name: {
                            description: `Logical authorizer name.`,
                            type: 'string',
                          },
                          identitySource: {
                            description: `JWT identity source expression.`,
                            $ref: '#/definitions/awsCfInstruction',
                          },
                          issuerUrl: {
                            description: `JWT issuer URL.`,
                            $ref: '#/definitions/awsCfInstruction',
                          },
                          audience: {
                            description: `JWT audience values.`,
                            anyOf: [
                              { $ref: '#/definitions/awsCfInstruction' },
                              {
                                type: 'array',
                                items: {
                                  $ref: '#/definitions/awsCfInstruction',
                                },
                              },
                            ],
                          },
                        },
                        required: ['identitySource', 'issuerUrl', 'audience'],
                        additionalProperties: false,
                      },
                      {
                        type: 'object',
                        properties: {
                          type: {
                            description: `Authorizer type discriminator.`,
                            const: 'request',
                          },
                          name: {
                            description: `Logical authorizer name.`,
                            type: 'string',
                          },
                          functionName: {
                            description: `Authorizer function name in this service.`,
                            type: 'string',
                          },
                          functionArn: {
                            description: `ARN of an external authorizer function.`,
                            $ref: '#/definitions/awsCfInstruction',
                          },
                          managedExternally: {
                            description: `Mark authorizer as externally managed.`,
                            type: 'boolean',
                          },
                          resultTtlInSeconds: {
                            description: `Authorizer cache TTL in seconds.
@default 300`,
                            type: 'integer',
                            minimum: 0,
                            maximum: 3600,
                          },
                          enableSimpleResponses: {
                            description: `Enable simple response format.`,
                            type: 'boolean',
                          },
                          payloadVersion: {
                            description: `Lambda authorizer payload format version.`,
                            $ref: '#/definitions/awsHttpApiPayload',
                          },
                          identitySource: {
                            description: `Identity sources that contribute to cache key.
@default '$request.header.Authorization'`,
                            anyOf: [
                              { $ref: '#/definitions/awsCfInstruction' },
                              {
                                type: 'array',
                                items: {
                                  $ref: '#/definitions/awsCfInstruction',
                                },
                              },
                            ],
                          },
                        },
                        required: ['type'],
                      },
                    ],
                  },
                },
                cors: {
                  description: `CORS settings for HTTP API routes.
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api#cors-setup
@example
cors:
  allowedOrigins:
    - https://example.com
  allowedHeaders:
    - Content-Type
    - Authorization
  allowedMethods:
    - GET
    - POST`,
                  anyOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        allowCredentials: {
                          description: `Allow credentials in cross-origin requests.`,
                          type: 'boolean',
                        },
                        allowedHeaders: {
                          description: `Allowed request headers.`,
                          type: 'array',
                          items: { type: 'string' },
                        },
                        allowedMethods: {
                          description: `Allowed HTTP methods.`,
                          type: 'array',
                          items: { type: 'string' },
                        },
                        allowedOrigins: {
                          description: `Allowed origin domains.
@example ['https://example.com']`,
                          type: 'array',
                          items: { type: 'string' },
                        },
                        exposedResponseHeaders: {
                          description: `Headers exposed to browsers.`,
                          type: 'array',
                          items: { type: 'string' },
                        },
                        maxAge: {
                          description: `Preflight cache duration in seconds.
@example 86400`,
                          type: 'integer',
                          minimum: 0,
                        },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
                id: {
                  description: `Existing HTTP API id.`,
                  anyOf: [
                    { type: 'string' },
                    { $ref: '#/definitions/awsCfImportLocallyResolvable' },
                  ],
                },
                name: { description: `Custom HTTP API name.`, type: 'string' },
                payload: {
                  description: `Default payload format version.
@default '2.0'
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api#event-payload-format
@example '1.0'`,
                  type: 'string',
                },
                metrics: {
                  description: `Enable CloudWatch metrics for HTTP API.
@default false
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api#detailed-metrics`,
                  type: 'boolean',
                },
                useProviderTags: {
                  description: `Inherit provider tags for HTTP API resources.`,
                  const: true,
                },
                disableDefaultEndpoint: {
                  description: `Disable the default execute-api endpoint.`,
                  type: 'boolean',
                },
                shouldStartNameWithService: {
                  description: `Prefix HTTP API name with service name.`,
                  type: 'boolean',
                },
              },
              additionalProperties: false,
            },
            iam: {
              description: `IAM configuration for Lambda execution and deployment roles.
@see https://www.serverless.com/framework/docs/providers/aws/guide/iam
@example
iam:
  role:
    statements:
      - Effect: Allow
        Action:
          - dynamodb:Query
          - dynamodb:Scan
        Resource: arn:aws:dynamodb:*:*:table/my-table`,
              type: 'object',
              properties: {
                role: {
                  description: `Execution role ARN or role configuration object.`,
                  anyOf: [
                    { $ref: '#/definitions/awsLambdaRole' },
                    {
                      type: 'object',
                      properties: {
                        mode: {
                          description: `IAM role management mode.`,
                          enum: ['shared', 'perFunction'],
                        },
                        name: {
                          description: `Custom IAM role name.`,
                          type: 'string',
                          pattern: '^[A-Za-z0-9/_+=,.@-]{1,64}$',
                        },
                        path: {
                          description: `IAM role path.`,
                          type: 'string',
                          pattern: '(^\\/$)|(^\\/[\u0021-\u007f]+\\/$)',
                        },
                        managedPolicies: {
                          description: `Managed policy ARNs attached to this role.`,
                          type: 'array',
                          items: { $ref: '#/definitions/awsArn' },
                        },
                        statements: {
                          description: `Inline IAM statements attached to this role.
@see https://www.serverless.com/framework/docs/providers/aws/guide/iam#the-default-iam-role
@see https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html`,
                          $ref: '#/definitions/awsIamPolicyStatements',
                        },
                        permissionBoundary: {
                          description: `Legacy permission boundary property name.
@deprecated Use permissionsBoundary instead.`,
                          $ref: '#/definitions/awsArn',
                        },
                        permissionsBoundary: {
                          description: `Permissions boundary ARN.
@see https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html`,
                          $ref: '#/definitions/awsArn',
                        },
                        tags: {
                          description: `Tags applied to the IAM role.`,
                          $ref: '#/definitions/awsResourceTags',
                        },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
                deploymentRole: {
                  description: `IAM role assumed by CloudFormation during deployment.`,
                  $ref: '#/definitions/awsArn',
                },
              },
              additionalProperties: false,
            },
            iamManagedPolicies: {
              description: `Managed policy ARNs attached to the default execution role.
@deprecated Use provider.iam.role.managedPolicies instead.`,
              type: 'array',
              items: { $ref: '#/definitions/awsArn' },
            },
            iamRoleStatements: {
              description: `Inline IAM statements attached to the default execution role.
@deprecated Use provider.iam.role.statements instead.`,
              $ref: '#/definitions/awsIamPolicyStatements',
            },
            ecr: {
              description: `ECR image build configuration for container-based Lambda functions.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#docker-image-deployments-in-ecr`,
              type: 'object',
              properties: {
                scanOnPush: {
                  description: `Enable ECR vulnerability scanning on image push.`,
                  type: 'boolean',
                },
                images: {
                  description: `Named local image build definitions.`,
                  type: 'object',
                  patternProperties: {
                    [imageNamePattern]: {
                      anyOf: [
                        {
                          type: 'object',
                          properties: {
                            uri: {
                              description: `Fully qualified prebuilt ECR image URI.`,
                              $ref: '#/definitions/ecrImageUri',
                            },
                            path: {
                              description: `Directory containing Docker build context.`,
                              type: 'string',
                            },
                            file: {
                              description: `Dockerfile path relative to build context.`,
                              type: 'string',
                            },
                            buildArgs: {
                              description: `Docker build arguments.`,
                              type: 'object',
                              additionalProperties: { type: 'string' },
                            },
                            buildOptions: {
                              description: `Additional docker build options.`,
                              type: 'array',
                              items: { type: 'string' },
                            },
                            cacheFrom: {
                              description: `Images used as build cache sources.`,
                              type: 'array',
                              items: { type: 'string' },
                            },
                            platform: {
                              description: `Image platform target, for example linux/arm64.`,
                              type: 'string',
                            },
                            provenance: {
                              description: `Build provenance mode.`,
                              type: 'string',
                            },
                          },
                          additionalProperties: false,
                        },
                        {
                          type: 'string',
                        },
                      ],
                    },
                  },
                },
              },
              required: ['images'],
              additionalProperties: false,
            },
            kmsKeyArn: {
              description: `KMS key ARN used to encrypt Lambda environment variables.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#kms-keys
@example 'arn:aws:kms:us-east-1:123456789:key/abc-123'`,
              $ref: '#/definitions/awsKmsArn',
            },
            lambdaHashingVersion: {
              description: `Lambda artifact hashing strategy.
@deprecated No longer needed in v4.`,
              type: 'string',
              enum: ['20200924', '20201221'],
            },
            layers: {
              description: `Default Lambda layers for all functions.
@see https://www.serverless.com/framework/docs/providers/aws/guide/layers
@example
layers:
  - arn:aws:lambda:us-east-1:123456789:layer:my-layer:1`,
              $ref: '#/definitions/awsLambdaLayers',
            },
            capacityProviders: {
              description: `Lambda capacity provider definitions.
@since v4`,
              type: 'object',
              additionalProperties: {
                $ref: '#/definitions/awsLambdaCapacityProviderConfig',
              },
            },
            logRetentionInDays: {
              description: `Default CloudWatch Logs retention period in days.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources
@example 14`,
              $ref: '#/definitions/awsLogRetentionInDays',
            },
            logDataProtectionPolicy: {
              description: `CloudWatch Logs data protection policy document.`,
              $ref: '#/definitions/awsLogDataProtectionPolicy',
            },
            logs: {
              description: `CloudWatch logging configuration for Lambda, REST API, HTTP API, and WebSocket API.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#logs
@example
logs:
  restApi:
    accessLogging: true
    executionLogging: true
    level: INFO
  httpApi: true`,
              type: 'object',
              properties: {
                frameworkLambda: {
                  description: `Enable or disable Serverless Framework internal Lambda logging.`,
                  type: 'boolean',
                },
                lambda: {
                  description: `Default logging configuration for Lambda functions.`,
                  $ref: '#/definitions/awsLambdaLoggingConfiguration',
                },
                httpApi: {
                  description: `HTTP API logging configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/http-api#access-logs
@see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html`,
                  anyOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        format: {
                          description: `Access log format string.`,
                          type: 'string',
                        },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
                restApi: {
                  description: `REST API CloudWatch logging configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#logs
@see https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html`,
                  anyOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        accessLogging: {
                          description: `Enable access logs.`,
                          type: 'boolean',
                        },
                        executionLogging: {
                          description: `Enable execution logs.`,
                          type: 'boolean',
                        },
                        format: {
                          description: `Access log format string.`,
                          type: 'string',
                        },
                        fullExecutionData: {
                          description: `Include full request/response data in execution logs.`,
                          type: 'boolean',
                        },
                        level: {
                          description: `Execution log level.`,
                          enum: ['INFO', 'ERROR'],
                        },
                        role: {
                          description: `IAM role ARN used by API Gateway for log delivery.`,
                          $ref: '#/definitions/awsArn',
                        },
                        roleManagedExternally: {
                          description: `Set true when the log delivery role is managed outside the service.`,
                          type: 'boolean',
                        },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
                websocket: {
                  description: `WebSocket API logging configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/websocket#logs`,
                  anyOf: [
                    { type: 'boolean' },
                    {
                      type: 'object',
                      properties: {
                        accessLogging: {
                          description: `Enable access logs.`,
                          type: 'boolean',
                        },
                        executionLogging: {
                          description: `Enable execution logs.`,
                          type: 'boolean',
                        },
                        format: {
                          description: `Access log format string.`,
                          type: 'string',
                        },
                        fullExecutionData: {
                          description: `Include full request/response data in execution logs.`,
                          type: 'boolean',
                        },
                        level: {
                          description: `Execution log level.`,
                          enum: ['INFO', 'ERROR'],
                        },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
              },
            },
            memorySize: {
              description: `Default Lambda memory size in MB (128-10240).
@default 1024`,
              $ref: '#/definitions/awsLambdaMemorySize',
            },
            notificationArns: {
              description: `SNS topic ARNs for CloudFormation stack notifications.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#general-settings
@example ['arn:aws:sns:us-east-1:123456789:my-topic']`,
              type: 'array',
              items: { $ref: '#/definitions/awsArnString' },
            },
            profile: {
              description: `AWS shared credentials profile name.
@see https://www.serverless.com/framework/docs/providers/aws/guide/credentials
@example 'my-company-profile'`,
              type: 'string',
            },
            region: {
              description: `AWS region for deployment.
@default 'us-east-1'
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#general-settings
@see https://docs.aws.amazon.com/general/latest/gr/lambda-service.html
@example us-east-1`,
              enum: [
                'us-east-1',
                'us-east-2',
                'us-gov-east-1',
                'us-gov-west-1',
                'us-iso-east-1',
                'us-iso-west-1',
                'us-isob-east-1',
                'us-west-1',
                'us-west-2',
                'af-south-1',
                'ap-east-1',
                'ap-east-2',
                'ap-northeast-1',
                'ap-northeast-2',
                'ap-northeast-3',
                'ap-south-1',
                'ap-south-2',
                'ap-southeast-1',
                'ap-southeast-2',
                'ap-southeast-3',
                'ap-southeast-4',
                'ap-southeast-5',
                'ap-southeast-6',
                'ap-southeast-7',
                'ca-central-1',
                'ca-west-1',
                'cn-north-1',
                'cn-northwest-1',
                'eu-central-1',
                'eu-central-2',
                'eu-north-1',
                'eu-south-1',
                'eu-south-2',
                'eu-west-1',
                'eu-west-2',
                'eu-west-3',
                'il-central-1',
                'me-central-1',
                'me-south-1',
                'sa-east-1',
                'mx-central-1',
              ],
            },
            resolver: {
              description: `Custom variable resolver name.`,
              type: 'string',
            },
            role: {
              description: `Default Lambda execution role ARN or reference.
@deprecated Use provider.iam.role instead.`,
              $ref: '#/definitions/awsLambdaRole',
            },
            rolePermissionsBoundary: {
              description: `Permissions boundary ARN for the default execution role.
@deprecated Use provider.iam.role.permissionsBoundary instead.`,
              $ref: '#/definitions/awsArnString',
            },
            rollbackConfiguration: {
              description: `CloudFormation rollback trigger configuration.
@see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-rollback-triggers.html`,
              type: 'object',
              properties: {
                RollbackTriggers: {
                  description: `CloudWatch Alarms that trigger an automatic rollback.`,
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      Arn: { $ref: '#/definitions/awsArnString' },
                      Type: { const: 'AWS::CloudWatch::Alarm' },
                    },
                    additionalProperties: false,
                    required: ['Arn', 'Type'],
                  },
                },
                MonitoringTimeInMinutes: { type: 'integer', minimum: 0 },
              },
              additionalProperties: false,
            },
            runtime: {
              description: `Default Lambda runtime.`,
              $ref: '#/definitions/awsLambdaRuntime',
            },
            runtimeManagement: {
              description: `Default Lambda runtime management mode.`,
              $ref: '#/definitions/awsLambdaRuntimeManagement',
            },
            build: {
              description: `Provider-level build strategy.
@since v4`,
              type: 'string',
            },
            deploymentMethod: {
              description: `CloudFormation deployment strategy.
@default 'direct'
@see https://www.serverless.com/framework/docs/providers/aws/guide/deploying#deployment-method`,
              enum: ['changesets', 'direct'],
            },
            enableLegacyDeploymentBucket: {
              description: `Use legacy stack-managed deployment bucket behavior.
@since v4`,
              type: 'boolean',
            },
            s3: {
              description: `Named S3 bucket definitions for reuse from function \`s3\` events.
@see https://www.serverless.com/framework/docs/providers/aws/events/s3`,
              type: 'object',
              additionalProperties: awsS3ConfigSchema,
            },
            stage: {
              description: `Default deployment stage.
@default 'dev'
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml#general-settings`,
              $ref: '#/definitions/stage',
            },
            stackName: {
              description: `Custom CloudFormation stack name.
@example my-service-prod`,
              type: 'string',
              pattern: '^[a-zA-Z][a-zA-Z0-9-]*$',
              maxLength: 128,
            },
            stackParameters: {
              description: `CloudFormation stack parameter overrides.
@see https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml`,
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ParameterKey: { type: 'string' },
                  ParameterValue: { type: 'string' },
                  UsePreviousValue: { type: 'boolean' },
                  ResolvedValue: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            stackPolicy: {
              description: `CloudFormation stack policy statements.
@see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/protect-stack-resources.html
@example
stackPolicy:
  - Effect: Allow
    Principal: '*'
    Action: 'Update:*'
    Resource: '*'`,
              $ref: '#/definitions/awsIamPolicyStatements',
            },
            stackTags: {
              description: `Tags applied to CloudFormation stack resources.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#tags-stack-tags`,
              $ref: '#/definitions/awsResourceTags',
            },
            tags: {
              description: `Tags applied to Lambda functions and supporting resources.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#tags`,
              $ref: '#/definitions/awsResourceTags',
            },
            timeout: {
              description: `Default Lambda timeout in seconds (1-900).
@default 6`,
              $ref: '#/definitions/awsLambdaTimeout',
            },
            tracing: {
              description: `X-Ray tracing settings for Lambda and API Gateway.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#aws-x-ray-tracing
@example
tracing:
  apiGateway: true
  lambda: true`,
              type: 'object',
              properties: {
                apiGateway: {
                  description: `Enable tracing on API Gateway stages.
@see https://www.serverless.com/framework/docs/providers/aws/events/apigateway#aws-x-ray-tracing`,
                  type: 'boolean',
                },
                lambda: {
                  description: `Lambda tracing mode.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#aws-x-ray-tracing`,
                  $ref: '#/definitions/awsLambdaTracing',
                },
              },
              additionalProperties: false,
            },
            vpc: {
              description: `Default VPC networking settings for Lambda functions.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#vpc-configuration`,
              $ref: '#/definitions/awsLambdaVpcConfig',
            },
            vpcEndpointIds: {
              description: `VPC endpoint ids used by private API Gateway endpoints.`,
              $ref: '#/definitions/awsCfArrayInstruction',
            },
            versionFunctions: {
              description: `Whether to create and manage Lambda versions by default.
@default true
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#versioning-deployed-functions`,
              $ref: '#/definitions/awsLambdaVersioning',
            },
            websocket: {
              description: `WebSocket API provider options.
@see https://www.serverless.com/framework/docs/providers/aws/events/websocket`,
              type: 'object',
              properties: {
                useProviderTags: {
                  description: `Apply provider.tags to WebSocket resources.`,
                  type: 'boolean',
                },
              },
              additionalProperties: false,
            },
            websocketsApiName: {
              description: `Custom WebSocket API name.`,
              type: 'string',
            },
            kinesis: {
              description: `Kinesis stream integration settings.`,
              type: 'object',
              properties: {
                consumerNamingMode: {
                  description: `Kinesis consumer naming mode.`,
                  const: 'serviceSpecific',
                },
              },
              additionalProperties: false,
            },
            websocketsApiRouteSelectionExpression: {
              description: `WebSocket route selection expression.
@default '$request.body.action'`,
              type: 'string',
            },
            websocketsDescription: {
              description: `WebSocket API description.`,
              type: 'string',
            },
          },
        },
        function: {
          description: `AWS Lambda function configuration properties.`,
          properties: {
            architecture: {
              description: `Function-level Lambda architecture override.`,
              $ref: '#/definitions/awsLambdaArchitecture',
            },
            awsKmsKeyArn: {
              description: `Function-level KMS key ARN.
@deprecated Use kmsKeyArn instead.`,
              $ref: '#/definitions/awsKmsArn',
            },
            condition: {
              description: `CloudFormation condition controlling function resource creation.`,
              $ref: '#/definitions/awsResourceCondition',
            },
            dependsOn: {
              description: `CloudFormation resource dependencies for the function.`,
              $ref: '#/definitions/awsResourceDependsOn',
            },
            description: {
              description: `Function description shown in Lambda console.`,
              type: 'string',
              maxLength: 256,
            },
            destinations: {
              description: `Lambda destination configuration for asynchronous invocation outcomes.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#destinations
@example
destinations:
  onSuccess: arn:aws:sns:us-east-1:123456789012:my-topic
  onFailure: arn:aws:sqs:us-east-1:123456789012:my-dlq`,
              type: 'object',
              properties: {
                onSuccess: {
                  description: `Destination for successful asynchronous invocations.`,
                  anyOf: [
                    { type: 'string', minLength: 1 },
                    {
                      type: 'object',
                      properties: {
                        arn: { $ref: '#/definitions/awsCfFunction' },
                        type: { enum: ['function', 'sns', 'sqs', 'eventBus'] },
                      },
                      additionalProperties: false,
                      required: ['arn', 'type'],
                    },
                  ],
                },
                onFailure: {
                  description: `Destination for failed asynchronous invocations.`,
                  anyOf: [
                    { type: 'string', minLength: 1 },
                    {
                      type: 'object',
                      properties: {
                        arn: { $ref: '#/definitions/awsCfFunction' },
                        type: { enum: ['function', 'sns', 'sqs', 'eventBus'] },
                      },
                      additionalProperties: false,
                      required: ['arn', 'type'],
                    },
                  ],
                },
              },
              additionalProperties: false,
            },
            disableLogs: {
              description: `Disable creation of default CloudWatch log group for this function.`,
              type: 'boolean',
            },
            environment: {
              description: `Function-level environment variables.`,
              $ref: '#/definitions/awsLambdaEnvironment',
            },
            ephemeralStorageSize: {
              description: `Ephemeral storage size in MB for /tmp (512-10240).
@default 512
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#ephemeral-storage`,
              type: 'integer',
              minimum: 512,
              maximum: 10240,
            },
            fileSystemConfig: {
              description: `EFS access point mount configuration.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#efs-configuration`,
              type: 'object',
              properties: {
                arn: {
                  description: `EFS access point ARN.`,
                  anyOf: [
                    {
                      type: 'string',
                      pattern:
                        '^arn:aws[a-zA-Z-]*:elasticfilesystem:[a-z]{2}((-gov)|(-iso(b?)))?-[a-z]+-[1-9]{1}:[0-9]{12}:access-point/fsap-[a-f0-9]{17}$',
                    },
                    { $ref: '#/definitions/awsCfGetAtt' },
                    { $ref: '#/definitions/awsCfJoin' },
                    { $ref: '#/definitions/awsCfImport' },
                  ],
                },
                localMountPath: {
                  description: `Local mount path in the Lambda function (/mnt/...).`,
                  type: 'string',
                  pattern: '^/mnt/[a-zA-Z0-9-_.]+$',
                },
              },
              additionalProperties: false,
              required: ['localMountPath', 'arn'],
            },
            handler: {
              description: `Function handler entrypoint.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#configuration
@example handler: handler.hello`,
              type: 'string',
            },
            image: {
              description: `Container image configuration.`,
              anyOf: [
                { $ref: '#/definitions/ecrImageUri' },
                {
                  type: 'string',
                  pattern: imageNamePattern,
                },
                {
                  type: 'object',
                  properties: {
                    name: {
                      description: `Name of the local image definition in provider.ecr.images.`,
                      type: 'string',
                      pattern: imageNamePattern,
                    },
                    uri: {
                      description: `Fully qualified ECR image URI.`,
                      $ref: '#/definitions/ecrImageUri',
                    },
                    workingDirectory: {
                      description: `Container working directory override.`,
                      type: 'string',
                    },
                    command: {
                      description: `Container command override.`,
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    entryPoint: {
                      description: `Container entrypoint override.`,
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                  additionalProperties: false,
                },
              ],
            },
            kmsKeyArn: {
              description: `KMS key ARN for function environment encryption.`,
              $ref: '#/definitions/awsKmsArn',
            },
            snapStart: {
              description: `Enable Lambda SnapStart.
@since v4`,
              type: 'boolean',
            },
            layers: {
              description: `Function-level Lambda layers.`,
              $ref: '#/definitions/awsLambdaLayers',
            },
            logRetentionInDays: {
              description: `CloudWatch Logs retention period in days for this function.`,
              $ref: '#/definitions/awsLogRetentionInDays',
            },
            logDataProtectionPolicy: {
              description: `CloudWatch Logs data protection policy for this function log group.`,
              $ref: '#/definitions/awsLogDataProtectionPolicy',
            },
            logs: {
              description: `Function-level structured logging configuration.`,
              $ref: '#/definitions/awsLambdaLoggingConfiguration',
            },
            maximumEventAge: {
              description: `Maximum age in seconds for async events before discard (60-21600).`,
              type: 'integer',
              minimum: 60,
              maximum: 21600,
            },
            maximumRetryAttempts: {
              description: `Maximum retry attempts for async invocations (0-2).`,
              type: 'integer',
              minimum: 0,
              maximum: 2,
            },
            memorySize: {
              description: `Function-level memory size in MB.`,
              $ref: '#/definitions/awsLambdaMemorySize',
            },
            onError: {
              description: `Dead-letter destination for failed asynchronous invocations.`,
              anyOf: [
                { type: 'string', pattern: '^arn:aws[a-z-]*:sns' },
                { $ref: '#/definitions/awsCfFunction' },
              ],
            },
            package: {
              description: `Function-level packaging overrides.
@see https://www.serverless.com/framework/docs/providers/aws/guide/packaging`,
              type: 'object',
              properties: {
                artifact: { type: 'string' },
                exclude: { type: 'array', items: { type: 'string' } },
                include: { type: 'array', items: { type: 'string' } },
                individually: { type: 'boolean' },
                patterns: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: false,
            },
            provisionedConcurrency: cfValue({
              description: `Provisioned concurrency settings for this function.`,
              anyOf: [
                { type: 'integer', minimum: 0 },
                {
                  type: 'object',
                  properties: {
                    executions: { type: 'integer', minimum: 0 },
                    alias: { type: 'string' },
                  },
                  required: ['executions'],
                  additionalProperties: false,
                },
              ],
            }),
            reservedConcurrency: cfValue({
              description: `Reserved concurrency limit for this function.`,
              type: 'integer',
              minimum: 0,
            }),
            role: {
              description: `Function execution role.`,
              $ref: '#/definitions/awsLambdaRole',
            },
            runtime: {
              description: `Function runtime override.`,
              $ref: '#/definitions/awsLambdaRuntime',
            },
            build: {
              description: `Function-level build strategy.
@since v4`,
              type: 'string',
            },
            runtimeManagement: {
              description: `Function-level runtime management mode.`,
              $ref: '#/definitions/awsLambdaRuntimeManagement',
            },
            tags: {
              description: `Function-level resource tags.`,
              $ref: '#/definitions/awsResourceTags',
            },
            tenancy: {
              description: `Lambda tenancy configuration.
@since v4`,
              $ref: '#/definitions/awsLambdaTenancy',
            },
            durableConfig: {
              description: `Lambda durable execution settings.
@since v4`,
              $ref: '#/definitions/awsLambdaDurableConfig',
            },
            capacityProvider: {
              description: `Capacity provider assignment for this function.
@since v4`,
              anyOf: [
                { type: 'string' },
                { $ref: '#/definitions/awsCfFunction' },
                {
                  $ref: '#/definitions/awsLambdaCapacityProviderFunctionConfig',
                },
              ],
            },
            timeout: {
              description: `Function timeout in seconds.`,
              $ref: '#/definitions/awsLambdaTimeout',
            },
            tracing: {
              description: `Function-level X-Ray tracing mode.`,
              $ref: '#/definitions/awsLambdaTracing',
            },
            url: {
              description: `Lambda Function URL configuration.
@see https://www.serverless.com/framework/docs/providers/aws/guide/functions#lambda-function-urls`,
              anyOf: [
                { type: 'boolean' },
                {
                  type: 'object',
                  properties: {
                    authorizer: {
                      description: `Function URL authorizer type.`,
                      type: 'string',
                      enum: ['aws_iam'],
                    },
                    cors: {
                      description: `CORS configuration for the Function URL.`,
                      anyOf: [
                        { type: 'boolean' },
                        {
                          type: 'object',
                          properties: {
                            allowCredentials: {
                              description: `Allow credentials in cross-origin requests.`,
                              type: 'boolean',
                            },
                            allowedHeaders: {
                              description: `Allowed request headers.`,
                              type: 'array',
                              minItems: 1,
                              maxItems: 100,
                              items: { type: 'string' },
                            },
                            allowedMethods: {
                              description: `Allowed HTTP methods.`,
                              type: 'array',
                              minItems: 1,
                              maxItems: 6,
                              items: { type: 'string' },
                            },
                            allowedOrigins: {
                              description: `Allowed origin domains.`,
                              type: 'array',
                              minItems: 1,
                              maxItems: 100,
                              items: { type: 'string' },
                            },
                            exposedResponseHeaders: {
                              description: `Response headers exposed to browsers.`,
                              type: 'array',
                              minItems: 1,
                              maxItems: 100,
                              items: { type: 'string' },
                            },
                            maxAge: {
                              description: `Preflight cache duration in seconds.`,
                              type: 'integer',
                              minimum: 0,
                            },
                          },
                          additionalProperties: false,
                        },
                      ],
                    },
                    invokeMode: {
                      description: `Function URL invoke mode.`,
                      type: 'string',
                      enum: ['BUFFERED', 'RESPONSE_STREAM'],
                    },
                  },
                  additionalProperties: false,
                },
              ],
            },
            versionFunction: {
              description: `Enable or disable versioning for this function.`,
              $ref: '#/definitions/awsLambdaVersioning',
            },
            vpc: {
              description: `Function-level VPC networking settings.`,
              $ref: '#/definitions/awsLambdaVpcConfig',
            },
            httpApi: {
              description: `Function-level HTTP API event defaults.`,
              type: 'object',
              properties: {
                payload: {
                  description: `Default HTTP API payload format for this function.`,
                  $ref: '#/definitions/awsHttpApiPayload',
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        layers: {
          description: `Layer definitions for AWS Lambda layers.`,
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              allowedAccounts: {
                description: `AWS accounts allowed to access the published layer version.`,
                type: 'array',
                items: {
                  type: 'string',
                  pattern:
                    '^(\\d{12}|\\*|arn:(aws[a-zA-Z-]*):iam::\\d{12}:root)$',
                },
              },
              compatibleArchitectures: {
                description: `Architectures supported by the layer.`,
                type: 'array',
                items: { $ref: '#/definitions/awsLambdaArchitecture' },
                maxItems: 2,
              },
              compatibleRuntimes: {
                description: `Lambda runtimes compatible with this layer.`,
                type: 'array',
                items: { $ref: '#/definitions/awsLambdaRuntime' },
                maxItems: 15,
              },
              description: {
                description: `Layer description.`,
                type: 'string',
                maxLength: 256,
              },
              licenseInfo: {
                description: `Layer license information string.`,
                type: 'string',
                maxLength: 512,
              },
              name: {
                description: `Layer name or full layer ARN prefix.`,
                type: 'string',
                minLength: 1,
                maxLength: 140,
                pattern:
                  '^((arn:[a-zA-Z0-9-]+:lambda:[a-zA-Z0-9-]+:\\d{12}:layer:[a-zA-Z0-9-_]+)|[a-zA-Z0-9-_]+)$',
              },
              package: {
                description: `Layer packaging configuration.`,
                type: 'object',
                properties: {
                  artifact: {
                    description: `Path to prebuilt layer artifact zip.`,
                    type: 'string',
                  },
                  exclude: {
                    description: `Legacy exclude globs for layer packaging.`,
                    type: 'array',
                    items: { type: 'string' },
                  },
                  include: {
                    description: `Legacy include globs for layer packaging.`,
                    type: 'array',
                    items: { type: 'string' },
                  },
                  patterns: {
                    description: `Include/exclude glob patterns for layer packaging.`,
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                additionalProperties: false,
              },
              path: {
                description: `Directory containing layer source files.`,
                type: 'string',
              },
              retain: {
                description: `Retain previous layer versions on stack updates.`,
                type: 'boolean',
              },
            },
            additionalProperties: false,
          },
        },
        resources: {
          description: `CloudFormation template extensions merged into the generated stack.`,
          type: 'object',
          properties: {
            AWSTemplateFormatVersion: {
              description: `CloudFormation template format version.`,
              type: 'string',
            },
            Conditions: {
              description: `CloudFormation condition definitions.
@see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/conditions-section-structure.html`,
              type: 'object',
            },
            Description: {
              description: `CloudFormation template description.`,
              type: 'string',
            },
            Mappings: {
              description: `CloudFormation mapping definitions.`,
              type: 'object',
            },
            Metadata: {
              description: `CloudFormation template metadata block.`,
              type: 'object',
            },
            // According to https://s3.amazonaws.com/cfn-resource-specifications-us-east-1-prod/schemas/2.15.0/all-spec.json
            // `Outputs` is just an "object", though it seems like this is under-specifying that section a bit.
            // See also https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html
            Outputs: {
              description: `CloudFormation outputs section.
@see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html`,
              type: 'object',
            },
            Parameters: {
              description: `CloudFormation parameters section.`,
              type: 'object',
            },
            // Not replicating the full JSON schema from https://s3.amazonaws.com/cfn-resource-specifications-us-east-1-prod/schemas/2.15.0/all-spec.json
            // as that gets into the specifics for each resource type.
            //
            // The only required attribute is `Type`; `Properties` and other common attributes are optional.
            // See also https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resources-section-structure.html
            Resources: {
              description: `Additional CloudFormation resources and transform macros.
@see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resources-section-structure.html`,
              type: 'object',
              properties: {
                'Fn::Transform': {
                  description: `CloudFormation transform declaration.`,
                  type: 'object',
                  properties: {
                    Name: { description: `Transform name.`, type: 'string' },
                    Parameters: {
                      description: `Transform parameters.`,
                      type: 'object',
                    },
                  },
                  required: ['Name'],
                  additionalProperties: false,
                },
              },
              // Consolidated pattern to support both Resource names and Fn::ForEach macros
              // This is necessary because json-schema-to-typescript (used in @serverless/typescript repo) has a limitation where it only supports a single patternProperty
              // See: https://github.com/bcherny/json-schema-to-typescript/pull/144
              patternProperties: {
                '^([a-zA-Z0-9]{1,255}|Fn::ForEach::[a-zA-Z0-9]+)$': {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        Type: {
                          description: `CloudFormation resource type.`,
                          type: 'string',
                        },
                        Properties: {
                          description: `CloudFormation resource properties.`,
                          type: 'object',
                        },
                        CreationPolicy: {
                          description: `CreationPolicy attribute.`,
                          type: 'object',
                        },
                        DeletionPolicy: {
                          description: `DeletionPolicy attribute.`,
                          type: 'string',
                        },
                        DependsOn: {
                          description: `DependsOn attribute.`,
                          $ref: '#/definitions/awsResourceDependsOn',
                        },
                        Metadata: {
                          description: `Metadata attribute.`,
                          type: 'object',
                        },
                        UpdatePolicy: {
                          description: `UpdatePolicy attribute.`,
                          type: 'object',
                        },
                        UpdateReplacePolicy: {
                          description: `UpdateReplacePolicy attribute.`,
                          type: 'string',
                        },
                        Condition: {
                          description: `Condition attribute.`,
                          $ref: '#/definitions/awsResourceCondition',
                        },
                      },
                      required: ['Type'],
                      additionalProperties: false,
                    },
                    {
                      $ref: '#/definitions/awsCfForEach',
                    },
                  ],
                },
              },
              additionalProperties: false,
            },
            Transform: {
              description: `CloudFormation transforms list.`,
              type: 'array',
              items: { type: 'string' },
            },
            extensions: {
              description: `Resource extensions for resources generated by the framework.`,
              type: 'object',
              patternProperties: {
                // names have the same restrictions as CloudFormation Resources section
                '^[a-zA-Z0-9]{1,255}$': {
                  type: 'object',
                  // this lists the supported properties, other properties are "Not supported. An error will be thrown
                  // if you try to extend an unsupported attribute."
                  // this is different than the above schema for `Resources`, which allows the `Type` attribute.
                  // extensions are explicitly meant to extend the definition of existing resources.
                  properties: {
                    Properties: {
                      description: `Properties override.`,
                      type: 'object',
                    },
                    CreationPolicy: {
                      description: `CreationPolicy override.`,
                      type: 'object',
                    },
                    DeletionPolicy: {
                      description: `DeletionPolicy override.`,
                      type: 'string',
                    },
                    DependsOn: {
                      description: `DependsOn override.`,
                      $ref: '#/definitions/awsResourceDependsOn',
                    },
                    Metadata: {
                      description: `Metadata override.`,
                      type: 'object',
                    },
                    UpdatePolicy: {
                      description: `UpdatePolicy override.`,
                      type: 'object',
                    },
                    UpdateReplacePolicy: {
                      description: `UpdateReplacePolicy override.`,
                      type: 'string',
                    },
                    Condition: {
                      description: `Condition override.`,
                      $ref: '#/definitions/awsResourceCondition',
                    },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      })

      const isIamPerFunctionPluginLoaded = () => {
        const pluginsConfig =
          serverless.configurationInput && serverless.configurationInput.plugins
        const list = Array.isArray(pluginsConfig)
          ? pluginsConfig
          : pluginsConfig && Array.isArray(pluginsConfig.modules)
            ? pluginsConfig.modules
            : []
        return list.some(
          (m) =>
            typeof m === 'string' &&
            m.includes('serverless-iam-roles-per-function'),
        )
      }

      if (!isIamPerFunctionPluginLoaded()) {
        // Validate custom.serverless-iam-roles-per-function options (plugin parity)
        serverless.configSchemaHandler.defineCustomProperties({
          type: 'object',
          properties: {
            'serverless-iam-roles-per-function': {
              description: `Compatibility schema for serverless-iam-roles-per-function plugin options.`,
              type: 'object',
              properties: {
                defaultInherit: { type: 'boolean' },
                iamGlobalPermissionsBoundary: { $ref: '#/definitions/awsArn' },
              },
              additionalProperties: false,
            },
          },
        })

        // Extend function-level schema with IAM per-function properties
        serverless.configSchemaHandler.defineFunctionProperties('aws', {
          properties: {
            iam: {
              description: `Function-level IAM role overrides.`,
              type: 'object',
              properties: {
                inheritStatements: { type: 'boolean' },
                role: {
                  description: `Per-function IAM role configuration.`,
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    statements: {
                      description: `Inline IAM policy statements for this function.`,
                      $ref: '#/definitions/awsIamPolicyStatements',
                    },
                    permissionsBoundary: { $ref: '#/definitions/awsArn' },
                    managedPolicies: {
                      description: `Managed policy ARNs attached to this function role.`,
                      type: 'array',
                      items: { $ref: '#/definitions/awsArn' },
                    },
                    path: {
                      description: `IAM role path for this function.`,
                      type: 'string',
                      pattern: '(^\\/$)|(^\\/[\\u0021-\\u007f]+\\/$)',
                    },
                    tags: { $ref: '#/definitions/awsResourceTags' },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
            iamRoleStatementsInherit: { type: 'boolean' },
            iamRoleStatementsName: { type: 'string' },
            iamPermissionsBoundary: { $ref: '#/definitions/awsArn' },
            iamRoleStatements: { $ref: '#/definitions/awsIamPolicyStatements' },
          },
        })
      }
    }

    // Store credentials in this variable to avoid creating them several times (messes up MFA).
    this.cachedCredentials = null

    // Store accountId to be used in `generateTelemetry` logic
    this.accountId = null

    Object.assign(this.naming, naming)
  }

  static getProviderName() {
    return constants.providerName
  }

  /**
   * Execute an AWS request by calling the AWS SDK
   * @param {string} service - Service name
   * @param {string} method - Method name
   * @param {Object} params - Parameters
   * @param {Object} [options] - Options to modify the request behavior
   * @prop [options.useCache] - Utilize cache to retrieve results
   * @prop [options.region] - Specify when to request to different region
   */
  async request(service, method, params, options) {
    // TODO: Determine calling module and log that
    const requestOptions = _.isObject(options) ? options : {}
    const shouldCache = _.get(requestOptions, 'useCache', false)
    // Copy is required as the credentials may be modified during the request
    const credentials = await this.getCredentials()
    const serviceOptions = {
      name: service,
      params: {
        ...credentials,
        region: _.get(requestOptions, 'region', this.getRegion()),
        isS3TransferAccelerationEnabled: this.isS3TransferAccelerationEnabled(),
      },
    }
    return (shouldCache ? awsRequest.memoized : awsRequest)(
      serviceOptions,
      method,
      params,
    )
  }

  /**
   * Fetch credentials directly or using a profile from serverless yml configuration or from the
   * well known environment variables.
   *
   * Note: Caching is handled by AWS SDK's fromNodeProviderChain, which automatically
   * refreshes credentials before they expire. We intentionally don't cache here to
   * allow the SDK's refresh mechanism to work correctly.
   *
   * @returns {{region: *}}
   */
  async getCredentials() {
    const creds = await this.resolveCredentials()

    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      accountId: creds.accountId,
      callerUserId: creds.callerUserId,
      callerArn: creds.callerArn,
    }
  }

  // This function will be used to block the addition of transfer acceleration options
  // to the cloudformation template for regions where acceleration is not supported (ie, govcloud)
  isS3TransferAccelerationSupported() {
    // Only enable s3 transfer acceleration for standard regions (non govcloud/china)
    // since those regions do not yet support it
    const endpoint = getS3EndpointForRegion(this.getRegion())
    return endpoint === 's3.amazonaws.com'
  }

  isS3TransferAccelerationEnabled() {
    return !!this.options['aws-s3-accelerate']
  }

  isS3TransferAccelerationDisabled() {
    return this.options['aws-s3-accelerate'] === false
  }

  disableTransferAccelerationForCurrentDeploy() {
    delete this.options['aws-s3-accelerate']
  }

  getValues(source, objectPaths) {
    return objectPaths.map((objectPath) => ({
      path: objectPath,
      value: _.get(source, objectPath.join('.')),
    }))
  }

  firstValue(values) {
    return values.reduce((result, current) => {
      return result.value ? result : current
    }, {})
  }

  getRegionSourceValue() {
    const values = this.getValues(this, [
      ['options', 'region'],
      ['serverless', 'config', 'region'],
      ['serverless', 'service', 'provider', 'region'],
    ])
    return this.firstValue(values)
  }

  getRegion() {
    const defaultRegion = 'us-east-1'
    const regionSourceValue = this.getRegionSourceValue()
    return regionSourceValue.value || defaultRegion
  }

  getRuntimeSourceValue() {
    const values = this.getValues(this, [
      ['serverless', 'service', 'provider', 'runtime'],
    ])
    return this.firstValue(values)
  }

  getRuntime(runtime) {
    const defaultRuntime = 'nodejs20.x'
    const runtimeSourceValue = this.getRuntimeSourceValue()
    return runtime || runtimeSourceValue.value || defaultRuntime
  }

  resolveFunctionRuntimeManagement(functionRuntimeManagement) {
    return {
      mode: 'auto',
      ...resolveRuntimeManagement(
        this.serverless.service.provider.runtimeManagement,
      ),
      ...resolveRuntimeManagement(functionRuntimeManagement),
    }
  }

  getProfileSourceValue() {
    const values = this.getValues(this, [
      ['options', 'aws-profile'],
      ['options', 'profile'],
      ['serverless', 'config', 'profile'],
      ['serverless', 'service', 'provider', 'profile'],
    ])
    const firstVal = this.firstValue(values)
    return firstVal ? firstVal.value : null
  }

  getProfile() {
    return this.getProfileSourceValue()
  }

  async getServerlessDeploymentBucketName() {
    this.globalDeploymentBucketUsed = false
    this.deploymentBucketInStack = null
    if (this.serverless.service.provider.deploymentBucket) {
      return this.serverless.service.provider.deploymentBucket
    }
    const deploymentBucketInStack = await this.request(
      'CloudFormation',
      'describeStackResource',
      {
        StackName: this.naming.getStackName(),
        LogicalResourceId: this.naming.getDeploymentBucketLogicalId(),
      },
    )
      .then((result) => result.StackResourceDetail.PhysicalResourceId)
      .catch((err) => {
        if (
          err.message.indexOf('does not exist') > -1 ||
          err.message.indexOf('Unable to find details') > -1
        ) {
          return null
        }
        throw err
      })
    this.deploymentBucketInStack = deploymentBucketInStack

    /**
     * If not using legacy deployment bucket, and
     * we are within Compose or there's no stack bucket
     * create or use the global deployment bucket.
     */
    if (
      !this.isLegacyDeploymentBucketEnabled &&
      (this.serverless?.compose?.isWithinCompose || !deploymentBucketInStack)
    ) {
      const { bucketName: globalBucketName } =
        await getOrCreateGlobalDeploymentBucket({
          credentials: await this.serverless
            .getProvider('aws')
            .getCredentials(),
          region: this.serverless.getProvider('aws').getRegion(),
        })
      this.globalDeploymentBucketUsed = true
      return globalBucketName
    }

    // If we are not within Compose and there's a stack bucket, use the stack bucket.
    return deploymentBucketInStack
  }

  getDeploymentPrefix() {
    const provider = this.serverless.service.provider
    if (
      provider.deploymentPrefix === null ||
      provider.deploymentPrefix === undefined
    ) {
      return 'serverless'
    }
    return `${provider.deploymentPrefix}`
  }

  getCustomDeploymentRole() {
    const { provider } = this.serverless.service

    return _.get(provider, 'iam.deploymentRole', provider.cfnRole)
  }

  // Check if role is provided as a string or a CF function reference to existing role
  isExistingRoleProvided(role) {
    return (
      typeof role === 'string' ||
      (_.isObject(role) && Object.keys(role).some((key) => key.includes('::')))
    )
  }

  getCustomExecutionRole(functionObj) {
    const { provider } = this.serverless.service

    if (functionObj.role) return functionObj.role

    const role = _.get(provider, 'iam.role')

    if (this.isExistingRoleProvided(role)) return role

    return provider.role
  }

  resolveFunctionArn(functionAddress) {
    if (isLambdaArn(functionAddress)) return functionAddress
    const functionData = this.serverless.service.getFunction(functionAddress)
    if (functionData) {
      const logicalId = this.naming.getLambdaLogicalId(functionAddress)
      const alias = functionData.targetAlias
      const arnGetter = { 'Fn::GetAtt': [logicalId, 'Arn'] }
      if (!alias) return arnGetter
      return { 'Fn::Join': [':', [arnGetter, alias.name]] }
    }
    throw new ServerlessError(
      `Unrecognized function address ${functionAddress}`,
      'UNRECOGNIZED_FUNCTION_ADDRESS',
    )
  }

  resolveLayerArtifactName(layerName) {
    const serverlessLayerObject = this.serverless.service.getLayer(layerName)
    return serverlessLayerObject.package &&
      serverlessLayerObject.package.artifact
      ? serverlessLayerObject.package.artifact
      : path.join(
          this.serverless.serviceDir,
          '.serverless',
          this.provider.naming.getLayerArtifactName(layerName),
        )
  }

  resolveFunctionIamRoleResourceName(functionObj) {
    const customRole = this.getCustomExecutionRole(functionObj)
    if (customRole) {
      if (typeof customRole === 'string') {
        // check whether the custom role is an ARN
        if (customRole.includes(':')) return null
        return customRole
      }
      if (
        // otherwise, check if we have an in-service reference to a role ARN
        customRole['Fn::GetAtt'] &&
        Array.isArray(customRole['Fn::GetAtt']) &&
        customRole['Fn::GetAtt'].length === 2 &&
        typeof customRole['Fn::GetAtt'][0] === 'string' &&
        typeof customRole['Fn::GetAtt'][1] === 'string' &&
        customRole['Fn::GetAtt'][1] === 'Arn'
      ) {
        return customRole['Fn::GetAtt'][0]
      }
      if (
        // otherwise, check if we have an import, parameters ref or sub
        customRole['Fn::ImportValue'] ||
        customRole.Ref ||
        customRole['Fn::Sub']
      ) {
        return null
      }
    }
    return 'IamRoleLambdaExecution'
  }

  getAlbTargetGroupPrefix() {
    const provider = this.serverless.service.provider
    if (!provider.alb || !provider.alb.targetGroupPrefix) {
      return ''
    }

    return provider.alb.targetGroupPrefix
  }

  getLogRetentionInDays() {
    return this.serverless.service.provider.logRetentionInDays
  }

  getLogDataProtectionPolicy() {
    return this.serverless.service.provider.logDataProtectionPolicy
  }

  getStageSourceValue() {
    const values = this.getValues(this, [
      ['options', 'stage'],
      ['serverless', 'config', 'stage'],
      ['serverless', 'service', 'provider', 'stage'],
    ])
    return this.firstValue(values)
  }

  getStage() {
    const defaultStage = 'dev'
    const stageSourceValue = this.getStageSourceValue()
    return stageSourceValue.value || defaultStage
  }

  getApiGatewayStage() {
    const apiGatewayConfig = this.serverless.service.provider.apiGateway
    return (apiGatewayConfig && apiGatewayConfig.stage) || this.getStage()
  }

  /**
   * Get API Gateway Rest API ID from serverless config
   */
  getApiGatewayRestApiId() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.restApiId
    ) {
      return this.serverless.service.provider.apiGateway.restApiId
    }

    return { Ref: this.naming.getRestApiLogicalId() }
  }

  getApiGatewayDescription() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.description
    ) {
      return this.serverless.service.provider.apiGateway.description
    }
    return undefined
  }

  /**
   * Get Rest API Root Resource ID from serverless config
   */
  getApiGatewayRestApiRootResourceId() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.restApiRootResourceId
    ) {
      return this.serverless.service.provider.apiGateway.restApiRootResourceId
    }
    return {
      'Fn::GetAtt': [this.naming.getRestApiLogicalId(), 'RootResourceId'],
    }
  }

  /**
   * Get Rest API Predefined Resources from serverless config
   */
  getApiGatewayPredefinedResources() {
    if (
      !this.serverless.service.provider.apiGateway ||
      !this.serverless.service.provider.apiGateway.restApiResources
    ) {
      return []
    }

    if (
      Array.isArray(
        this.serverless.service.provider.apiGateway.restApiResources,
      )
    ) {
      return this.serverless.service.provider.apiGateway.restApiResources
    }

    return Object.keys(
      this.serverless.service.provider.apiGateway.restApiResources,
    ).map((key) => ({
      path: key,
      resourceId:
        this.serverless.service.provider.apiGateway.restApiResources[key],
    }))
  }

  /**
   * Get API Gateway websocket API ID from serverless config
   */
  getApiGatewayWebsocketApiId() {
    if (
      this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.websocketApiId
    ) {
      return this.serverless.service.provider.apiGateway.websocketApiId
    }

    return { Ref: this.naming.getWebsocketsApiLogicalId() }
  }

  getStackResources(next, resourcesParam) {
    let resources = resourcesParam
    const params = {
      StackName: this.naming.getStackName(),
    }
    if (!resources) resources = []
    if (next) params.NextToken = next

    return this.request('CloudFormation', 'listStackResources', params).then(
      (res) => {
        const allResources = resources.concat(res.StackResourceSummaries)
        if (!res.NextToken) {
          return allResources
        }
        return this.getStackResources(res.NextToken, allResources)
      },
    )
  }

  async dockerPushToEcr(remoteTag, options = {}) {
    const pushDockerArgs = ['push', remoteTag]
    try {
      const { stdBuffer: pushDockerStdBuffer } = await spawnExt(
        'docker',
        pushDockerArgs,
      )
      if (pushDockerStdBuffer) {
        log.info(pushDockerStdBuffer.toString().trimRight())
      }
      return pushDockerStdBuffer.toString()
    } catch (err) {
      if (
        !options.isLoggedIn &&
        err.stdBuffer &&
        (err.stdBuffer.includes('no basic auth credentials') ||
          err.stdBuffer.includes('authorization token has expired') ||
          err.stdBuffer.includes('403 Forbidden'))
      ) {
        await this.dockerLoginToEcr()
        return await this.dockerPushToEcr(remoteTag, { isLoggedIn: true })
      }
      throw new ServerlessError(
        `Encountered error during executing: docker ${pushDockerArgs}\nOutput of the command:\n${err.stdBuffer}`,
        'DOCKER_PUSH_ERROR',
      )
    }
  }
}

Object.defineProperties(
  AwsProvider.prototype,
  memoizeeMethods({
    getAccountInfo: d(
      async function () {
        const result = await this.request('STS', 'getCallerIdentity', {})
        const arn = result.Arn
        const accountId = result.Account
        const partition = arn.split(':')[1] // ex: arn:aws:iam:acctId:user/xyz
        return {
          accountId,
          partition,
          arn: result.Arn,
          userId: result.UserId,
        }
      },
      { promise: true },
    ),
    getAccountId: d(
      async function () {
        const result = await this.getAccountInfo()
        return result.accountId
      },
      { promise: true },
    ),
    ensureDockerIsAvailable: d(
      async () => {
        try {
          await spawnExt('docker', ['--version'])
        } catch (err) {
          throw new ServerlessError(
            'Could not find Docker installation. Ensure Docker is installed before continuing.',
            'DOCKER_COMMAND_NOT_AVAILABLE',
          )
        }
      },
      { promise: true },
    ),
    dockerLoginToEcr: d(
      async function () {
        const registryId = await this.getAccountId()
        const result = await this.request('ECR', 'getAuthorizationToken', {
          registryIds: [registryId],
        })
        const { authorizationToken, proxyEndpoint } =
          result.authorizationData[0]
        const decodedAuthToken = Buffer.from(authorizationToken, 'base64')
          .toString()
          .split(':')[1]
        const dockerArgs = [
          'login',
          '--username',
          'AWS',
          '--password',
          decodedAuthToken,
          proxyEndpoint,
        ]
        try {
          const { stdBuffer } = await spawnExt('docker', dockerArgs)
          log.info('Login to Docker succeeded!')
          if (stdBuffer.includes('password will be stored unencrypted')) {
            log.warning(
              'Docker authentication token will be stored unencrypted in docker config. Configure Docker credential helper to remove this warning.',
            )
          }
        } catch (err) {
          throw new ServerlessError(
            `Encountered error during executing: docker ${dockerArgs.join(
              ' ',
            )}\nOutput of the command:\n${err.stdBuffer}`,
            'DOCKER_LOGIN_ERROR',
          )
        }
      },
      { promise: true },
    ),
    getOrCreateEcrRepository: d(
      async function (scanOnPush) {
        const registryId = await this.getAccountId()
        const repositoryName = this.naming.getEcrRepositoryName()
        let repositoryUri
        try {
          const result = await this.request('ECR', 'describeRepositories', {
            repositoryNames: [repositoryName],
            registryId,
          })
          repositoryUri = result.repositories[0].repositoryUri
        } catch (err) {
          if (
            !(
              err.providerError &&
              err.providerError.code === 'RepositoryNotFoundException'
            )
          ) {
            throw err
          }
          const result = await this.request('ECR', 'createRepository', {
            repositoryName,
            imageScanningConfiguration: { scanOnPush },
          })
          repositoryUri = result.repository.repositoryUri
        }
        return {
          repositoryUri,
          repositoryName,
        }
      },
      { promise: true },
    ),
    resolveImageUriAndShaFromPath: d(
      async function ({
        imageName,
        imagePath,
        imageFilename,
        buildArgs,
        buildOptions,
        cacheFrom,
        platform,
        provenance,
        scanOnPush,
      }) {
        const imageProgress = progress.get(`containerImage:${imageName}`)
        await this.ensureDockerIsAvailable()

        let isDockerfileAvailable = false
        const absoluteImagePath = path.resolve(
          this.serverless.serviceDir,
          imagePath,
        )
        const pathToDockerfile = path.resolve(absoluteImagePath, imageFilename)

        try {
          const stats = await fsp.stat(pathToDockerfile)
          isDockerfileAvailable = stats.isFile()
        } catch {
          // pass and handle after catch block
        }
        if (!isDockerfileAvailable) {
          throw new ServerlessError(
            `Could not access Dockerfile under path: "${pathToDockerfile}"`,
            'DOCKERFILE_NOT_AVAILABLE_ERROR',
          )
        }

        const { repositoryUri, repositoryName } =
          await this.getOrCreateEcrRepository(scanOnPush)

        const localTag = `${repositoryName}:${imageName}`
        const remoteTag = `${repositoryUri}:${imageName}`

        const buildArgsArr = Object.keys(buildArgs)
          .map((key) => `${key}=${buildArgs[key]}`)
          .reduce(
            (accumulator, current) => [...accumulator, '--build-arg', current],
            [],
          )

        const cacheFromArr = cacheFrom.reduce(
          (accumulator, current) => [...accumulator, '--cache-from', current],
          [],
        )

        const buildDockerArgs = [
          'build',
          '-t',
          localTag,
          '-f',
          pathToDockerfile,
          ...buildArgsArr,
          ...cacheFromArr,
          ...buildOptions,
          absoluteImagePath,
        ]

        // These are optional arguments, so we only append to the arguments
        // if "platform" or "provenance" is specified.
        if (platform !== '') buildDockerArgs.push(`--platform=${platform}`)
        if (provenance !== '')
          buildDockerArgs.push(`--provenance=${provenance}`)

        let imageSha
        try {
          imageProgress.notice(`Building image "${imageName}"`)
          try {
            const { stdBuffer: buildDockerStdBuffer } = await spawnExt(
              'docker',
              buildDockerArgs,
            )
            if (buildDockerStdBuffer) {
              log.info(buildDockerStdBuffer.toString().trimRight())
            }
          } catch (err) {
            throw new ServerlessError(
              `Encountered error during executing: docker ${buildDockerArgs.join(
                ' ',
              )}\nOutput of the command:\n${err.stdBuffer}`,
              'DOCKER_BUILD_ERROR',
            )
          }

          imageProgress.notice(`Tagging image "${imageName}"`)
          const tagDockerArgs = ['tag', localTag, remoteTag]
          try {
            const { stdBuffer: tagDockerStdBuffer } = await spawnExt(
              'docker',
              tagDockerArgs,
            )
            if (tagDockerStdBuffer) {
              log.info(tagDockerStdBuffer.toString().trimRight())
            }
          } catch (err) {
            throw new ServerlessError(
              `Encountered error during executing: docker ${tagDockerArgs.join(
                ' ',
              )}\nOutput of the command:\n${err.stdBuffer}`,
              'DOCKER_TAG_ERROR',
            )
          }

          imageProgress.notice(`Uploading image "${imageName}"`)
          const dockerPushOutput = await this.dockerPushToEcr(remoteTag)
          // Extract imageSha from `docker push` output
          imageSha = dockerPushOutput.match(/(sha256:[a-f0-9]{64})/)[0]
        } finally {
          imageProgress.remove()
        }

        return {
          functionImageSha: imageSha.slice('sha256:'.length),
          functionImageUri: `${repositoryUri}@${imageSha}`,
        }
      },
      {
        promise: true,
        normalizer: (args) => {
          return JSON.stringify(deepSortObjectByKey(args[0]))
        },
      },
    ),
    resolveImageUriAndShaFromUri: d(
      async function (image) {
        const providedImageSha = image.split('@')[1]
        if (providedImageSha) {
          return {
            functionImageSha: providedImageSha.slice('sha256:'.length),
            functionImageUri: image,
          }
        }

        const [repositoryName, imageTag] = image
          .slice(image.indexOf('/') + 1)
          .split(':')
        const parts = image.split('.')
        const registryId = parts[0]
        const region = parts[3]
        const serviceRegion = this.getRegion()
        if (region !== serviceRegion) {
          throw new ServerlessError(
            `The region "${region}" of the ECR image "${image}" must match provider region "${serviceRegion}".`,
            'LAMBDA_ECR_REGION_MISMATCH_ERROR',
          )
        }
        const describeImagesResponse = await this.request(
          'ECR',
          'describeImages',
          {
            imageIds: [
              {
                imageTag,
              },
            ],
            repositoryName,
            registryId,
          },
        )
        const imageDigest = describeImagesResponse.imageDetails[0].imageDigest
        const functionImageUri = `${image.split(':')[0]}@${imageDigest}`
        return {
          functionImageUri,
          functionImageSha: imageDigest.slice('sha256:'.length),
        }
      },
      { promise: true },
    ),
    resolveImageUriAndSha: d(
      async function (functionName) {
        const { image } = this.serverless.service.getFunction(functionName)
        // Resolve if image on function was defined with uri or with name (reference to image in `provider.ecr.images`)
        const resolveImageUriOrName = () => {
          let uri
          let name

          if (_.isObject(image)) {
            if (!image.uri && !image.name) {
              throw new ServerlessError(
                `Either "uri" or "name" property needs to be set on image for function: ${functionName}`,
                'FUNCTION_IMAGE_NEITHER_URI_NOR_NAME_DEFINED_ERROR',
              )
            }
            if (image.uri && image.name) {
              throw new ServerlessError(
                `Either "uri" or "name" property (not both) needs to be set on image for function: ${functionName}`,
                'FUNCTION_IMAGE_BOTH_URI_AND_NAME_DEFINED_ERROR',
              )
            }
            if (image.uri) {
              uri = image.uri
            } else {
              name = image.name
            }
          } else if (isEcrUri(image)) {
            uri = image
          } else {
            name = image
          }

          return { imageUri: uri, imageName: name }
        }

        const { imageUri, imageName } = resolveImageUriOrName()
        const defaultDockerfile = 'Dockerfile'
        const defaultBuildArgs = {}
        const defaultBuildOptions = []
        const defaultCacheFrom = []
        const defaultScanOnPush = false
        const defaultPlatform = ''
        const defaultProvenance = ''

        if (imageUri) {
          return await this.resolveImageUriAndShaFromUri(imageUri)
        }

        const imageDefinedInProvider = _.get(
          this.serverless.service.provider,
          `ecr.images.${imageName}`,
        )

        const imageScanDefinedInProvider = _.get(
          this.serverless.service.provider,
          'ecr.scanOnPush',
          defaultScanOnPush,
        )

        if (!imageDefinedInProvider) {
          throw new ServerlessError(
            `Referenced "${imageName}" not defined in "provider.ecr.images"`,
            'REFERENCED_FUNCTION_IMAGE_NOT_DEFINED_IN_PROVIDER',
          )
        }

        if (_.isObject(imageDefinedInProvider)) {
          if (!imageDefinedInProvider.uri && !imageDefinedInProvider.path) {
            throw new ServerlessError(
              `Either "uri" or "path" property needs to be set on image "${imageName}"`,
              'ECR_IMAGE_NEITHER_URI_NOR_PATH_DEFINED_ERROR',
            )
          }
          if (
            imageDefinedInProvider.uri &&
            imageDefinedInProvider.buildOptions
          ) {
            throw new ServerlessError(
              `You can't use the "buildOptions" and the "uri" properties at the same time "${imageName}"`,
              'ECR_IMAGE_URI_AND_BUILDOPTIONS_DEFINED_ERROR',
            )
          }
          if (imageDefinedInProvider.uri && imageDefinedInProvider.path) {
            throw new ServerlessError(
              `Either "uri" or "path" property (not both) needs to be set on image "${imageName}"`,
              'ECR_IMAGE_BOTH_URI_AND_PATH_DEFINED_ERROR',
            )
          }
          if (imageDefinedInProvider.uri && imageDefinedInProvider.buildArgs) {
            throw new ServerlessError(
              `The "buildArgs" property cannot be used with "uri" property "${imageName}"`,
              'ECR_IMAGE_BOTH_URI_AND_BUILDARGS_DEFINED_ERROR',
            )
          }
          if (imageDefinedInProvider.uri && imageDefinedInProvider.cacheFrom) {
            throw new ServerlessError(
              `The "cacheFrom" property cannot be used with "uri" property "${imageName}"`,
              'ECR_IMAGE_BOTH_URI_AND_CACHEFROM_DEFINED_ERROR',
            )
          }
          if (imageDefinedInProvider.uri && imageDefinedInProvider.platform) {
            throw new ServerlessError(
              `The "platform" property cannot be used with "uri" property "${imageName}"`,
              'ECR_IMAGE_BOTH_URI_AND_PLATFORM_DEFINED_ERROR',
            )
          }
          if (imageDefinedInProvider.uri && imageDefinedInProvider.provenance) {
            throw new ServerlessError(
              `The "provenance" property cannot be used with "uri" property "${imageName}"`,
              'ECR_IMAGE_BOTH_URI_AND_PROVENANCE_DEFINED_ERROR',
            )
          }
          if (imageDefinedInProvider.path) {
            return await this.resolveImageUriAndShaFromPath({
              imageName,
              imagePath: imageDefinedInProvider.path,
              imageFilename: imageDefinedInProvider.file || defaultDockerfile,
              buildArgs: imageDefinedInProvider.buildArgs || defaultBuildArgs,
              buildOptions:
                imageDefinedInProvider.buildOptions || defaultBuildOptions,
              cacheFrom: imageDefinedInProvider.cacheFrom || defaultCacheFrom,
              platform: imageDefinedInProvider.platform || defaultPlatform,
              provenance:
                imageDefinedInProvider.provenance || defaultProvenance,
              scanOnPush: imageScanDefinedInProvider,
            })
          }
          return await this.resolveImageUriAndShaFromUri(
            imageDefinedInProvider.uri,
          )
        }
        if (isEcrUri(imageDefinedInProvider)) {
          return await this.resolveImageUriAndShaFromUri(imageDefinedInProvider)
        }
        return await this.resolveImageUriAndShaFromPath({
          imageName,
          imagePath: imageDefinedInProvider,
          imageFilename: defaultDockerfile,
          buildArgs: imageDefinedInProvider.buildArgs || defaultBuildArgs,
          buildOptions:
            imageDefinedInProvider.buildOptions || defaultBuildOptions,
          cacheFrom: imageDefinedInProvider.cacheFrom || defaultCacheFrom,
          platform: imageDefinedInProvider.platform || defaultPlatform,
          provenance: imageDefinedInProvider.provenance || defaultProvenance,
          scanOnPush: imageScanDefinedInProvider,
        })
      },
      { promise: true },
    ),
  }),
)

export default AwsProvider
