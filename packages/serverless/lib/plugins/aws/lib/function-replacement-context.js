const REPLACEMENT_REASON = /custom-named resource requires replacing/i

export const FUNCTION_REPLACEMENT_CONTEXT =
  'Lambda sets durable configuration, tenancy and package type when a function is created. To change one, give the function a new name, or remove it from the service, deploy, and add it back.'

/**
 * The line to add to a Lambda function that CloudFormation would not replace
 * because it has a custom name: which settings are fixed when a function is
 * created, and how to change them. The Framework names every function, so a
 * change to one of these settings stops the deploy this way. The
 * CloudFormation reason stays in front of the line unchanged.
 *
 * @param {{ResourceType?: string, ResourceStatusReason?: string}} event
 * @returns {string|undefined}
 */
export function getFunctionReplacementContext(event) {
  if (
    event.ResourceType !== 'AWS::Lambda::Function' ||
    !REPLACEMENT_REASON.test(event.ResourceStatusReason ?? '')
  ) {
    return undefined
  }
  return FUNCTION_REPLACEMENT_CONTEXT
}
