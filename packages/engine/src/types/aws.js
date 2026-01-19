import { z } from 'zod'
import { ConfigAwsIntegrationsSchema } from './integrations.js'
import {
  ConfigContainerRouting,
  ConfigContainerCompute,
  ConfigContainerDevModeSchema,
  ConfigContainerBuildSchema,
} from './containers.js'

/**
 * JSONValue is a recursive Zod schema that represents any valid JSON value.
 * It allows all of the following types:
 *  - string
 *  - number
 *  - boolean
 *  - array of JSONValue
 *  - record of JSONValue
 */
const JSONValue = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(JSONValue),
    z.record(z.string(), JSONValue),
  ]),
)

export const ConfigDeploymentAws = z.object({
  deployment: z
    .object({
      type: z.enum(['aws@1.0']),
      slack: z
        .object({
          appConfigTokenSSMParameterPath: z
            .string()
            .describe(
              'Path to the SSM parameter containing the AppConfig token',
            )
            .optional(),
        })
        .optional(),
      awsVpc: z
        .object({
          id: z.string().describe('ID of an existing VPC to use'),
          publicSubnets: z
            .array(z.string())
            .describe('IDs of existing public subnets to use'),
          privateSubnets: z
            .array(z.string())
            .describe('IDs of existing private subnets to use'),
          s2sSecurityGroupId: z
            .string()
            .describe(
              'ID of an existing service-to-service security group to use',
            ),
          loadBalancerSecurityGroupId: z
            .string()
            .describe('ID of an existing load balancer security group to use'),
        })
        .strict()
        .optional()
        .describe('User-provided VPC and networking resources'),
      awsIam: z
        .object({
          roleArn: z.string().describe('ARN of an existing IAM role to use'),
        })
        .strict()
        .optional()
        .describe('User-provided IAM role resources'),
      awsAlb: z
        .object({
          wafAclArn: z.string().describe('ARN of an existing WAF ACL to use'),
        })
        .strict()
        .optional()
        .describe('User-provided resources for ALB'),
      awsFargateEcs: z
        .object({
          executionRoleArn: z
            .string()
            .describe(
              'ARN of an existing IAM role to use for ECS Task Execution',
            ),
        })
        .strict()
        .optional()
        .describe('User-provided resources for Fargate ECS'),
    })
    .strict()
    .describe('Configuration for the AWS API deployment architecture'),
})

/**
 * ContainerSchema defines the container configuration for a container.
 * It includes the compute configuration, the routing configuration, environment variables, and the dev mode configuration.
 */
export const ConfigContainerSchema = z
  .object({
    src: z.string().describe('Path to the container source code'),
    environment: z
      .record(JSONValue)
      .optional()
      .describe('Environment variables to pass to the container'),
    compute: ConfigContainerCompute.describe(
      'Compute service configuration (AWS Lambda or Fargate ECS)',
    ),
    routing: ConfigContainerRouting.describe(
      'Container routing and domain configuration',
    ),
    dev: ConfigContainerDevModeSchema.optional().describe(
      'Development mode settings',
    ),
    build: ConfigContainerBuildSchema.optional().describe(
      'Container build configuration',
    ),
    integrations: ConfigAwsIntegrationsSchema.optional(),
  })
  .strict()
  .describe(
    'Container configuration including compute, routing, environment, and development settings',
  )

export const ConfigContainersSchema = z
  .record(z.string(), ConfigContainerSchema)
  .optional()
  .describe('Map of containers to be deployed and their configurations')

const StateRoutingAwsAlb = z
  .object({
    primaryListenerArn: z.string().nullable().optional(),
    targetGroupArnAwsLambda: z.string().nullable().optional(),
    targetGroupArnAwsFargateEcs: z.string().nullable().optional(),
    priority: z.number().nullable().optional(),
    listenerRules: z.array(
      z
        .object({
          path: z.string().describe('URL path pattern for the listener rule'),
          targetGroupArn: z.string().describe('ARN of the target group'),
          hostHeader: z
            .string()
            .optional()
            .describe('Optional host header for routing'),
          listenerArn: z.string().describe('ARN of the ALB listener'),
        })
        .strict(),
    ),
  })
  .strict()
  .describe('AWS Application Load Balancer state including listener rules')

/**
 * Schema for AWS ACM certificate state
 */
const StateAwsAcm = z
  .object({
    certificateArn: z
      .string()
      .optional()
      .describe('ARN of the SSL/TLS certificate'),
    domain: z
      .string()
      .optional()
      .describe('Domain name associated with the certificate'),
  })
  .strict()
  .describe('AWS Certificate Manager (ACM) state')

/**
 * Schema for AWS Route53 state
 */
const StateAwsRoute53 = z
  .object({
    hostedZoneId: z
      .string()
      .optional()
      .describe('ID of the Route53 hosted zone'),
    domain: z
      .string()
      .optional()
      .describe('Domain name associated with the hosted zone'),
  })
  .strict()
  .describe('AWS Route53 DNS state')

/**
 * Schema for container routing state
 */
const StateRouting = z
  .object({
    type: z.enum(['awsAlb']).describe('Type of routing infrastructure'),
    pathPattern: z.string().optional().describe('URL path pattern for routing'),
    pathHealthCheck: z
      .string()
      .optional()
      .describe('Health check endpoint path'),
    customDomain: z
      .string()
      .nullable()
      .optional()
      .describe('Custom domain name for the container'),
    awsAlb: StateRoutingAwsAlb.strict().describe(
      'AWS Application Load Balancer configuration',
    ),
    awsAcm: StateAwsAcm.optional().describe(
      'AWS Certificate Manager configuration',
    ),
    awsRoute53: StateAwsRoute53.optional().describe(
      'AWS Route53 DNS configuration',
    ),
    awsCloudFront: z
      .object({
        distributionId: z
          .string()
          .optional()
          .describe('CloudFront distribution ID'),
        distributionDomainName: z
          .string()
          .optional()
          .describe('CloudFront distribution domain name'),
      })
      .optional()
      .describe('AWS CloudFront distribution configuration'),
    cloudFrontKV: z
      .object({
        path: z.string().optional(),
        originId: z.string().optional(),
        originType: z.string().optional(),
      })
      .optional()
      .describe('AWS CloudFront Key Value Store configuration'),
  })
  .strict()
  .describe(
    'Container routing state including ALB, ACM, Route53, and CloudFront configurations',
  )

/**
 * Schema for AWS IAM state
 */
const StateContainerComputeAwsIam = z
  .object({
    executionRoleArn: z
      .string()
      .optional()
      .describe('ARN of the IAM execution role'),
    taskRoleArn: z
      .string()
      .optional()
      .describe('ARN of the IAM task role for Fargate ECS tasks'),
  })
  .strict()
  .describe('AWS IAM roles state for container execution')

/**
 * Schema for AWS Lambda container configuration
 */
const StateContainerComputeAwsLambda = z
  .object({
    imageUri: z.string().nullable().optional(),
    functionArn: z.string().nullable().optional(),
    functionUrl: z.string().nullable().optional(),
  })
  .strict()

/**
 * Schema for AWS Fargate ECS container configuration
 */
const StateContainerComputeAwsFargateEcs = z
  .object({
    imageUri: z.string().optional(),
  })
  .strict()

/**
 * Schema for AWS ECR container configuration
 */
const StateContainerComputeAwsEcr = z
  .object({
    repositoryUri: z.string().optional(),
  })
  .strict()

/**
 * Schema for container compute state
 */
const StateContainerCompute = z
  .object({
    type: z.enum(['awsLambda', 'awsFargateEcs']).default('awsLambda'),
    awsEcr: StateContainerComputeAwsEcr.optional(),
    awsFargateEcs: StateContainerComputeAwsFargateEcs.optional(),
    awsLambda: StateContainerComputeAwsLambda.optional(),
    awsIam: StateContainerComputeAwsIam.optional(),
  })
  .strict()

const StateContainerSchema = z
  .object({
    src: z.string().optional(),
    compute: StateContainerCompute.optional(),
    folderHash: z.string().optional(),
    routing: StateRouting.optional(),
    timeLastDeployed: z.string().datetime().optional(),
    deployedOnLastDeployment: z.boolean().optional(),
    integrations: z.record(z.string(), z.any()).optional(),
  })
  .strict()

/**
 * StateDeploymentAwsApi defines the AWS API deployment schema.
 */
export const StateDeploymentTypeAws = {
  deploymentType: z.enum(['aws@1.0']).default('aws@1.0'),
  scfForwardToken: z.string().optional(),
  containers: z
    .record(z.string(), StateContainerSchema.strict())
    .optional()
    .default({}),
  region: z.string().default(process.env.AWS_REGION || 'us-east-1'),
  awsVpc: z
    .object({
      id: z.string().nullable().optional(),
      publicSubnets: z.array(z.string()).optional(),
      privateSubnets: z.array(z.string()).optional(),
      s2sSecurityGroupId: z.string().nullable().optional(),
      loadBalancerSecurityGroupId: z.string().nullable().optional(),
      provisionedBy: z.enum(['user', 'framework']).nullable().optional(),
    })
    .strict()
    .optional()
    .default({
      id: null,
      publicSubnets: [],
      privateSubnets: [],
      s2sSecurityGroupId: null,
      loadBalancerSecurityGroupId: null,
      provisionedBy: null,
    }),
  awsEcs: z
    .object({
      cluster: z
        .object({ arn: z.string().nullable().optional() })
        .strict()
        .optional(),
    })
    .strict()
    .optional()
    .default({
      cluster: {
        arn: null,
      },
    }),
  awsIam: z
    .object({
      fargateEcsExecutionRoleArn: z.string().nullable().optional(),
    })
    .strict()
    .optional()
    .default({
      fargateEcsExecutionRoleArn: null,
    }),
  awsAlb: z
    .object({
      arn: z.string().nullable().optional(),
      dnsName: z.string().nullable().optional(),
      canonicalHostedZoneId: z.string().nullable().optional(),
      httpListenerArn: z.string().nullable().optional(),
      httpsListenerArn: z.string().nullable().optional(),
      wafAclArn: z.string().nullable().optional(),
    })
    .strict()
    .optional()
    .default({
      arn: null,
      dnsName: null,
    }),
  awsCloudFront: z
    .object({
      enabled: z.boolean().default(false),
      distributionId: z.string().nullable().optional(),
      distributionDomainName: z.string().nullable().optional(),
      keyValueStore: z
        .object({
          arn: z.string().nullable().optional(),
          name: z.string().nullable().optional(),
          status: z.string().nullable().optional(),
        })
        .strict()
        .optional()
        .default({
          arn: null,
          name: null,
          status: null,
        }),
      function: z
        .object({
          name: z.string().nullable().optional(),
          arn: z.string().nullable().optional(),
        })
        .strict()
        .optional()
        .default({}),
    })
    .strict()
    .optional()
    .default({
      enabled: false,
      distributionId: null,
      distributionDomainName: null,
    }),
}
