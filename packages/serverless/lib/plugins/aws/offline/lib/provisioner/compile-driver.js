import ServerlessError from '../../../../../serverless-error.js'

/**
 * Drives the curated subset of Framework's `package:*` lifecycle events needed
 * to populate `serverless.service.provider.compiledCloudFormationTemplate` in
 * memory, without triggering deploy-only side effects such as S3 artifact
 * uploads, CloudFormation API calls for stack inspection, or function zipping.
 *
 * ## Chosen lifecycle event subset (invoked in order)
 *
 * | Event name                                             | Why included                                                                                     |
 * |--------------------------------------------------------|--------------------------------------------------------------------------------------------------|
 * | `package:initialize`                                   | Calls `generateCoreTemplate()`, which reads the static core CFN JSON and sets                    |
 * |                                                        | `compiledCloudFormationTemplate` on the service. The `AwsPackage` plugin's hook also             |
 * |                                                        | calls `setBucketName()` — a CloudFormation `describeStackResource` call — before                 |
 * |                                                        | `generateCoreTemplate`. That call's result is irrelevant for offline use (the bucket             |
 * |                                                        | is never created locally) and its catch block handles "stack does not exist" gracefully.         |
 * |                                                        | The call is unavoidable because both operations live in the same registered hook function.       |
 * | `package:setupProviderConfiguration`                   | Calls `mergeIamTemplates()`, which adds CloudWatch log group and IAM execution-role              |
 * |                                                        | resources to the template. These resources appear in the compiled template and are               |
 * |                                                        | needed by the resource provisioner to enumerate all declared resources.                          |
 * | `package:compileLayers`                                | Compiles Lambda layers declared in `layers:` into `AWS::Lambda::LayerVersion` resources.        |
 * | `package:compileFunctions`                             | Compiles each function declared in `functions:` into `AWS::Lambda::Function` resources.         |
 * |                                                        | Also triggers `before:package:compileFunctions` hooks (e.g., artifact dir generation,           |
 * |                                                        | CloudFront function preparation). These are pure template mutations — no I/O.                   |
 * | `package:compileEvents`                                | All event-source plugins (SQS, SNS, S3, EventBridge, HTTP API, …) hook here to add             |
 * |                                                        | their trigger resources (e.g., `AWS::SQS::Queue`, `AWS::Lambda::EventSourceMapping`).           |
 * |                                                        | This is the primary event that populates event-driven resource declarations.                     |
 * | `aws:package:finalize:addExportNameForOutputs`         | Adds `Export.Name` to stack Outputs so cross-stack references resolve correctly.                 |
 * |                                                        | Pure in-memory template mutation; no I/O.                                                       |
 * | `aws:package:finalize:mergeCustomProviderResources`    | Merges the user's `resources:` block (custom CFN resources and extensions) into the             |
 * |                                                        | compiled template. Without this, user-declared resources such as DynamoDB tables or              |
 * |                                                        | additional SQS queues are absent from the template.                                              |
 * | `aws:package:finalize:stripNullPropsFromTemplateResources` | Removes properties whose value is `null` (a common pattern for conditional resources).      |
 * |                                                        | Keeps the template clean for downstream consumers. Pure in-memory operation.                    |
 *
 * ## Intentionally excluded events
 *
 * | Event name                           | Why excluded                                                                                       |
 * |--------------------------------------|----------------------------------------------------------------------------------------------------|
 * | `package:cleanup`                    | Deletes the `.serverless/` working directory via `aws:common:cleanupTempDir`. Destructive I/O.     |
 * | `package:createDeploymentArtifacts`  | Zips function code into deployment artifacts. Pure I/O, not template synthesis.                    |
 * | `aws:package:finalize:saveServiceState` | Writes the compiled template to `.serverless/cloudformation-template.json`, validates it,        |
 * |                                      | and calls `aws:common:moveArtifactsToPackage` (file moves). Template writes are harmless but       |
 * |                                      | artifact moves and CFN validation are not needed for local resource provisioning.                  |
 * | Any `aws:deploy:*` or `deploy:*`     | Deploy lifecycle; explicitly out of scope.                                                         |
 *
 * @param {object} serverless - The Serverless instance (with pluginManager and service already configured).
 * @returns {Promise<object>} The compiled CloudFormation template object (also set at
 *   `serverless.service.provider.compiledCloudFormationTemplate`).
 * @throws {ServerlessError} With code `OFFLINE_COMPILE_FAILED` if the template is missing or empty
 *   after the compile sequence completes.
 */
export async function driveCompile(serverless) {
  const { pluginManager } = serverless

  /**
   * The ordered list of lifecycle event names that constitute a complete,
   * side-effect-free CFN template synthesis. Each name maps to an entry in
   * `pluginManager.hooks` — a plain object keyed by event name whose values
   * are arrays of `{ hook: Function, pluginName: string }`.
   *
   * `runHooks` iterates those arrays and awaits each handler in registration order,
   * which mirrors the Framework's own `invoke` implementation exactly.
   */
  const compileEvents = [
    'package:initialize',
    'package:setupProviderConfiguration',
    'package:compileLayers',
    'package:compileFunctions',
    'package:compileEvents',
    'aws:package:finalize:addExportNameForOutputs',
    'aws:package:finalize:mergeCustomProviderResources',
    'aws:package:finalize:stripNullPropsFromTemplateResources',
  ]

  for (const eventName of compileEvents) {
    // Collect before:/after: hooks alongside the primary event hooks so
    // plugins that use before:/after: hooks (e.g., CloudFront's
    // `before:package:compileFunctions`) are invoked correctly.
    const before = pluginManager.hooks[`before:${eventName}`] || []
    const at = pluginManager.hooks[eventName] || []
    const after = pluginManager.hooks[`after:${eventName}`] || []

    await pluginManager.runHooks(`before:${eventName}`, before)
    await pluginManager.runHooks(eventName, at)
    await pluginManager.runHooks(`after:${eventName}`, after)
  }

  const template = serverless.service.provider.compiledCloudFormationTemplate

  if (
    !template ||
    typeof template !== 'object' ||
    Object.keys(template).length === 0
  ) {
    throw new ServerlessError(
      'Compile sequence completed but compiledCloudFormationTemplate is missing or empty. ' +
        'Ensure the AWS provider and package plugins are loaded before calling driveCompile().',
      'OFFLINE_COMPILE_FAILED',
    )
  }

  return template
}
