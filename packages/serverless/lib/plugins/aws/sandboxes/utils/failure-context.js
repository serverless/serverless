import { getLogicalId } from '../../lib/resource-naming.js'

const VERSION_LIMIT_REASON = /maximum number of versions/i

/**
 * The lines to add to a sandbox image that failed on the per-image version
 * limit: how to remove old versions now, and how to prune after every deploy.
 * The CloudFormation reason stays in front of them unchanged.
 *
 * @param {object} serverless
 * @param {{ResourceType?: string, ResourceStatusReason?: string, LogicalResourceId?: string}} event
 * @returns {string|undefined}
 */
export function getSandboxVersionLimitContext(serverless, event) {
  if (
    event.ResourceType !== 'AWS::Lambda::MicrovmImage' ||
    !VERSION_LIMIT_REASON.test(event.ResourceStatusReason ?? '')
  ) {
    return undefined
  }
  const sandboxes =
    serverless.service?.sandboxes ||
    serverless.configurationInput?.sandboxes ||
    {}
  const name = Object.keys(sandboxes).find(
    (key) => getLogicalId(key, 'Image') === event.LogicalResourceId,
  )
  const subject = name
    ? `Sandbox "${name}"`
    : `Sandbox image ${event.LogicalResourceId}`
  const prune = serverless.service?.custom?.prune
  const number = Number.isInteger(prune?.number) ? prune.number : 5

  const lines = [
    '',
    `${subject} has reached the maximum number of image versions AWS allows.`,
    `Remove old versions with "serverless prune -n ${number}", then deploy again.`,
  ]
  if (prune?.automatic !== true) {
    lines.push(
      'To prune automatically after every deploy, add to serverless.yml:',
      '',
      'custom:',
      '  prune:',
      '    automatic: true',
      `    number: ${number}`,
    )
  }
  return lines.join('\n')
}
