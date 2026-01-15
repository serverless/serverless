import url from 'url'
import path from 'path'
import { ServerlessEngine } from '../../src/index.js'
import { readFile } from 'fs/promises'
import yaml from 'js-yaml'
import { getServerlessContainerFrameworkConfigSchema } from '@serverlessinc/sf-core/src/lib/frameworks/scf/types.js'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { EC2Client, DescribeVpcsCommand } from '@aws-sdk/client-ec2'
import { ECSClient, DescribeClustersCommand } from '@aws-sdk/client-ecs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

let testStateObj = {}

const s3Client = new S3Client({ region: 'us-east-1' })
const ec2Client = new EC2Client({ region: 'us-east-1' })
const ecsClient = new ECSClient({ region: 'us-east-1' })

export const getTestStageName = () => {
  const randomId = Math.floor(1000 + Math.random() * 9000).toString()

  if (process.env.TEST_STAGE && process.env.TEST_STAGE !== '') {
    return `${process.env.TEST_STAGE?.substring(0, 10)}t${randomId}`
      .toLocaleLowerCase()
      .replace('_', '-')
      .replace('--', '-')
  }

  return randomId
    .toLocaleLowerCase()
    .replace('_', '-')
    .replace('--', '-')
    .replace('[', '')
    .replace(']', '')
}

const stage = getTestStageName()

const customDomain = `intpr-${stage}.container-deployment.com`

const testState = {
  load: async () => {
    try {
      const pulledState = await s3Client.send(
        new GetObjectCommand({
          Bucket: 'scf-int-testing',
          Key: `e2e/${stage}/state.json`,
        }),
      )
      const state = JSON.parse(pulledState.Body.transformToString())
      testStateObj = { ...state }
    } catch (err) {
      /** Do nothing */
    }
    return testStateObj
  },
  save: async (state) => {
    testStateObj = state
    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'scf-int-testing',
        Key: `e2e/${stage}/state.json`,
        Body: JSON.stringify(state),
      }),
    )
  },
}

// Utility function to retry operations with delay
const retryOperation = async (
  operation,
  validator,
  retries = 5,
  delayMs = 5000,
) => {
  let lastError

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await operation()

      // Try to validate the result without failing the test immediately
      try {
        validator(result)
        return result // Success - validation passed
      } catch (validationError) {
        // If validation fails, treat it as a retriable error
        lastError = validationError
        console.log(
          `Attempt ${attempt + 1}/${retries} validation failed: ${validationError.message}`,
        )

        if (attempt < retries - 1) {
          // Wait before next retry
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          continue // Try again
        } else {
          throw validationError // Last attempt, re-throw the validation error
        }
      }
    } catch (error) {
      lastError = error
      console.log(`Attempt ${attempt + 1}/${retries} failed: ${error.message}`)

      if (attempt < retries - 1) {
        // Wait before next retry
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else {
        throw lastError // All retries failed
      }
    }
  }

  throw lastError // All retries failed
}

describe('Deploy SCF Service', () => {
  let config
  let configFileDirPath
  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    configFileDirPath = path.join(__dirname, 'fixture')
    const configFile = await readFile(
      path.join(configFileDirPath, 'serverless.containers.yml'),
      'utf8',
    )
    const rawConfig = yaml.load(configFile)
    const schema = getServerlessContainerFrameworkConfigSchema({
      deploymentType: rawConfig.deployment.type,
    })
    config = schema.safeParse(rawConfig).data
  })

  test(
    'should deploy a container to lambda',
    async () => {
      const engine = new ServerlessEngine({
        stateStore: testState,
        projectConfig: config,
        projectPath: configFileDirPath,
        stage,
        provider: { type: 'aws', aws: { region: 'us-east-1' } },
      })
      await engine.deploy()
      const albDns = testStateObj.deployment.awsAlb.dnsName
      expect(testStateObj.deployment?.awsAlb?.dnsName).toBeDefined()
      console.log(albDns)

      const expectedEnv = {
        SERVERLESS_NAMESPACE: 'prexpress',
        SERVERLESS_STAGE: stage,
        SERVERLESS_CONTAINER_NAME: 'service',
        SERVERLESS_COMPUTE_TYPE: 'awsLambda',
        SERVERLESS_ROUTING_PATH_PATTERN: '/*',
        SERVERLESS_LOCAL: 'false',
      }

      // Retry the fetch operation with assertions
      await retryOperation(
        async () => {
          const response = await fetch(`http://${albDns}/info`)
          // Don't assert here, just return the data for validation
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          // Validate the result here instead
          expect(result.status).toBe(200)
          expect(result.data.platform).toBe('awsLambda')
          expect(result.data.env).toEqual(expectedEnv)
        },
      )
    },
    1000 * 60 * 30,
  )

  test(
    'should use a custom domain',
    async () => {
      config.containers.service.routing.domain = customDomain
      const engine = new ServerlessEngine({
        stateStore: testState,
        projectConfig: config,
        projectPath: configFileDirPath,
        stage,
        provider: { type: 'aws', aws: { region: 'us-east-1' } },
      })
      await engine.deploy()

      const expectedEnv = {
        SERVERLESS_NAMESPACE: 'prexpress',
        SERVERLESS_STAGE: stage,
        SERVERLESS_CONTAINER_NAME: 'service',
        SERVERLESS_COMPUTE_TYPE: 'awsLambda',
        SERVERLESS_ROUTING_PATH_PATTERN: '/*',
        SERVERLESS_LOCAL: 'false',
      }

      // Test HTTPS endpoint works
      await retryOperation(
        async () => {
          const response = await fetch(`https://${customDomain}/info`)
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          expect(result.status).toBe(200)
          expect(result.data.env).toEqual(expectedEnv)
        },
      )

      // Test HTTP to HTTPS redirection
      await retryOperation(
        async () => {
          // Use fetch with redirect: 'manual' to prevent auto-following redirects
          const response = await fetch(`http://${customDomain}/info`, {
            redirect: 'manual',
          })
          return {
            status: response.status,
            redirected: response.redirected,
            location: response.headers.get('location'),
          }
        },
        (result) => {
          // Expect a redirection status code (301 or 302)
          expect([301, 302]).toContain(result.status)
          // Check that the redirect is to the HTTPS version of the same URL
          expect(result.location).toBe(`https://${customDomain}:443/info`)
        },
      )
    },
    1000 * 60 * 30,
  )

  test(
    'should switch to ECS Fargate',
    async () => {
      config.containers.service.compute.type = 'awsFargateEcs'
      const engine = new ServerlessEngine({
        stateStore: testState,
        projectConfig: config,
        projectPath: configFileDirPath,
        stage,
        provider: { type: 'aws', aws: { region: 'us-east-1' } },
      })
      await engine.deploy()
      const albDns = testStateObj.deployment.awsAlb.dnsName
      expect(testStateObj.deployment?.awsAlb?.dnsName).toBeDefined()
      console.log(albDns)

      const expectedEnv = {
        SERVERLESS_NAMESPACE: 'prexpress',
        SERVERLESS_STAGE: stage,
        SERVERLESS_CONTAINER_NAME: 'service',
        SERVERLESS_COMPUTE_TYPE: 'awsFargateEcs',
        SERVERLESS_ROUTING_PATH_PATTERN: '/*',
        SERVERLESS_LOCAL: 'false',
      }

      // Retry the fetch operation with assertions
      await retryOperation(
        async () => {
          const response = await fetch(`https://${customDomain}/info`)
          // Don't assert here, just return the data for validation
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          // Validate the result here instead
          expect(result.status).toBe(200)
          expect(result.data.platform).toBe('awsFargateEcs')
          expect(result.data.env).toEqual(expectedEnv)
        },
      )
    },
    1000 * 60 * 30,
  )

  test(
    'should add custom IAM policies',
    async () => {
      const failureResponse = await fetch(`https://${customDomain}/s3/buckets`)
      expect(failureResponse.status).toBe(500)

      config.containers.service.compute.awsIam = {
        customPolicy: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['s3:ListAllMyBuckets'],
              Resource: ['*'],
            },
          ],
        },
      }
      const engine = new ServerlessEngine({
        stateStore: testState,
        projectConfig: config,
        projectPath: configFileDirPath,
        stage,
        provider: { type: 'aws', aws: { region: 'us-east-1' } },
      })
      await engine.deploy()

      const expectedEnv = {
        SERVERLESS_NAMESPACE: 'prexpress',
        SERVERLESS_STAGE: stage,
        SERVERLESS_CONTAINER_NAME: 'service',
        SERVERLESS_COMPUTE_TYPE: 'awsFargateEcs',
        SERVERLESS_ROUTING_PATH_PATTERN: '/*',
        SERVERLESS_LOCAL: 'false',
      }

      await retryOperation(
        async () => {
          const response = await fetch(`https://${customDomain}/s3/buckets`)
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          expect(result.status).toBe(200)
        },
      )

      // Retry the fetch operation with assertions
      await retryOperation(
        async () => {
          const response = await fetch(`https://${customDomain}/info`)
          // Don't assert here, just return the data for validation
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          // Validate the result here instead
          expect(result.status).toBe(200)
          expect(result.data.platform).toBe('awsFargateEcs')
          expect(result.data.env).toEqual(expectedEnv)
        },
      )
    },
    1000 * 60 * 30,
  )

  test(
    'should remove custom IAM policy',
    async () => {
      await retryOperation(
        async () => {
          const response = await fetch(`https://${customDomain}/s3/buckets`)
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          expect(result.status).toBe(200)
        },
      )

      config.containers.service.compute.awsIam = undefined

      const engine = new ServerlessEngine({
        stateStore: testState,
        projectConfig: config,
        projectPath: configFileDirPath,
        stage,
        provider: { type: 'aws', aws: { region: 'us-east-1' } },
      })
      await engine.deploy()

      await retryOperation(
        async () => {
          const response = await fetch(`https://${customDomain}/s3/buckets`)
          const status = response.status
          const data = await response.json()
          return { status, data }
        },
        (result) => {
          expect(result.status).toBe(500)
        },
      )
    },
    1000 * 60 * 30,
  )

  test(
    'should remove deployment',
    async () => {
      const engine = new ServerlessEngine({
        stateStore: testState,
        projectConfig: config,
        projectPath: configFileDirPath,
        stage,
        provider: { type: 'aws', aws: { region: 'us-east-1' } },
      })

      const vpcId = testStateObj.deployment.awsVpc.id
      const clusterArn = testStateObj.deployment.awsEcs.cluster.arn

      await engine.remove({ all: true, force: true })

      try {
        const describeVpcCommand = new DescribeVpcsCommand({
          VpcIds: [vpcId],
        })
        const vpc = await ec2Client.send(describeVpcCommand)
        throw new Error('VPC should not exist')
      } catch (error) {
        expect(error.message).toContain('does not exist')
      }

      const describeClusterCommand = new DescribeClustersCommand({
        Clusters: [clusterArn],
      })
      const cluster = await ecsClient.send(describeClusterCommand)
      expect(cluster.clusters[0].status).toBe('INACTIVE')
    },
    1000 * 60 * 30,
  )
})
