'use strict';

const cliProgressFooter = require('cli-progress-footer');
const chalk = require('chalk');

class InteractiveDeployProgress {
  constructor(serverless) {
    this.serverless = serverless;
    this.progress = cliProgressFooter({ overrideStdout: false, redirectStderr: false });
    this.progress.shouldAddProgressAnimationPrefix = true;

    this.hooks = {
      'before:deploy:deploy': async () => {
        this.progress.updateProgress('Deploying your project. This might take a few minutes...\n');
      },
      'deploy:finalize': async () => {
        this.progress.updateProgress('');
        this.progress.writeStdout(chalk.green('\nDeployment succesful\n'));
      },

      'package:initialize': async () => {
        this.progress.updateProgress('Packaging your project...\n');
      },
      'package:finalize': async () => {
        this.progress.updateProgress('');
        this.progress.writeStdout(chalk.green('\nPackaging succesful\n'));
      },
    };
  }

  handleError() {
    this.progress.updateProgress('');
  }
}

module.exports = InteractiveDeployProgress;
