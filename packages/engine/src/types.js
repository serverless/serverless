import { z } from 'zod'
import { StateDeploymentTypeAws } from './types/aws.js'

/**
 *
 * General Types
 *
 *
 */

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
    z.record(JSONValue),
  ]),
)

/**
 *
 * Configuration Types
 *
 * Essential and deployment architecture specific types for framework configuration files.
 *
 */

/**
 *
 *
 * ==================================================
 *                 CONFIG: ESSENTIAL
 * ==================================================
 *
 * These types are essential for all framework configuration files.
 *
 *
 */

/**
 * StagePropertyType defines the stage property for a container.
 * It includes the name of the stage and constrains the maximum length to 12 characters.
 */
export const ConfigStage = z
  .string()
  .min(3, { message: '"stage" must be at least 3 characters long' })
  // Keep in mind, cloud resource names have a max length of 63 characters, and stage is used are part of those name
  .max(16, { message: '"stage" must be at most 16 characters long' })
  .regex(
    /^[a-zA-Z0-9\-_]+$/,
    '"stage" can only contain letters, numbers, hyphens, and underscores',
  )
  .describe(
    'Required stage name for the project. This is used to create a unique stage for the containers.',
  )

/**
 * StagesConfig defines the configuration for stages within configuration files.
 * Each stage can have its own parameters and resolvers for customization.
 */
export const ConfigStages = z
  .record(
    ConfigStage,
    z.object({
      params: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          'Stage-specific parameters. These are used to pass in values to the stage.',
        ),
      resolvers: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          'Stage-specific resolvers. These are used to resolve Providers to fetch their credentials or data.',
        ),
    }),
  )
  .optional()
  .describe(
    'Schema for the "stages" configuration within configuration files. This is used to define stage-specific configurations, which contains stage-specific parameters and resolvers.',
  )

export const ConfigEssential = z.object({
  org: z
    .string()
    .regex(
      /^[a-zA-Z0-9\-_]+$/,
      '"org" can only contain letters, numbers, hyphens, and underscores',
    )
    .optional()
    .describe(
      'The organization name for the project. This is used to create a unique name for the containers.',
    ),
  name: z
    .string()
    .min(3, { message: '"name" must be at least 3 characters long' })
    // Keep in mind, cloud resource names have a max length of 63 characters, and "name" is used as part of the name
    .max(16, { message: '"name" must be at most 16 characters long' })
    .regex(
      /^[a-zA-Z0-9\-_]+$/,
      '"name" can only contain letters, numbers, hyphens, and underscores',
    )
    .describe(
      'Required name for the project. This is used to create a unique name for the containers.',
    ),
  frameworkVersion: z.string().optional(),
  stages: ConfigStages.optional(),
})

/**
 *
 *
 * ==================================================
 *             CONFIG: DEPLOYMENT TYPES
 * ==================================================
 *
 * These types are for specific deployment architectures which frameworks can optionally deploy.
 *
 *
 */

/**
 * ConfigContainerRoutingSchema defines the routing configuration for a container.
 * It includes the domain, path pattern, and path health check.
 */
export const ConfigContainerRouting = z
  .object({
    domain: z
      .string()
      .optional()
      .describe(
        'Custom domain name for the container. Different containers can use different custom domains. For AWS, the custom domain does not have to exist in Route 53, but must have a hosted zone in Route 53, allowing you to use domains from different registrars (e.g., Cloudflare, Google Domains, etc.). That Route 53 hosted zone will be automatically found and used. Do not include "http://" or "https://". For AWS, routing is handled at the AWS Application Load Balancer (ALB) level using host-based rules, meaning subdomains (e.g., "api.example.com") can direct traffic to different target groups.',
      ),
    pathPattern: z
      .string()
      .regex(
        /^\/[^\s<>\\"]*$/,
        'Must start with "/" and cannot contain spaces or invalid characters (<, >, \\, ").',
      )
      .describe(
        'URL path pattern to route requests to this container. Supports: exact matches (e.g., "/images/logo.png"), prefix matches (e.g., "/api/users/*" matches "/api/users/123"), wildcard (*) for multi-level matches (e.g., "/assets/*/images/*" matches "/assets/v1/images/logo.png"), question mark (?) for single-character matches (e.g., "/profile/202?" matches "/profile/2021"), and is case-sensitive ("/api" is not the same as "/API"). Query parameters are not evaluated.',
      ),
    pathHealthCheck: z
      .string()
      .optional()
      .describe(
        'Health check path. Deployments to AWS Fargate ECS will wait for the health check to pass before marking the deployment as successful',
      ),
  })
  .strict()
  .describe(
    'Configures routing for the container with your routing infrastructure (e.g. AWS Application Load Balancer)',
  )

/**
 * ConfigContainerAwsFargateEcsScaleSchemaMin defines a scaling configuration object for specifying a minimum value.
 *
 * @property {number} min - The minimum scaling value.
 */
const ConfigContainerAwsFargateEcsScaleSchemaMin = z
  .object({
    type: z.literal('min'),
    min: z.number({
      required_error:
        'A scaling object with key "min" must have a number value',
      invalid_type_error: '"min" must be a number',
    }),
  })
  .strict()
  .describe('A scaling object specifying a minimum scaling value.')

/**
 * ConfigContainerAwsFargateEcsScaleSchemaMax defines a scaling configuration object for specifying a maximum value.
 *
 * @property {number} max - The maximum scaling value.
 */
const ConfigContainerAwsFargateEcsScaleSchemaMax = z
  .object({
    type: z.literal('max'),
    max: z.number({
      required_error:
        'A scaling object with key "max" must have a number value',
      invalid_type_error: '"max" must be a number',
    }),
  })
  .strict()
  .describe('A scaling object specifying a maximum scaling value.')

/**
 * ConfigContainerAwsFargateEcsScaleSchemaTarget defines a scaling object specifying the target scaling metric
 * (either "cpu" or "memory"), an optional scaling value (defaults to 70), and additional cooldown configurations.
 *
 * @property {('cpu'|'memory'|'albRequestsPerTarget')} target - The scaling target metric, must be either "cpu" or "memory".
 * @property {number} [value=70] - Optional scaling value, defaults to 70.
 * @property {boolean} [scaleIn=true] - Optional flag indicating if scaling in is enabled, defaults to true.
 * @property {number} [scaleInCooldown] - Optional cooldown period for scaling in, must be an integer between 1 and 100.
 * @property {number} [scaleOutCooldown] - Optional cooldown period for scaling out, must be an integer between 1 and 100.
 */
/**
 * ConfigContainerAwsFargateEcsScaleSchemaStepAdjustment defines a step adjustment for step scaling policies.
 * Each step adjustment specifies a scaling action based on metric value ranges.
 */
const ConfigContainerAwsFargateEcsScaleSchemaStepAdjustment = z
  .object({
    metricIntervalLowerBound: z
      .number()
      .optional()
      .describe('Lower bound for the metric interval'),
    metricIntervalUpperBound: z
      .number()
      .optional()
      .describe('Upper bound for the metric interval'),
    scalingAdjustment: z
      .number()
      .describe('The amount to scale by when this step adjustment applies'),
  })
  .strict()
  .describe('A step adjustment for step scaling policies')

/**
 * ConfigContainerAwsFargateEcsScaleSchemaStep defines a step scaling policy configuration.
 * Step scaling allows more granular control over scaling actions based on metric thresholds.
 */
const ConfigContainerAwsFargateEcsScaleSchemaStep = z
  .object({
    adjustmentType: z
      .enum(['ChangeInCapacity', 'PercentChangeInCapacity', 'ExactCapacity'])
      .describe('How the scaling adjustment should be applied'),
    stepAdjustments: z
      .array(ConfigContainerAwsFargateEcsScaleSchemaStepAdjustment)
      .min(1, 'At least one step adjustment is required')
      .describe('Array of step adjustments defining scaling actions')
      .superRefine((adjustments, ctx) => {
        // Validate step adjustments are properly ordered and non-overlapping
        adjustments.forEach((adjustment, i) => {
          if (i > 0) {
            const prevAdjustment = adjustments[i - 1]
            if (
              adjustment.metricIntervalLowerBound != null &&
              prevAdjustment.metricIntervalUpperBound != null &&
              adjustment.metricIntervalLowerBound <=
                prevAdjustment.metricIntervalUpperBound
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  'Step adjustments must be in ascending order with no overlap',
                path: ['stepAdjustments', i],
              })
            }
          }
        })
      }),
    cooldown: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Cooldown period in seconds between scaling activities'),
    metricAggregationType: z
      .enum(['Average', 'Minimum', 'Maximum'])
      .optional()
      .describe('How the metric data points should be aggregated'),
    metricName: z
      .string()
      .describe('The name of the metric to use for scaling'),
    namespace: z.string().describe('The namespace of the metric'),
    dimensions: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        }),
      )
      .optional()
      .describe('The dimensions of the metric'),
    threshold: z
      .number()
      .describe('The threshold value that triggers the scaling action'),
    comparisonOperator: z
      .enum([
        'GreaterThanOrEqualToThreshold',
        'GreaterThanThreshold',
        'LessThanThreshold',
        'LessThanOrEqualToThreshold',
      ])
      .describe('The comparison operator to use with the threshold'),
  })
  .strict()
  .describe(
    'Step scaling policy configuration for more granular scaling control',
  )

const ConfigContainerAwsFargateEcsScaleSchemaTarget = z
  .object({
    type: z.literal('target'),
    target: z
      .enum(['cpu', 'memory', 'albRequestsPerTarget'], {
        required_error:
          'A scaling object with key "target" must have a value of "cpu", "memory", or "albRequestsPerTarget"',
        invalid_type_error:
          '"target" must be either "cpu", "memory", or "albRequestsPerTarget"',
      })
      .describe('Specifies whether scaling is targeting CPU or memory'),
    value: z
      .number()
      .optional()
      .default(70)
      .describe('Optional scaling value, defaults to 70'),
    scaleIn: z
      .boolean()
      .optional()
      .default(true)
      .describe('Optional flag to enable scale in; defaults to true'),
    scaleInCooldown: z
      .number()
      .int()
      .min(1, { message: '"scaleInCooldown" must be at least 1' })
      .max(100, { message: '"scaleInCooldown" must be at most 100' })
      .optional()
      .describe(
        'Optional cooldown period for scaling in, must be between 1 and 100',
      ),
    scaleOutCooldown: z
      .number()
      .int()
      .min(1, { message: '"scaleOutCooldown" must be at least 1' })
      .max(100, { message: '"scaleOutCooldown" must be at most 100' })
      .optional()
      .describe(
        'Optional cooldown period for scaling out, must be between 1 and 100',
      ),
  })
  .strict()
  .describe(
    'A scaling object specifying the target scaling metric ("cpu", "memory", or "albRequestsPerTarget"), an optional scaling value, and optional cooldown configurations for scale in and scale out.',
  )

/**
 * ConfigContainerAwsFargateEcsScaleSchemaDesired defines a scaling configuration object for specifying a desired scaling value.
 *
 * @property {number} desired - The desired scaling value.
 */
const ConfigContainerAwsFargateEcsScaleSchemaDesired = z
  .object({
    type: z.literal('desired'),
    desired: z
      .number({
        required_error:
          'A scaling object with key "desired" must have a number value',
        invalid_type_error: '"desired" must be a number',
      })
      .default(5),
  })
  .strict()
  .describe('A scaling object specifying a desired scaling value.')

/**
 * ConfigContainerAwsFargateEcsScaleSchemaItem is a union schema for scaling configuration objects.
 * It accepts one of:
 *   - { min: number }
 *   - { max: number }
 *   - { cpu: number }
 *   - { desired: number }
 */
const ConfigContainerAwsFargateEcsScaleSchemaItem = z
  .discriminatedUnion('type', [
    ConfigContainerAwsFargateEcsScaleSchemaMin,
    ConfigContainerAwsFargateEcsScaleSchemaMax,
    ConfigContainerAwsFargateEcsScaleSchemaTarget,
    ConfigContainerAwsFargateEcsScaleSchemaDesired,
    z
      .object({
        type: z.literal('step'),
        adjustmentType: z
          .enum([
            'ChangeInCapacity',
            'PercentChangeInCapacity',
            'ExactCapacity',
          ])
          .describe('How the scaling adjustment should be applied'),
        stepAdjustments: z
          .array(ConfigContainerAwsFargateEcsScaleSchemaStepAdjustment)
          .min(1, 'At least one step adjustment is required')
          .describe('Array of step adjustments defining scaling actions')
          .refine(
            (adjustments) => {
              // Validate step adjustments are properly ordered and non-overlapping
              for (let i = 1; i < adjustments.length; i++) {
                const prevAdjustment = adjustments[i - 1]
                const adjustment = adjustments[i]

                // If both bounds are defined, ensure they don't overlap
                if (
                  adjustment.metricIntervalLowerBound != null &&
                  prevAdjustment.metricIntervalUpperBound != null &&
                  adjustment.metricIntervalLowerBound <
                    prevAdjustment.metricIntervalUpperBound
                ) {
                  return false
                }

                // If upper bound is defined for current adjustment, ensure it's greater than its lower bound
                if (
                  adjustment.metricIntervalUpperBound != null &&
                  adjustment.metricIntervalLowerBound != null &&
                  adjustment.metricIntervalUpperBound <=
                    adjustment.metricIntervalLowerBound
                ) {
                  return false
                }
              }
              return true
            },
            {
              message:
                'Step adjustments must be in ascending order with no overlap, and upper bounds must be greater than lower bounds',
            },
          ),
        cooldown: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Cooldown period in seconds between scaling activities'),
        metricAggregationType: z
          .enum(['Average', 'Minimum', 'Maximum'])
          .optional()
          .describe('How the metric data points should be aggregated'),
        metricName: z
          .string()
          .describe('The name of the metric to use for scaling'),
        namespace: z.string().describe('The namespace of the metric'),
        dimensions: z
          .array(
            z.object({
              name: z.string(),
              value: z.string(),
            }),
          )
          .optional()
          .describe('The dimensions of the metric'),
        threshold: z
          .number()
          .describe('The threshold value that triggers the scaling action'),
        comparisonOperator: z
          .enum([
            'GreaterThanOrEqualToThreshold',
            'GreaterThanThreshold',
            'LessThanThreshold',
            'LessThanOrEqualToThreshold',
          ])
          .describe('The comparison operator to use with the threshold'),
      })
      .strict(),
  ])
  .describe(
    'A scaling configuration object for AWS Fargate ECS; must be one of { min: number }, { max: number }, { cpu: number }, { desired: number }, or step scaling policy configuration.',
  )

/**
 * ConfigContainerAwsFargateEcsScaleSchema defines the scaling configuration as an array of scaling configuration objects.
 * It allows at most one object for each of "min", "max", and "desired" so that if multiple of these are provided,
 * cross-field validations can be performed. In particular, if both "min" and "max" are present, then:
 *   - "min" must not be greater than "max".
 * Additionally, if "desired" is provided along with "min" and/or "max", then:
 *   - "desired" must be greater than or equal to "min" (if provided) and less than or equal to "max" (if provided).
 * Moreover, "desired" cannot be set if any "target" configuration is provided.
 * The "target" scaling configuration objects are allowed with a cap of two.
 *
 * Example:
 * [
 *   { min: 1 },
 *   { max: 10 },
 *   { target: 'cpu', value: 75 }
 * ]
 */
export const ConfigContainerAwsFargateEcsScaleSchema = z
  .array(ConfigContainerAwsFargateEcsScaleSchemaItem)
  .superRefine((scales, ctx) => {
    // Initialize variables to capture the unique value for each key if provided
    let minVal
    let maxVal
    let desiredVal
    let targetCount = 0
    let targetCpuCount = 0 // New counter for CPU targets
    let targetMemoryCount = 0 // New counter for Memory targets
    let stepCount = 0 // Counter for step scaling policies

    scales.forEach((scale, index) => {
      if ('min' in scale) {
        // Ensure that "min" cannot be 0
        if (scale.min === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '"min" scaling configuration cannot be 0.',
            path: [index, 'min'],
          })
        }
        if (minVal !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Duplicate "min" scaling configuration is not allowed.',
            path: [index, 'min'],
          })
        } else {
          minVal = scale.min
        }
      }
      if ('max' in scale) {
        // Ensure that "max" cannot be 0
        if (scale.max === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '"max" scaling configuration cannot be 0.',
            path: [index, 'max'],
          })
        }
        if (maxVal !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Duplicate "max" scaling configuration is not allowed.',
            path: [index, 'max'],
          })
        } else {
          maxVal = scale.max
        }
      }
      if ('desired' in scale) {
        if (desiredVal !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Duplicate "desired" scaling configuration is not allowed.',
            path: [index, 'desired'],
          })
        } else {
          desiredVal = scale.desired
        }
      }
      if ('target' in scale) {
        targetCount++
        if (scale.target === 'cpu') {
          targetCpuCount++
        } else if (scale.target === 'memory') {
          targetMemoryCount++
        }
      }
      if (scale.type === 'step') {
        stepCount++
      }
    })

    // Validate that if both "min" and "max" are provided, min is not greater than max
    if (minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"min" value cannot be greater than "max" value.',
      })
    }

    // Validate that "desired" is between min and max (if defined)
    if (desiredVal !== undefined) {
      if (minVal !== undefined && desiredVal < minVal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '"desired" value cannot be less than "min" value.',
        })
      }
      if (maxVal !== undefined && desiredVal > maxVal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '"desired" value cannot be greater than "max" value.',
        })
      }
    }

    // Validate that at most three "target" scaling configurations are allowed
    if (targetCount > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most three "target" scaling configurations are allowed.',
      })
    }
    // Validate that step scaling cannot be combined with target tracking
    if (stepCount > 0 && targetCount > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Step scaling cannot be combined with target tracking scaling. Please use one or the other to avoid conflicts.',
      })
    }

    // New validation rules for duplicate target types
    if (targetCpuCount === 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only 1 Target Scaling Policy can be applied to 'cpu'.",
      })
    }
    if (targetMemoryCount === 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only 1 Target Scaling Policy can be applied to 'memory'.",
      })
    }

    // Validate that "desired" cannot be set if any "target" configuration is provided
    if (desiredVal !== undefined && targetCount > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          '"desired" cannot be combined with any "target" configuration.',
      })
    }

    // // Ensure that if "min" or "max" are set, a "target" configuration must also be provided.
    if (targetCount === 0 && stepCount === 0) {
      if (minVal !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            '"min" must be set with a "target" or "step" auto-scaling policy, otherwise auto-scaling will not happen and this value will have no purpose.',
        })
      }
      if (maxVal !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            '"max" must be set with a "target" or "step" auto-scaling policy, otherwise auto-scaling will not happen and this value will have no purpose.',
        })
      }
    }

    // // New validation: if a "target" configuration is provided without a "max" scaling configuration, throw an error.
    if ((targetCount > 0 || stepCount > 0) && maxVal === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'For your own protection, "max" is required when auto-scaling with a "target" or "step" policy. "max" sets your auto-scaling limit. Without it, you could end up with a painful bill.',
      })
    }
  })
  .describe(
    'Scaling configuration array for AWS Fargate ECS with additional cross-field validation rules.',
  )

/**
 * ConfigContainerAwsFargateEcs defines the compute configuration for a container.
 * It includes the CPU, memory and scaling mode settings.
 */
export const ConfigContainerAwsFargateEcs = z
  .object({
    cpu: z
      .number()
      .min(256)
      .max(16384)
      .default(256)
      .refine(
        (val) => [256, 512, 1024, 2048, 4096, 8192, 16384].includes(val),
        {
          message:
            'CPU must be one of: 256, 512, 1024, 2048, 4096, 8192, 16384',
        },
      )
      .describe(
        'CPU units (256-16384). Valid values: 256, 512, 1024, 2048, 4096, 8192, 16384',
      ),
    memory: z
      .number()
      .min(512)
      .max(122880)
      .default(512)
      .describe(
        'Memory in MB (512-122880). Must be compatible with selected CPU units',
      ),
    executionRoleArn: z
      .string()
      .optional()
      .describe('ARN of an existing IAM role to use for ECS Task Execution'),
    scale: ConfigContainerAwsFargateEcsScaleSchema.optional(),
  })
  .strict()
  .describe(
    'AWS Fargate ECS compute configuration including CPU, memory and scaling mode settings',
  )
  .superRefine((val, ctx) => {
    if (val.cpu === 256 && ![512, 1024, 2048].includes(val.memory)) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message: 'CPU 256 requires memory 512, 1024, or 2048',
      })
    } else if (
      val.cpu === 512 &&
      val.memory >= 1024 &&
      val.memory <= 4096 &&
      val.memory % 1024 !== 0
    ) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message:
          'CPU 512 requires memory between 1GB and 4GB in 1GB increments',
      })
    } else if (
      val.cpu === 1024 &&
      val.memory >= 2048 &&
      val.memory <= 8192 &&
      val.memory % 1024 !== 0
    ) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message:
          'CPU 1024 requires memory between 2GB and 8GB in 1GB increments',
      })
    } else if (
      val.cpu === 2048 &&
      val.memory >= 4096 &&
      val.memory <= 16384 &&
      val.memory % 1024 !== 0
    ) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message:
          'CPU 2048 requires memory between 4GB and 16GB in 1GB increments',
      })
    } else if (
      val.cpu === 4096 &&
      val.memory >= 8192 &&
      val.memory <= 30720 &&
      val.memory % 1024 !== 0
    ) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message:
          'CPU 4096 requires memory between 8GB and 30GB in 1GB increments',
      })
    } else if (
      val.cpu === 8192 &&
      val.memory >= 16384 &&
      val.memory <= 61440 &&
      val.memory % 4096 !== 0
    ) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message:
          'CPU 8192 requires memory between 16GB and 60GB in 4GB increments',
      })
    } else if (
      val.cpu === 16384 &&
      val.memory >= 32768 &&
      val.memory <= 122880 &&
      val.memory % 8192 !== 0
    ) {
      ctx.addIssue({
        code: 'awsFargateEcs.cpu-memory-conflict',
        path: ['memory'],
        message:
          'CPU 16384 requires memory between 32GB and 120GB in 8GB increments',
      })
    }
  })

/**
 * ConfigContainerAwsLambdaSchema defines the compute configuration for a container.
 * It includes the memory configuration.
 */
export const ConfigContainerAwsLambda = z
  .object({
    memory: z
      .number()
      .min(128)
      .max(10240)
      .default(1024)
      .describe(
        'Memory allocation in MB. Any value between 128MB and 10,240MB',
      ),
    vpc: z
      .boolean()
      .default(false)
      .describe('Enable VPC support for the Lambda function'),
    timeout: z.number().default(6).describe('Timeout in seconds'),
  })
  .strict()
  .describe('AWS Lambda specific compute configuration')

/**
 * ConfigContainerAwsIamSchema defines the IAM configuration for a container.
 * It includes the custom policy.
 */
const ConfigContainerAwsIam = z
  .object({
    roleArn: z
      .string()
      .optional()
      .describe('ARN of an existing IAM role to use'),
    customPolicy: z
      .object({
        Version: z
          .string()
          .describe('IAM policy version, typically "2012-10-17"'),
        Statement: z.array(
          z
            .object({
              Effect: z
                .enum(['Allow', 'Deny'])
                .describe('Whether to Allow or Deny the specified actions'),
              Action: z
                .union([z.string(), z.array(z.string())])
                .describe('AWS IAM actions to allow or deny'),
              Resource: z
                .union([z.string(), z.array(z.string())])
                .describe('AWS resource ARNs the policy applies to'),
            })
            .strict(),
        ),
      })
      .describe(
        'Custom IAM policy for the container. Accepts standard AWS IAM policy syntax in YAML format.',
      )
      .strict()
      .optional(),
  })
  .strict()
  .describe(
    'Optionally deploy an AWS IAM Role for this specific container with any custom policies it needs.',
  )

/**
 * ConfigContainerCompute defines the compute configuration for a container.
 * It includes the source code path, the compute type, and the compute specific configurations.
 */
export const ConfigContainerCompute = z
  .object({
    type: z
      .enum(['awsLambda', 'awsFargateEcs'])
      .default('awsLambda')
      .describe('The compute service to deploy this container to.'),
    awsFargateEcs: ConfigContainerAwsFargateEcs.optional().describe(
      'AWS Fargate ECS specific compute configuration',
    ),
    awsLambda: ConfigContainerAwsLambda.optional().describe(
      'AWS Lambda specific compute configuration',
    ),
    awsIam: ConfigContainerAwsIam.optional().describe(
      'Optionally deploy an AWS IAM Role for this specific container with any custom policies it needs.',
    ),
  })
  .strict()
  .describe(
    'Describes the compute service to deploy this container to and its specific configurations. Offers abstract properties that work across all compute services and specific properties that work with a specific compute service.',
  )
  .superRefine((val, ctx) => {
    if (val.type === 'awsLambda' && val.awsFargateEcs) {
      return ctx.addIssue({
        code: 'invalid-compute-config-for-selected-platform',
        message: 'Fargate Configuration cannot be set when using awsLambda',
        path: ['awsFargateEcs'],
      })
    }

    if (val.type === 'awsFargateEcs' && val.awsLambda) {
      return ctx.addIssue({
        code: 'invalid-compute-config-for-selected-platform',
        message: 'Lambda Configuration cannot be set when using awsFargateEcs',
        path: ['awsLambda'],
      })
    }
  })

/**
 * ConfigContainerDevModeHooksSchema defines the hooks for a container.
 * It includes the hooks for the dev mode.
 */
export const ConfigContainerDevModeHooksSchema = z
  .enum(['onreload'])
  .describe(
    'The type of hook to run when the container is reloaded. Must be a valid shell command that works in the system default shell.',
  )

/**
 * ConfigContainerDevModeSchema can always be set, but currently it only supports nodejs apps.
 * We plan to support python in the near future.
 */
export const ConfigContainerDevModeSchema = z
  .object({
    hooks: z
      .record(ConfigContainerDevModeHooksSchema, z.string())
      .describe('Commands to run when specific dev mode events occur'),
    watchPath: z
      .string()
      .optional()
      .describe('Custom path to watch for file changes'),
    watchExtensions: z
      .array(z.string())
      .optional()
      .describe('File extensions to watch for changes'),
    excludeDirectories: z
      .array(z.string())
      .optional()
      .describe('Directories to exclude from file watching'),
  })
  .strict()
  .describe(
    'Container-specific development mode configuration for local development',
  )

/**
 * ConfigContainerBuildSchema defines the build configuration for a container.
 * It includes build arguments, Dockerfile string, and build options for custom builds.
 */
export const ConfigContainerBuildSchema = z
  .object({
    args: z
      .record(z.string(), z.string())
      .optional()
      .describe('Build-time arguments passed to Docker build command'),
    dockerFileString: z
      .string()
      .optional()
      .describe(
        'Optional Dockerfile as a string (not recommended, prefer file in source code)',
      ),
    options: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Additional Docker build flags (e.g. "--target production"). Accepts either a space-delimited string or an array of strings',
      ),
  })
  .strict()
  .describe(
    'Container build configuration including build arguments and build options',
  )

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
  })
  .strict()
  .describe(
    'Container configuration including compute, routing, environment, and development settings',
  )

export const ConfigContainersSchema = z
  .record(z.string(), ConfigContainerSchema)
  .optional()
  .describe('Map of containers to be deployed and their configurations')

/**
 * ConfigDeploymentAwsApi defines the AWS API deployment configuration for a container.
 * This is not in use yet, but will be in near future to enter existing resources to inherit,
 * such as existing VPC, Subnets, Security Groups, ALB etc.
 */
export const ConfigDeploymentAwsApi = z.object({
  deployment: z
    .object({
      type: z.enum(['awsApi@1.0']),
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
 *
 *
 * ==================================================
 *             STATE: DEPLOYMENT TYPES
 * ==================================================
 *
 * These types are for the state of specific deployment types.
 *
 *
 */

/**
 * Schema for AWS ALB state
 */
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

/**
 * Schema for container configuration
 */
const StateContainerSchema = z
  .object({
    src: z.string().optional(),
    compute: StateContainerCompute.optional(),
    folderHash: z.string().optional(),
    routing: StateRouting.optional(),
    timeLastDeployed: z.string().datetime().optional(),
    deployedOnLastDeployment: z.boolean().optional(),
  })
  .strict()

/**
 * StateDeploymentAwsApi defines the AWS API deployment schema.
 */
const StateDeploymentTypeAwsApi = {
  deploymentType: z.enum(['awsApi@1.0']).default('awsApi@1.0'),
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
    })
    .strict()
    .optional()
    .default({
      enabled: false,
      distributionId: null,
      distributionDomainName: null,
    }),
}

/**
 * Serverless Engine Deployment State Schema
 */
const ServerlessEngineDeploymentStateBase = {
  timeCreated: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
  timeLastUpdated: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
  timeLastDeployed: z.string().datetime().optional(),
  timeLastRemoved: z.string().datetime().optional(),
  name: z.string().default(() => 'unknown'),
  stage: z.string().default(() => 'dev'),
  isDeployed: z.boolean().default(() => false),
  config: z.any().optional(),
}

/**
 * Get the Serverless Engine State Schema for a given deployment type.
 *
 * When using .default() on a schema, the default values are wrapped inside a ZodDefault.
 * This causes issues with merge/extend because the inner shape isn't exposed directly.
 * To work around this, we access the inner schema via ._def.innerType for the deployment-specific schema.
 *
 * @param {Object} args - The function arguments
 * @param {string} args.deploymentType - The deployment type
 * @returns {z.ZodObject} The Serverless Engine State Schema for the given deployment type with defaults applied
 */
export const getServerlessEngineDeploymentStateSchema = ({
  deploymentType,
}) => {
  if (deploymentType === 'awsApi@1.0') {
    return z
      .object({
        ...ServerlessEngineDeploymentStateBase,
        ...StateDeploymentTypeAwsApi,
      })
      .strict()
  } else if (deploymentType === 'sfaiAws@1.0') {
    return z
      .object({
        ...ServerlessEngineDeploymentStateBase,
        ...StateDeploymentTypeSfaiAws,
      })
      .strict()
  } else if (deploymentType === 'aws@1.0') {
    return z
      .object({
        ...ServerlessEngineDeploymentStateBase,
        ...StateDeploymentTypeAws,
      })
      .strict()
  }
  throw new Error(`Unsupported deploymentType: ${deploymentType}`)
}

const ConfigSfaiAwsIntegrationEventbridgeSchema = z.object({
  type: z.literal('awsEventBridge'),
  handler: z.string().describe('Path to the handler function'),
  pattern: z
    .record(z.string(), z.any())
    .describe('The pattern to filter events by'),
})

const ConfigSfaiAwsIntegrationScheduleSchema = z.object({
  type: z.literal('schedule'),
  handler: z.string().describe('Path to the handler function'),
  schedule: z
    .string()
    .describe(
      'The schedule to run the handler function, either in rate format or cron format',
    ),
})

const ConfigSfaiAwsIntegrationSlackSchema = z
  .object({
    handler: z.string().describe('Path to the handler function').optional(),
    type: z.literal('slack'),
    name: z.string().describe('Display name for the Slack app'),
    socketMode: z
      .boolean()
      .default(false)
      .describe('Whether to use socket mode for the Slack app'),
    credentials: z
      .object({
        signingSecret: z
          .string()
          .describe('The signing secret for the Slack app'),
        botToken: z.string().describe('The bot token for the Slack app'),
        appToken: z
          .string()
          .describe(
            'The app token for the Slack app, if socketMode is enabled then this must be provided',
          )
          .optional(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.socketMode && val.credentials && !val.credentials.appToken) {
      return ctx.addIssue({
        code: 'invalid-credentials',
        message: 'appToken is required when socketMode is enabled',
      })
    }
  })
const ConfigSfaiAwsIntegrationStreamSchema = z.object({
  type: z.literal('stream'),
  handler: z.string().describe('Path to the handler function'),
})

const ConfigSfaiAwsIntegrationMcpSchema = z.object({
  type: z.literal('mcp'),
  handler: z.string().describe('Path to the handler function').optional(),
  description: z
    .string()
    .describe('The description of the MCP that would be used by tool calls')
    .optional(),
  bearerToken: z
    .string()
    .describe('The bearer token to use for the MCP')
    .optional(),
})

export const ConfigSfaiAwsIntegrationsSchema = z.record(
  z.string(),
  z.union([
    ConfigSfaiAwsIntegrationEventbridgeSchema,
    ConfigSfaiAwsIntegrationSlackSchema,
    ConfigSfaiAwsIntegrationStreamSchema,
    ConfigSfaiAwsIntegrationScheduleSchema,
    ConfigSfaiAwsIntegrationMcpSchema,
  ]),
)

export const ConfigSfaiAwsAgentSchema = z
  .object({
    name: z.string().describe('The name of the agent'),
    src: z.string().describe('Path to the agent code'),
    environment: z
      .record(JSONValue)
      .optional()
      .describe('Environment variables to pass to the container'),
    type: z
      .enum(['mastraAgent'])
      .default('mastraAgent')
      .describe('The type of agent to deploy'),
    compute: ConfigContainerCompute.describe(
      'Compute service configuration (AWS Lambda or Fargate ECS)',
    ).default({ type: 'awsFargateEcs' }),
    routing: z
      .object({
        domain: z.string().describe('The domain to deploy the agent to'),
      })
      .describe('Container routing and domain configuration')
      .optional(),
    dev: ConfigContainerDevModeSchema.optional().describe(
      'Development mode settings',
    ),
    integrations: ConfigSfaiAwsIntegrationsSchema.optional().describe(
      'Integrations for the agent',
    ),
  })
  .strict()
  .describe(
    'Container configuration including compute, routing, environment, and development settings',
  )
  .superRefine((val, ctx) => {
    const slackIntegrations = Object.values(val.integrations ?? {}).filter(
      (integration) => integration.type === 'slack',
    )
    if (slackIntegrations.length > 1) {
      return ctx.addIssue({
        code: 'invalid-integrations',
        message: 'Only one Slack integration is allowed',
      })
    }
  })

export const ConfigDeploymentSfaiAws = z.object({
  deployment: z
    .object({
      type: z.enum(['sfaiAws@1.0']),
    })
    .default({ type: 'sfaiAws@1.0' })
    .describe('Configuration for the SFAI AWS deployment architecture'),
})

const StateAgentContainerSchema = z
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

const StateDeploymentTypeSfaiAws = {
  deploymentType: z.enum(['sfaiAws@1.0']).default('sfaiAws@1.0'),
  containers: z
    .record(z.string(), StateAgentContainerSchema)
    .optional()
    .default({}),
  region: z.string().default(process.env.AWS_REGION || 'us-east-1'),
  integrations: z.record(z.string(), z.any()).optional(),
  awsVpc: z
    .object({
      id: z.string().nullable().optional(),
      publicSubnets: z.array(z.string()).optional(),
      privateSubnets: z.array(z.string()).optional(),
      s2sSecurityGroupId: z.string().nullable().optional(),
      loadBalancerSecurityGroupId: z.string().nullable().optional(),
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
    })
    .strict()
    .optional()
    .default({
      enabled: false,
      distributionId: null,
      distributionDomainName: null,
    }),
}
