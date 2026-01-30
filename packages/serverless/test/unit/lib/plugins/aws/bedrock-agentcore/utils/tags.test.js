'use strict'

import {
  mergeTags,
  tagsToCloudFormationArray,
  cloudFormationArrayToTags,
} from '../../../../../../../lib/plugins/aws/bedrock-agentcore/utils/tags.js'

describe('Tags Utilities', () => {
  describe('mergeTags', () => {
    test('returns empty object with empty inputs', () => {
      const result = mergeTags({}, {})

      expect(result).toEqual({})
    })

    test('includes default tags', () => {
      const defaultTags = {
        Environment: 'production',
        Team: 'platform',
      }

      const result = mergeTags(defaultTags, {})

      expect(result.Environment).toBe('production')
      expect(result.Team).toBe('platform')
    })

    test('includes resource-specific tags', () => {
      const resourceTags = {
        Project: 'my-project',
        Version: '1.0',
      }

      const result = mergeTags({}, resourceTags)

      expect(result.Project).toBe('my-project')
      expect(result.Version).toBe('1.0')
    })

    test('resource tags override default tags', () => {
      const defaultTags = {
        Environment: 'default',
        Team: 'platform',
      }
      const resourceTags = {
        Environment: 'custom',
      }

      const result = mergeTags(defaultTags, resourceTags)

      expect(result.Environment).toBe('custom')
      expect(result.Team).toBe('platform')
    })

    test('merges all tags from both sources', () => {
      const defaultTags = {
        Environment: 'production',
        Team: 'platform',
      }
      const resourceTags = {
        Project: 'my-project',
        Version: '1.0',
      }

      const result = mergeTags(defaultTags, resourceTags)

      expect(result.Environment).toBe('production')
      expect(result.Team).toBe('platform')
      expect(result.Project).toBe('my-project')
      expect(result.Version).toBe('1.0')
    })
  })

  describe('tagsToCloudFormationArray', () => {
    test('converts object to array format', () => {
      const tags = {
        Environment: 'production',
        Team: 'platform',
      }

      const result = tagsToCloudFormationArray(tags)

      expect(result).toEqual([
        { Key: 'Environment', Value: 'production' },
        { Key: 'Team', Value: 'platform' },
      ])
    })

    test('converts values to strings', () => {
      const tags = {
        Version: 123,
        Enabled: true,
      }

      const result = tagsToCloudFormationArray(tags)

      expect(result).toEqual([
        { Key: 'Version', Value: '123' },
        { Key: 'Enabled', Value: 'true' },
      ])
    })

    test('returns empty array for empty object', () => {
      const result = tagsToCloudFormationArray({})

      expect(result).toEqual([])
    })
  })

  describe('cloudFormationArrayToTags', () => {
    test('converts array to object format', () => {
      const tagsArray = [
        { Key: 'Environment', Value: 'production' },
        { Key: 'Team', Value: 'platform' },
      ]

      const result = cloudFormationArrayToTags(tagsArray)

      expect(result).toEqual({
        Environment: 'production',
        Team: 'platform',
      })
    })

    test('returns empty object for empty array', () => {
      const result = cloudFormationArrayToTags([])

      expect(result).toEqual({})
    })

    test('handles duplicate keys (last wins)', () => {
      const tagsArray = [
        { Key: 'Environment', Value: 'first' },
        { Key: 'Environment', Value: 'second' },
      ]

      const result = cloudFormationArrayToTags(tagsArray)

      expect(result.Environment).toBe('second')
    })
  })
})
