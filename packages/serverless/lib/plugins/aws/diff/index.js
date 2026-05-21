import runDiff from './run-diff.js'

/**
 * `serverless diff` — compare the locally-packaged CloudFormation template
 * against the deployed stack and render the differences.
 *
 * By default, the service is packaged first (so the local template reflects
 * the current configuration on disk). Users who already have a packaged
 * artifact directory (for example, from a previous CI step) can point the
 * command at it with `--package <path>` and skip the re-package.
 *
 * Output modes:
 *   - default: colored structured diff to stdout, with sections for code
 *              changes, IAM updates, resource changes, etc.
 *   - --json:  machine-readable JSON object with the diff summary and
 *              per-function code-change details. Suitable for CI consumption.
 *
 * Exit code is always 0 unless an unrecoverable error occurs.
 */
class AwsDiff {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.log = pluginUtils.log
    this.style = pluginUtils.style
    this.progress = pluginUtils.progress

    Object.assign(this, runDiff)

    // The `aws:diff` entrypoint runs the AWS-specific implementation. The
    // outer `diff:diff` command spawns it after (optionally) packaging.
    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          diff: {
            lifecycleEvents: ['diff'],
          },
        },
      },
    }

    this.hooks = {
      // Auto-package unless the user pointed at an existing artifact directory.
      // `--package <path>` opts out of repackaging — useful when the artifact
      // was produced by an earlier CI step.
      'before:diff:diff': async () => {
        if (this.options.package) return
        await this.serverless.pluginManager.spawn('package')
      },
      'diff:diff': async () => this.serverless.pluginManager.spawn('aws:diff'),
      'aws:diff:diff': async () => this.runDiff(),
    }
  }
}

export default AwsDiff
