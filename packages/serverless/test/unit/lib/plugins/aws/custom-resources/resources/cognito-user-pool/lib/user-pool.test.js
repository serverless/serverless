import { describe, beforeEach, it, expect } from '@jest/globals'
import path from 'path'
import { fileURLToPath } from 'url'
import loadCommonJs from '../../load-common-js.js'

const userPoolPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../../../lib/plugins/aws/custom-resources/resources/cognito-user-pool/lib/user-pool.js',
)

const functionArn = 'arn:aws:lambda:us-east-1:123456789012:function:my-fn'
const otherFunctionArn =
  'arn:aws:lambda:us-east-1:123456789012:function:other-fn'

describe('custom-resources cognito-user-pool', () => {
  let sentCommands
  let lambdaConfig
  let updateConfiguration
  let removeConfiguration

  const updateInputs = () =>
    sentCommands
      .filter((command) => command.name === 'UpdateUserPool')
      .map((command) => command.input)

  beforeEach(() => {
    sentCommands = []
    lambdaConfig = {}

    const command = (name) =>
      class {
        constructor(input) {
          this.name = name
          this.input = input
        }
      }

    class CognitoIdentityProviderClient {
      constructor() {
        this.config = {}
      }

      async send(cmd) {
        sentCommands.push(cmd)
        if (cmd.name === 'ListUserPools') {
          return { UserPools: [{ Id: 'us-east-1_abc', Name: 'my-pool' }] }
        }
        if (cmd.name === 'DescribeUserPool') {
          return {
            UserPool: {
              Id: 'us-east-1_abc',
              Name: 'my-pool',
              LambdaConfig: structuredClone(lambdaConfig),
              Policies: { PasswordPolicy: {} },
              AdminCreateUserConfig: { UnusedAccountValidityDays: 7 },
            },
          }
        }
        return {}
      }
    }

    ;({ updateConfiguration, removeConfiguration } = loadCommonJs(
      userPoolPath,
      {
        '../../utils': { MAX_AWS_REQUEST_TRY: 3 },
        '@aws-sdk/client-cognito-identity-provider': {
          CognitoIdentityProviderClient,
          ListUserPoolsCommand: command('ListUserPools'),
          DescribeUserPoolCommand: command('DescribeUserPool'),
          UpdateUserPoolCommand: command('UpdateUserPool'),
        },
      },
    ))
  })

  const config = {
    userPoolName: 'my-pool',
    region: 'us-east-1',
    lambdaArn: functionArn,
  }

  describe('InboundFederation', () => {
    it('sets an InboundFederation config and keeps the pool’s other triggers', async () => {
      lambdaConfig = { PreSignUp: otherFunctionArn }

      await updateConfiguration({
        ...config,
        userPoolConfigs: [
          { Trigger: 'InboundFederation', LambdaVersion: 'V1_0' },
        ],
      })

      expect(updateInputs()).toHaveLength(1)
      expect(updateInputs()[0].LambdaConfig).toEqual({
        PreSignUp: otherFunctionArn,
        InboundFederation: { LambdaArn: functionArn, LambdaVersion: 'V1_0' },
      })
    })

    it('replaces the function’s InboundFederation config on update', async () => {
      lambdaConfig = {
        InboundFederation: { LambdaArn: functionArn, LambdaVersion: 'V1_0' },
      }

      await updateConfiguration({
        ...config,
        userPoolConfigs: [{ Trigger: 'PostAuthentication' }],
      })

      expect(updateInputs()[0].LambdaConfig).toEqual({
        PostAuthentication: functionArn,
      })
    })

    it('removes the InboundFederation config that points to the function', async () => {
      lambdaConfig = {
        PreSignUp: otherFunctionArn,
        InboundFederation: { LambdaArn: functionArn, LambdaVersion: 'V1_0' },
      }

      await removeConfiguration(config)

      expect(updateInputs()[0].LambdaConfig).toEqual({
        PreSignUp: otherFunctionArn,
      })
    })

    it('keeps an InboundFederation config that points to another function', async () => {
      lambdaConfig = {
        PreSignUp: functionArn,
        InboundFederation: {
          LambdaArn: otherFunctionArn,
          LambdaVersion: 'V1_0',
        },
      }

      await removeConfiguration(config)

      expect(updateInputs()[0].LambdaConfig).toEqual({
        InboundFederation: {
          LambdaArn: otherFunctionArn,
          LambdaVersion: 'V1_0',
        },
      })
    })
  })
})
