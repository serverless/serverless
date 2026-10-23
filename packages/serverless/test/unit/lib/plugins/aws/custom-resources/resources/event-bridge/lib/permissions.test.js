import { describe, beforeEach, it, expect } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const nodeRequire = createRequire(import.meta.url)

const permissionsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../../../lib/plugins/aws/custom-resources/resources/event-bridge/lib/permissions.js',
)

// Custom resource handlers are CommonJS that only runs inside Lambda, while this
// package is ESM, so compile them as CommonJS with a stubbed `require`
const loadCommonJs = (filePath, stubs) => {
  const module = { exports: {} }
  const localRequire = (id) => {
    if (id in stubs) return stubs[id]
    if (id.startsWith('.')) {
      return loadCommonJs(
        path.resolve(path.dirname(filePath), `${id}.js`),
        stubs,
      )
    }
    return nodeRequire(id)
  }
  vm.compileFunction(
    fs.readFileSync(filePath, 'utf8'),
    ['exports', 'require', 'module', '__filename', '__dirname'],
    { filename: filePath },
  )(module.exports, localRequire, module, filePath, path.dirname(filePath))
  return module.exports
}

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
