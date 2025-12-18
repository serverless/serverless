/**
 * @fileoverview Unit tests for the computeDesiredScaling function in deployAwsFargateEcs.js.
 */

import { computeDesiredScaling } from '../src/lib/deploymentTypes/awsApi/deployAwsFargateEcs.js'

describe('computeDesiredScaling: Determines the desired count for a service', () => {
  /**
   * Test: When a target is provided and the current running count is within the provided min and max,
   * the function should return the current running count.
   */
  test('should return currentRunningCount within range when target is provided', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 5,
      min: 2,
      max: 10,
      desired: undefined,
      targetOne: 1,
      targetTwo: null,
    })
    expect(result).toBe(5)
  })

  /**
   * Test: When a target is provided and the current running count is below the minimum,
   * the function should return the minimum value.
   */
  test('should return min when target is provided and currentRunningCount is below min', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 1,
      min: 2,
      max: 10,
      desired: undefined,
      targetOne: 1,
      targetTwo: null,
    })
    expect(result).toBe(2)
  })

  /**
   * Test: When a target is provided and the current running count is above the maximum,
   * the function should return the maximum value.
   */
  test('should return max when target is provided and currentRunningCount is above max', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 12,
      min: 2,
      max: 10,
      desired: undefined,
      targetOne: null,
      targetTwo: 1,
    })
    expect(result).toBe(10)
  })

  /**
   * Test: When a target is provided but the minimum is null, the function should fall back to
   * returning the current running count if available.
   */
  test('should return currentRunningCount when target is provided but min is null and currentRunningCount is provided', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 3,
      min: null,
      max: 10,
      desired: undefined,
      targetOne: 5,
      targetTwo: null,
    })
    expect(result).toBe(3)
  })

  /**
   * Test: When a target is provided but the minimum is null and the current running count is unknown,
   * the function should return the fallback value of 1.
   */
  test('should return 1 when target is provided but min is null and currentRunningCount is null', () => {
    const result = computeDesiredScaling({
      currentRunningCount: null,
      min: null,
      max: 10,
      desired: undefined,
      targetOne: 5,
      targetTwo: null,
    })
    expect(result).toBe(1)
  })

  /**
   * Test: When no target is provided and the desired value is set,
   * the function should return the desired value.
   */
  test('should return desired when no target is provided and desired is set', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 10,
      min: 2,
      max: 20,
      desired: 7,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(7)
  })

  /**
   * Test: When no target is provided, desired is not set, and both min and max are undefined,
   * the function should return the fallback value of 1.
   */
  test('should return 1 when no target, desired not set, and min/max are undefined', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 10,
      min: undefined,
      max: undefined,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(1)
  })

  /**
   * Test: When no target is provided, desired is not set, and both min and max are explicitly null,
   * the function should return the fallback value of 1, even if currentRunningCount exists.
   */
  test('should return 1 when no target, desired not set, and min/max are null (even if currentRunningCount exists)', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 5,
      min: null,
      max: null,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(1)
  })

  /**
   * Test: When no target is provided and the current running count is within the provided min and max,
   * the function should return the current running count.
   */
  test('should return currentRunningCount when no target and currentRunningCount within min and max', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 5,
      min: 2,
      max: 8,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(5)
  })

  /**
   * Test: When no target is provided and the current running count is unknown,
   * the function should return the minimum value.
   */
  test('should return min when no target and currentRunningCount is null', () => {
    const result = computeDesiredScaling({
      currentRunningCount: null,
      min: 2,
      max: 8,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(2)
  })

  /**
   * Test: When no target is provided and the current running count is below the minimum,
   * the function should return the minimum value.
   */
  test('should return min when no target and currentRunningCount is below min', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 1,
      min: 2,
      max: 10,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(2)
  })

  /**
   * Test: When no target is provided and the current running count is above the maximum,
   * the function should return the maximum value.
   */
  test('should return max when no target and currentRunningCount is above max', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 15,
      min: 2,
      max: 10,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(10)
  })

  /**
   * Test: When only a minimum constraint is provided (with no maximum) and the current running count
   * is below the minimum, the function should return the minimum value.
   */
  test('should return min when only min is provided and currentRunningCount is below min', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 1,
      min: 2,
      max: undefined,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(2)
  })

  /**
   * Test: When only a minimum constraint is provided (with no maximum) and the current running count
   * is above the minimum, the function should return the current running count.
   */
  test('should return currentRunningCount when only min is provided and currentRunningCount is above min', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 5,
      min: 2,
      max: undefined,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(5)
  })

  /**
   * Test: When only a maximum constraint is provided (with no minimum) and the current running count is unknown,
   * the function should return the fallback value of 1.
   */
  test('should return 1 when only max is provided and currentRunningCount is null', () => {
    const result = computeDesiredScaling({
      currentRunningCount: null,
      min: undefined,
      max: 10,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(1)
  })

  /**
   * Test: When only a maximum constraint is provided (with no minimum) and the current running count is known,
   * the function should simply return the current running count.
   */
  test('should return currentRunningCount when only max is provided and currentRunningCount is not null', () => {
    const result = computeDesiredScaling({
      currentRunningCount: 7,
      min: undefined,
      max: 10,
      desired: undefined,
      targetOne: null,
      targetTwo: null,
    })
    expect(result).toBe(7)
  })
})
