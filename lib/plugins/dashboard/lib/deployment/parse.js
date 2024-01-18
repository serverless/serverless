'use strict';

/*
 * Save Deployment
 * - This uses the new deployment data model.
 */

const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');
const simpleGit = require('simple-git');
const { version: packageJsonVersion } = require('../../package');
const Deployment = require('./deployment');

const git = simpleGit();

/*
 * Parse Deployment Data
 * - Takes data from the Framework and formats it into our data model
 */

const parseDeploymentData = async (ctx, status = 'success', error = null, archived = false) => {
  const { service } = ctx.sls;
  const deployment = new Deployment();

  const accountId = await ctx.provider.getAccountId();
  const serverlessFileName = path.resolve(ctx.sls.serviceDir, ctx.sls.configurationFilename);
  const serverlessFile = (await fs.readFile(serverlessFileName)).toString();
  /*
   * Add deployment data...
   */

  if (!archived) {
    const cfnStack = await (async () => {
      try {
        return await ctx.provider.request('CloudFormation', 'describeStacks', {
          StackName: ctx.provider.naming.getStackName(),
        });
      } catch (requestError) {
        const { providerError } = requestError;
        if (providerError) {
          // 400 means stack was not deployed yet (first deployment failed)
          if (providerError.statusCode === 400) return null;
        }

        throw requestError;
      }
    })();

    let logsRoleArn;
    if (
      ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.logAccessIamRole
    ) {
      logsRoleArn = ctx.sls.service.custom.enterprise.logAccessIamRole;
    } else {
      // get log access role info
      const logsRole =
        cfnStack &&
        _.find(
          cfnStack.Stacks[0].Outputs,
          ({ OutputKey }) => OutputKey === 'EnterpriseLogAccessIamRole'
        );
      logsRoleArn = logsRole && logsRole.OutputValue;
    }
    let logIngestMode = 'push';
    if (
      ctx.sls.service.custom &&
      ctx.sls.service.custom.enterprise &&
      ctx.sls.service.custom.enterprise.logIngestMode
    ) {
      logIngestMode = 'pull';
    }

    // get any CFN outputs
    const outputs = service.outputs || {};
    for (const [outputKey, outputValue] of _.entries(outputs)) {
      if (typeof outputValue === 'string' && outputValue.startsWith('CFN!?')) {
        if (cfnStack) {
          const cfnOutput = _.find(
            cfnStack.Stacks[0].Outputs,
            ({ OutputKey }) => OutputKey === `${outputValue.slice(5)}`
          );
          outputs[outputKey] = cfnOutput.OutputValue;
        } else {
          delete outputs[outputKey];
        }
      }
    }

    deployment.set({
      buildId: process.env.SERVERLESS_BUILD_ID || process.env.SLS_BUILD_ID,
      serverlessFile,
      serverlessFileName,
      versionFramework: ctx.sls.version,
      versionEnterprisePlugin: packageJsonVersion,
      tenantUid: service.orgUid,
      appUid: service.appUid,
      tenantName: service.org,
      appName: service.app,
      serviceName: service.service,
      stageName: ctx.provider.getStage(),
      regionName: ctx.provider.getRegion(),
      deploymentUid: ctx.deploymentUid,
      logsRoleArn,
      archived,
      status,
      provider: {
        type: 'aws',
        aws: { accountId },
        // environment: Object.keys(service.provider.environment || {})
      },
      layers: service.layers || {},
      plugins: service.plugins ? service.plugins.modules || service.plugins : [],
      custom: service.custom || {},
      secrets: Array.from(ctx.state.secretsUsed),
      areProvidersUsed: ctx.state.areProvidersUsed || false,
      outputs,
      error,
      logIngestMode,
    });

    const vcs = { type: null };
    // Add VCS info
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
      });
    } else {
      try {
        const isGit = await git.checkIsRepo();
        if (isGit) {
          vcs.type = 'git';
        }
      } catch (err) {
        // pass
      }
      if (vcs.type === 'git') {
        const branch = await git.branch();
        if (branch.current) {
          let origin = await git.raw(['config', `branch.${branch.current}.remote`]);
          if (origin) {
            origin = origin.trim();
            const remotes = await git.getRemotes(true);
            const originRemote = remotes.filter(({ name }) => name === origin)[0];
            if (originRemote && originRemote.refs) vcs.originUrl = originRemote.refs.fetch;
          }
          vcs.branch = branch.current;
        }
        try {
          vcs.commit = (await git.raw(['show', '-s', '--format=%H', branch.current || ''])).trim();
        } catch (gitShowError) {
          // Most likely a fresh repo (no commits)
          if (!gitShowError.message.includes('fatal:')) throw gitShowError;
        }
        if (vcs.commit) {
          vcs.commitMessage = (
            await git.raw(['show', '-s', '--format=%B', branch.current || ''])
          ).trim();
          vcs.committerEmail = (
            await git.raw(['show', '-s', '--format=%ae', branch.current || ''])
          ).trim();
        }
        vcs.relativePath = (await git.raw(['rev-parse', '--show-prefix'])).trim();
      }
    }
    deployment.set({ vcs });

    /*
     * Add this deployment's functions...
     */

    for (const fnName of Object.keys(service.functions)) {
      const fn = service.functions[fnName];
      const deployedFunctionName =
        fn.name || `${service.service}-${ctx.provider.getStage()}-${fnName}`;
      fn.events = fn.events || [];

      // Function
      deployment.setFunction({
        name: deployedFunctionName,
        description: fn.description || null,
        timeout: fn.timeout,
        type: 'awsLambda',
        arn: `arn:aws:lambda:${ctx.provider.getRegion()}:${accountId}:function:${deployedFunctionName}`,
        custom: {
          handler: fn.handler,
          memorySize: fn.memory,
          runtime: fn.runtime,
          environment: Object.keys(fn.environment || {}),
          role: fn.role,
          onError: fn.onError,
          awsKmsKeyArn: fn.awsKmsKeyArn,
          tags: fn.tags || {},
          vpc: fn.vpc || {},
          layers: fn.layers || [],
          name: fn.name || fnName,
        },
      });

      /*
       * Add this functions's subscriptions...
       */

      for (const sub of fn.events) {
        let subDetails = {};
        let type;
        if (typeof sub === 'string') {
          type = sub;
        } else {
          type = Object.keys(sub)[0];
          if ((type === 'http' || type === 'httpApi') && cfnStack) {
            const apigResource = _.find(
              cfnStack.Stacks[0].Outputs,
              ({ OutputKey }) =>
                !OutputKey.endsWith('Websocket') &&
                OutputKey.match(ctx.provider.naming.getServiceEndpointRegex())
            );
            const apiId =
              apigResource && apigResource.OutputValue.split('https://')[1].split('.')[0];

            if (typeof sub[type] === 'string') {
              subDetails = {
                path: sub[type].split(' ')[1],
                method: sub[type].split(' ')[0],
              };
            } else {
              subDetails = {
                path: sub[type].path,
                method: sub[type].method,
                cors: sub[type].cors,
                integration: sub[type].integration,
                authorizer: sub[type].authorizer,
                timeout: sub[type].timeout,
              };
            }
            if (type === 'http') {
              subDetails.restApiId = apiId;
            } else {
              subDetails.httpApiId = apiId;
            }
          } else if (sub[type] instanceof Object) {
            Object.assign(subDetails, sub[type]);
          } else {
            Object.assign(subDetails, { [type]: sub[type] });
          }
          if (type === 'websocket' && cfnStack) {
            const apigResource = _.find(
              cfnStack.Stacks[0].Outputs,
              ({ OutputKey }) =>
                OutputKey.endsWith('Websocket') &&
                OutputKey.match(ctx.provider.naming.getServiceEndpointRegex())
            );
            const apiId = apigResource && apigResource.OutputValue.split('wss://')[1].split('.')[0];
            subDetails.websocketApiId = apiId;
          }
        }

        deployment.setSubscription({ type, function: deployedFunctionName, ...subDetails });
      }
    }
  } else {
    const vcs = {};
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
      });
    }
    deployment.set({
      buildId: process.env.SERVERLESS_BUILD_ID || process.env.SLS_BUILD_ID,
      versionFramework: ctx.sls.version,
      versionEnterprisePlugin: packageJsonVersion,
      tenantUid: service.orgUid,
      appUid: service.appUid,
      tenantName: service.org,
      appName: service.app,
      serviceName: service.service,
      stageName: ctx.provider.getStage(),
      regionName: ctx.provider.getRegion(),
      archived,
      status,
      secrets: Array.from(ctx.state.secretsUsed),
      areProvidersUsed: ctx.state.areProvidersUsed || false,
      error,
      vcs,
    });
  }

  return deployment;
};

module.exports = parseDeploymentData;
