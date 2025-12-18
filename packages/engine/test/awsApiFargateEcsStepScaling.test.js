/**
 * @fileoverview Unit tests for step scaling policy validation in types.js.
 */

import { ConfigContainerAwsFargateEcsScaleSchema } from '../src/types.js'

describe('Step Scaling Policy Validation', () => {
  test('should validate valid step scaling policy configuration', () => {
    const validConfig = [
      {
        type: 'step',
        adjustmentType: 'ChangeInCapacity',
        stepAdjustments: [
          {
            metricIntervalLowerBound: 0,
            metricIntervalUpperBound: 20,
            scalingAdjustment: 1,
          },
        ],
        cooldown: 60,
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        threshold: 75,
        comparisonOperator: 'GreaterThanThreshold',
      },
      {
        type: 'max',
        max: 10,
      },
    ]

    const result =
      ConfigContainerAwsFargateEcsScaleSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  test('should reject step scaling policy without required fields', () => {
    const invalidConfig = [
      {
        type: 'step',
        adjustmentType: 'ChangeInCapacity',
        stepAdjustments: [
          {
            metricIntervalLowerBound: 0,
            scalingAdjustment: 1,
          },
        ],
      },
    ]

    const result =
      ConfigContainerAwsFargateEcsScaleSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    expect(
      result.error.issues.some((issue) => issue.path.includes('metricName')),
    ).toBe(true)
    expect(
      result.error.issues.some((issue) => issue.path.includes('namespace')),
    ).toBe(true)
    expect(
      result.error.issues.some((issue) => issue.path.includes('threshold')),
    ).toBe(true)
    expect(
      result.error.issues.some((issue) =>
        issue.path.includes('comparisonOperator'),
      ),
    ).toBe(true)
  })

  test('should reject step scaling policy with overlapping step adjustments', () => {
    const invalidConfig = [
      {
        type: 'step',
        adjustmentType: 'ChangeInCapacity',
        stepAdjustments: [
          {
            metricIntervalLowerBound: 0,
            metricIntervalUpperBound: 20,
            scalingAdjustment: 1,
          },
          {
            metricIntervalLowerBound: 15, // Overlaps with previous range
            metricIntervalUpperBound: 30,
            scalingAdjustment: 2,
          },
        ],
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        threshold: 75,
        comparisonOperator: 'GreaterThanThreshold',
      },
    ]

    const result =
      ConfigContainerAwsFargateEcsScaleSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toContain(
      'Step adjustments must be in ascending order with no overlap',
    )
  })

  test('should reject step scaling policy combined with target tracking', () => {
    const invalidConfig = [
      {
        type: 'step',
        adjustmentType: 'ChangeInCapacity',
        stepAdjustments: [
          {
            metricIntervalLowerBound: 0,
            metricIntervalUpperBound: 20,
            scalingAdjustment: 1,
          },
        ],
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        threshold: 75,
        comparisonOperator: 'GreaterThanThreshold',
      },
      {
        type: 'target',
        target: 'cpu',
        value: 70,
      },
    ]

    const result =
      ConfigContainerAwsFargateEcsScaleSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toContain(
      'Step scaling cannot be combined with target tracking scaling',
    )
  })

  test('should validate step scaling policy with multiple non-overlapping step adjustments', () => {
    const validConfig = [
      {
        type: 'step',
        adjustmentType: 'ChangeInCapacity',
        stepAdjustments: [
          {
            metricIntervalLowerBound: 0,
            metricIntervalUpperBound: 20,
            scalingAdjustment: 1,
          },
          {
            metricIntervalLowerBound: 20,
            metricIntervalUpperBound: 40,
            scalingAdjustment: 2,
          },
          {
            metricIntervalLowerBound: 40,
            scalingAdjustment: 3,
          },
        ],
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        threshold: 75,
        comparisonOperator: 'GreaterThanThreshold',
        metricAggregationType: 'Average',
        cooldown: 60,
      },
      {
        type: 'max',
        max: 10,
      },
    ]

    const result =
      ConfigContainerAwsFargateEcsScaleSchema.safeParse(validConfig)
    console.log(
      'Multiple Step Adjustments Validation Result:',
      JSON.stringify(result, null, 2),
    )
    expect(result.success).toBe(true)
  })
})
