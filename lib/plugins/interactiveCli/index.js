// TODO: Remove with next major release

'use strict';

const ServerlessError = require('../../serverless-error');
const cliCommandsSchema = require('../../cli/commands-schema');

module.exports = class InteractiveCli {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      interactiveCli: {
        ...cliCommandsSchema.get(''),
        isHidden: true,
      },
    };
  }

  asyncInit() {
    /*
     * The majority of setup is done here to allow other plugins to modify
     * this.commands.interactiveCli.options before deciding if the CLI
     * is in interactive mode or not.
     */

    if (!process.stdin.isTTY) return;

    const { processedInput } = this.serverless;
    if (processedInput.commands.length) return;
    const usedOptions = new Set(Object.keys(processedInput.options));
    const supportedOptions = new Set(Object.keys(this.commands.interactiveCli.options));
    // --help-interactive should trigger help which is not handled from scope of this command
    supportedOptions.delete('help-interactive');
    // --help should trigger general help, and this command should not be considered
    supportedOptions.delete('help');
    // Normally this option is handled by main CLI script, still if locally installed Framework
    // is invokved by old version which does not have such handling yet, we need below to prevent
    // interactive CLI to jump in
    supportedOptions.delete('version');

    for (const opt of supportedOptions) usedOptions.delete(opt);

    if (usedOptions.size) return;

    if (this.serverless._isInvokedByGlobalInstallation) {
      throw new ServerlessError(
        "Outdated global installation of 'serverless'. Please upgrade. " +
          "It's needed to ensure desired interactive CLI experience"
      );
    }
    throw new Error(
      'Unexpected interactive CLI fallback (please report at ' +
        'https://github.com/serverless/serverless/issues/new' +
        '?assignees=&labels=&template=bug_report.md'
    );
  }
};
