/**
 * Platform: Deployments
 * Handles saving Service Deployment records to the Serverless Platform
 */
import _ from 'lodash'
import { CoreSDK } from '@serverless-inc/sdk'
import { randomUUID } from 'crypto'
import simpleGit from 'simple-git'
import { ServerlessError, ServerlessErrorCodes } from '@serverless/util'

export class Deployment {
  constructor() {
    this.data = {
      deploymentId: null,
      versionFramework: null,
      versionSDK: 'deprecated',
      versionEnterprisePlugin: 'deprecated',
      serverlessFile: null,
      serverlessFileName: null,
      tenantUid: null,
      orgId: null,
      appUid: null,
      tenantName: null,
      orgName: null,
      appName: null,
      serviceName: null,
      stageName: null,
      regionName: null,
      logsRoleArn: null,
      status: null,
      error: null,
      // IF ARCHIVED... everything below this will be null
      archived: false,
      provider: { type: 'aws' },
      areProvidersUsed: false,
      functions: {},
      subscriptions: [],
      resources: {},
      layers: {},
      plugins: [],
      safeguards: [],
      secrets: [],
      outputs: {},
      custom: {},
    }
  }

  get() {
    return this.data
  }

  set(data) {
    _.merge(this.data, data)
    return this.data
  }

  setFunction(data) {
    if (!data.name) {
      throw new ServerlessError(
        "function 'name' is required",
        ServerlessErrorCodes.deployments.FUNCTION_PARAM_MISSING,
      )
    }

    const fn = {
      // Non-provider-specific data goes here
      name: null,
      description: null,
      type: 'awsLambda',
      timeout: null,
      // Provider-specific data goes here
      custom: {
        handler: null,
        memorySize: null,
        runtime: null,
        role: null,
        onError: null,
        awsKmsKeyArn: null,

        tags: {},

        vpc: {
          securityGroupIds: [],
          subnetIds: [],
        },

        layers: [],
      },
    }

    this.data.functions[data.name] = _.merge(fn, data)
    return this.data.functions[data.name]
  }

  setSubscription(data) {
    if (!data.type) {
      throw new ServerlessError(
        "subscription 'type' is required",
        ServerlessErrorCodes.deployments.SUBSCRIPTION_PARAM_MISSING,
      )
    }
    if (!data.function) {
      throw new ServerlessError(
        "subscription 'function' is required",
        ServerlessErrorCodes.deployments.SUBSCRIPTION_PARAM_MISSING,
      )
    }
    if (!this.data.functions[data.function]) {
      throw new ServerlessError(
        "subscription 'function' must be added to the deployment before subscriptions",
        ServerlessErrorCodes.deployments.SUBSCRIPTION_PARAM_MISSING,
      )
    }

    const sub = {
      // Non-provider-specific data goes here
      type: null,
      function: null,
      // Provider-specific data goes here
      custom: {},
    }

    // Add custom subscription properties per event type
    switch (data.type) {
      case 'aws.apigateway.http':
        sub.custom.path = null
        sub.custom.method = null
        sub.custom.restApiId = null
        sub.custom.cors = false
        break
      default:
        break
    }

    _.merge(sub, data)
    this.data.subscriptions.push(sub)

    return sub
  }
}

/**
 * Set & Save Deployment VCS Data
 */
const setVcsData = async (deploymentInstance) => {
  const vcs = { type: null }
  if (process.env.SERVERLESS_CI_CD === 'true') {
    Object.assign(vcs, {
      type: 'git',
      repository: process.env.SERVERLESS_REPO,
      branch: process.env.SERVERLESS_BRANCH,
      pullRequest: process.env.SERVERLESS_PULL_REQUEST,
      committer: process.env.SERVERLESS_COMMIT_USER,
      commit: process.env.SERVERLESS_COMMIT_SHA,
      commitMessage: process.env.SERVERLESS_COMMIT_MSG,
      deployType: process.env.SERVERLESS_DEPLOY_TYPE,
      relativePath: process.env.SERVERLESS_ROOT_PATH,
    })
  } else {
    const git = simpleGit()
    try {
      const isGit = await git.checkIsRepo()
      if (isGit) {
        vcs.type = 'git'
      }
    } catch (err) {
      /* Ignore */
    }
    if (vcs.type === 'git') {
      const branch = await git.branch()
      if (branch.current) {
        let origin = await git.raw([
          'config',
          `branch.${branch.current}.remote`,
        ])
        if (origin) {
          origin = origin.trim()
          const remotes = await git.getRemotes(true)
          const originRemote = remotes.filter(({ name }) => name === origin)[0]
          if (originRemote && originRemote.refs) {
            vcs.originUrl = originRemote.refs.fetch
          }
        }
        vcs.branch = branch.current
      }
      try {
        vcs.commit = (
          await git.raw(['show', '-s', '--format=%H', branch.current || ''])
        ).trim()
      } catch (gitShowError) {
        // Most likely a fresh repo (no commits)
        if (!gitShowError.message.includes('fatal:')) throw gitShowError
      }
      if (vcs.commit) {
        vcs.commitMessage = (
          await git.raw(['show', '-s', '--format=%B', branch.current || ''])
        ).trim()
        vcs.committerEmail = (
          await git.raw(['show', '-s', '--format=%ae', branch.current || ''])
        ).trim()
      }
      vcs.relativePath = (await git.raw(['rev-parse', '--show-prefix'])).trim()
    }
  }

  // Save VCS to deployment instance
  deploymentInstance.set({ vcs })
}

export const addCommonDeploymentData = async ({
  command,
  deploymentInstance,
  serviceRawFile,
  serviceConfigFileName,
  versionFramework,
  orgId,
  orgName,
  error,
}) => {
  deploymentInstance.set({
    deploymentId: randomUUID(),
    buildId: process.env.SERVERLESS_BUILD_ID || process.env.SLS_BUILD_ID,
    serverlessFile: serviceRawFile,
    serverlessFileName: serviceConfigFileName,
    versionFramework: versionFramework,
    tenantUid: orgId,
    orgId,
    tenantName: orgName,
    orgName,
    archived: command[0] === 'remove' && !error,
    status: error ? 'error' : 'success',
    error: error?.message,
  })
  await setVcsData(deploymentInstance)
}

/**
 * Save Deployment to Platform
 */
export const saveDeployment = async ({ accessKey, deploymentInstance }) => {
  const sdk = new CoreSDK({
    authToken: accessKey,
    headers: {
      'x-serverless-version': deploymentInstance.data?.versionFramework,
    },
  })
  await sdk.deployments.create(deploymentInstance.data)
}
