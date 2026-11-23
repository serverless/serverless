import { describe, beforeEach, it, expect } from '@jest/globals'
import path from 'path'
import { fileURLToPath } from 'url'
import loadCommonJs from '../../load-common-js.js'

const permissionsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../../../lib/plugins/aws/custom-resources/resources/event-bridge/lib/permissions.js',
)

describe('custom-resources event-bridge permissions', () => {
  let sentCommands
  let addPermission

  beforeEach(() => {
    sentCommands = []
    class LambdaClient {
      constructor() {
        this.config = {}
      }

      async send(command) {
        sentCommands.push(command)
        return {}
      }
    }
    class AddPermissionCommand {
      constructor(input) {
        this.input = input
      }
    }
    class RemovePermissionCommand {
      constructor(input) {
        this.input = input
      }
    }

    ;({ addPermission } = loadCommonJs(permissionsPath, {
      '../../utils': { MAX_AWS_REQUEST_TRY: 3 },
      '@aws-sdk/client-lambda': {
        LambdaClient,
        AddPermissionCommand,
        RemovePermissionCommand,
      },
    }))
  })

  describe('#addPermission()', () => {
    const config = {
      functionName: 'my-function',
      partition: 'aws',
      region: 'us-east-1',
      accountId: '123456789012',
      ruleName: 'my-rule',
    }

    it.each([
      ['not set', undefined],
      ['default', 'default'],
      [
        'the default bus ARN',
        'arn:aws:events:us-east-1:123456789012:event-bus/default',
      ],
    ])(
      'should omit bus name from SourceArn when eventBus is %s',
      async (_, eventBus) => {
        await addPermission({ ...config, eventBus })

        expect(sentCommands).toHaveLength(1)
        expect(sentCommands[0].input.SourceArn).toBe(
          'arn:aws:events:us-east-1:123456789012:rule/my-rule',
        )
      },
    )

    it.each([
      ['a bus name', 'my-bus'],
      ['a bus ARN', 'arn:aws:events:us-east-1:123456789012:event-bus/my-bus'],
    ])(
      'should include bus name in SourceArn when eventBus is %s',
      async (_, eventBus) => {
        await addPermission({ ...config, eventBus })

        expect(sentCommands).toHaveLength(1)
        expect(sentCommands[0].input.SourceArn).toBe(
          'arn:aws:events:us-east-1:123456789012:rule/my-bus/my-rule',
        )
      },
    )
  })
})
