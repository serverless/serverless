import { z } from 'zod'
import {
  ConfigContainerAwsLambda,
  ConfigContainerAwsFargateEcs,
  ConfigContainerCompute,
} from '../src/types.js'

describe('AWS Compute Configuration Schema Validation', () => {
  describe('AWS Lambda Configuration', () => {
    test('should accept valid memory configurations', () => {
      const validConfigs = [
        { memory: 128 },
        { memory: 1024 }, // default
        { memory: 10240 }, // max
        { memory: 256, vpc: true },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigContainerAwsLambda.parse(config)).not.toThrow()
      })
    })

    test('should reject invalid memory values', () => {
      const invalidConfigs = [
        { memory: 127 }, // below min
        { memory: 10241 }, // above max
        { memory: 0 },
        { memory: -1024 },
      ]
      invalidConfigs.forEach((config) => {
        expect(() => ConfigContainerAwsLambda.parse(config)).toThrow()
      })
    })

    test('should handle vpc configuration', () => {
      const config = { memory: 1024, vpc: true }
      const result = ConfigContainerAwsLambda.parse(config)
      expect(result.vpc).toBe(true)
    })

    test('should default vpc to false if not specified', () => {
      const config = { memory: 1024 }
      const result = ConfigContainerAwsLambda.parse(config)
      expect(result.vpc).toBe(false)
    })
  })

  describe('AWS Fargate ECS Configuration', () => {
    test('should accept valid CPU/memory combinations', () => {
      const validConfigs = [
        // CPU 256 (only 512, 1024, 2048)
        { cpu: 256, memory: 512 },
        { cpu: 256, memory: 1024 },
        { cpu: 256, memory: 2048 },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigContainerAwsFargateEcs.parse(config)).not.toThrow()
      })
    })

    test('should reject invalid CPU values', () => {
      const invalidConfigs = [
        { cpu: 100, memory: 1024 }, // CPU too low
        { cpu: 20000, memory: 1024 }, // CPU too high
        { cpu: 300, memory: 1024 }, // Invalid CPU value (not in allowed values)
        { cpu: 768, memory: 1024 }, // Invalid CPU value (not in allowed values)
      ]

      invalidConfigs.forEach((config) => {
        const result = ConfigContainerAwsFargateEcs.safeParse(config)
        expect(result.success).toBe(false)
        const error = result.error.errors[0]

        if (config.cpu < 256) {
          expect(error.code).toBe('too_small')
          expect(error.message).toMatch(/must be greater than or equal to 256/)
        } else if (config.cpu > 16384) {
          expect(error.code).toBe('too_big')
          expect(error.message).toMatch(/must be less than or equal to 16384/)
        } else {
          // For invalid CPU values that are within range but not in allowed values
          expect(error.code).toBe('custom')
          expect(error.message).toBe(
            'CPU must be one of: 256, 512, 1024, 2048, 4096, 8192, 16384',
          )
        }
      })
    })

    test('should reject invalid memory values', () => {
      const invalidConfigs = [
        { cpu: 256, memory: 256 }, // Memory too low
        { cpu: 256, memory: 131072 }, // Memory too high
      ]

      invalidConfigs.forEach((config) => {
        const result = ConfigContainerAwsFargateEcs.safeParse(config)
        expect(result.success).toBe(false)
        const error = result.error.errors[0]

        if (config.memory < 512) {
          expect(error.code).toBe('too_small')
          expect(error.message).toMatch(/must be greater than or equal to 512/)
        } else if (config.memory > 122880) {
          expect(error.code).toBe('too_big')
          expect(error.message).toMatch(/must be less than or equal to 122880/)
        }
      })
    })

    test('should reject invalid CPU/memory combinations', () => {
      const invalidConfigs = [
        { cpu: 256, memory: 768 }, // Not in allowed values for CPU 256
        { cpu: 256, memory: 1536 }, // Not in allowed values for CPU 256
        { cpu: 256, memory: 3072 }, // Not in allowed values for CPU 256
      ]

      invalidConfigs.forEach((config) => {
        const result = ConfigContainerAwsFargateEcs.safeParse(config)
        expect(result.success).toBe(false)
        const error = result.error.errors[0]
        expect(error.code).toBe('awsFargateEcs.cpu-memory-conflict')
        expect(error.message).toBe('CPU 256 requires memory 512, 1024, or 2048')
      })
    })
  })

  describe('AWS Fargate ECS Scaling Configuration', () => {
    test('should validate scaling configuration', () => {
      const validConfig = {
        cpu: 256,
        memory: 512,
        scale: [
          { type: 'min', min: 1 },
          { type: 'max', max: 10 },
          { type: 'target', target: 'cpu', value: 75 },
          { type: 'target', target: 'memory', value: 80 },
        ],
      }
      expect(() =>
        ConfigContainerAwsFargateEcs.parse(validConfig),
      ).not.toThrow()
    })

    test('should reject invalid scaling configurations', () => {
      const invalidConfigs = [
        {
          cpu: 256,
          memory: 512,
          scale: [
            { type: 'min', min: 0 }, // too small
            { type: 'max', max: 10 },
          ],
        },
        {
          cpu: 256,
          memory: 512,
          scale: [
            { type: 'min', min: 1 },
            { type: 'max', max: 0 }, // too small
          ],
        },
        {
          cpu: 256,
          memory: 512,
          scale: [
            { type: 'min', min: 10 },
            { type: 'max', max: 5 }, // min > max
          ],
        },
      ]
      invalidConfigs.forEach((config) => {
        expect(() => ConfigContainerAwsFargateEcs.parse(config)).toThrow()
      })
    })

    test('should validate target scaling policies', () => {
      const validConfigs = [
        {
          cpu: 256,
          memory: 512,
          scale: [
            { type: 'min', min: 1 },
            { type: 'max', max: 10 },
            { type: 'target', target: 'cpu', value: 50 },
          ],
        },
        {
          cpu: 256,
          memory: 512,
          scale: [
            { type: 'min', min: 1 },
            { type: 'max', max: 10 },
            { type: 'target', target: 'memory', value: 75 },
          ],
        },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigContainerAwsFargateEcs.parse(config)).not.toThrow()
      })
    })
  })

  describe('Compute Type Validation', () => {
    test('should validate Lambda compute type', () => {
      const config = {
        type: 'awsLambda',
        awsLambda: {
          memory: 1024,
        },
      }
      const result = ConfigContainerCompute.parse(config)
      expect(result.type).toBe('awsLambda')
    })

    test('should validate Fargate compute type', () => {
      const config = {
        type: 'awsFargateEcs',
        awsFargateEcs: {
          cpu: 256,
          memory: 512,
        },
      }
      const result = ConfigContainerCompute.parse(config)
      expect(result.type).toBe('awsFargateEcs')
    })

    test('should reject mixed compute configurations', () => {
      const config = {
        type: 'awsLambda',
        awsLambda: { memory: 1024 },
        awsFargateEcs: { cpu: 256, memory: 512 },
      }
      expect(() => ConfigContainerCompute.parse(config)).toThrow()
    })

    test('should reject invalid compute types', () => {
      const config = {
        type: 'invalidType',
        awsLambda: { memory: 1024 },
      }
      expect(() => ConfigContainerCompute.parse(config)).toThrow()
    })

    test('should default to awsLambda type if not specified', () => {
      const config = {
        awsLambda: { memory: 1024 },
      }
      const result = ConfigContainerCompute.parse(config)
      expect(result.type).toBe('awsLambda')
    })
  })
})
