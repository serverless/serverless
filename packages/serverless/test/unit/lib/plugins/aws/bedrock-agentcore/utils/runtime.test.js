'use strict'

import { normalizeRuntime } from '../../../../../../../lib/plugins/aws/bedrock-agentcore/utils/runtime.js'

describe('Runtime Utilities', () => {
  describe('normalizeRuntime', () => {
    test('maps python3.10 to PYTHON_3_10', () => {
      expect(normalizeRuntime('python3.10')).toBe('PYTHON_3_10')
    })

    test('maps python3.11 to PYTHON_3_11', () => {
      expect(normalizeRuntime('python3.11')).toBe('PYTHON_3_11')
    })

    test('maps python3.12 to PYTHON_3_12', () => {
      expect(normalizeRuntime('python3.12')).toBe('PYTHON_3_12')
    })

    test('maps python3.13 to PYTHON_3_13', () => {
      expect(normalizeRuntime('python3.13')).toBe('PYTHON_3_13')
    })

    test('handles case-insensitive input', () => {
      expect(normalizeRuntime('Python3.12')).toBe('PYTHON_3_12')
      expect(normalizeRuntime('PYTHON3.13')).toBe('PYTHON_3_13')
    })

    test('passes through unknown runtime values unchanged', () => {
      expect(normalizeRuntime('PYTHON_3_13')).toBe('PYTHON_3_13')
    })
  })
})
