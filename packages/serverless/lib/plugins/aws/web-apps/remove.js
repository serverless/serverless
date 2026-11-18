'use strict'

import {
  getWebAppFunctionName,
  getWebAppLogicalIds,
} from './compilers/function.js'
import { getWebAppLogGroupNames } from './compilers/logGroups.js'
import {
  isResourceNotFound,
  isStackResourceNotFound,
} from '../lib/not-found-errors.js'

/**
 * The names of the web apps' log groups the service's stack holds, looked up
 * before the stack is removed. A group the stack does not hold belongs to
 * someone else (the stack was never deployed, or another service gives its
 * web app the same `name`) and is left out. A lookup that fails otherwise is a
 * warning, and that group is left out too.
 *
 * @param {object} params
 * @param {object} params.provider - the AWS provider; requests go to its Region
 * @param {Record<string, object>} params.webApps - `webApps`
 * @param {{ serviceName: string, stage: string }} params.ctx
 * @param {string} params.stackName
 * @param {{ warning: Function }} params.log
 * @returns {Promise<string[]>}
 */
export async function findStackWebAppLogGroups({
  provider,
  webApps,
  ctx,
  stackName,
  log,
}) {
  const lookups = Object.entries(webApps).flatMap(([key, webApp]) => {
    const logicalIds = getWebAppLogicalIds(key)
    const names = getWebAppLogGroupNames(
      getWebAppFunctionName(ctx, key, webApp),
    )
    return [
      { logicalId: logicalIds.logGroup, name: names.logGroupName },
      { logicalId: logicalIds.localLogGroup, name: names.localLogGroupName },
    ]
  })
  const found = await Promise.all(
    lookups.map(async ({ logicalId, name }) => {
      try {
        const { StackResourceDetail: resource } = await provider.request(
          'CloudFormation',
          'describeStackResource',
          { StackName: stackName, LogicalResourceId: logicalId },
        )
        return resource?.ResourceType === 'AWS::Logs::LogGroup'
          ? resource.PhysicalResourceId
          : undefined
      } catch (error) {
        if (!isStackResourceNotFound(error)) {
          log.warning(
            `Could not check that stack ${stackName} holds log group ${name}, so remove will not delete it if Lambda recreates it: ${error.message}`,
          )
        }
        return undefined
      }
    }),
  )
  return found.filter(Boolean)
}

/**
 * Delete the given log groups after the stack is removed. An execution
 * environment can deliver log lines after CloudFormation deleted the stack's
 * groups, and Lambda then recreates a group without a retention period. A
 * group that does not exist is already removed; any other failure is a
 * warning, so `remove` still succeeds.
 *
 * @param {object} params
 * @param {object} params.provider - the AWS provider; requests go to its Region
 * @param {string[]} params.logGroupNames - from `findStackWebAppLogGroups`
 * @param {{ debug: Function, warning: Function }} params.log
 */
export async function removeWebAppLogGroups({ provider, logGroupNames, log }) {
  await Promise.all(
    logGroupNames.map(async (logGroupName) => {
      try {
        await provider.request('CloudWatchLogs', 'deleteLogGroup', {
          logGroupName,
        })
        log.debug(`Deleted log group ${logGroupName}`)
      } catch (error) {
        if (isResourceNotFound(error)) return
        log.warning(
          `Could not delete log group ${logGroupName}: ${error.message}`,
        )
      }
    }),
  )
}
