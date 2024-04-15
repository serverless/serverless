import cliCommandsSchema from '../cli/commands-schema.js';
import download from '../utils/download-template-from-repo.js';
import utils from '@serverlessinc/sf-core/src/utils.js';

const { log, progress, style } = utils;

class Install {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      install: {
        ...cliCommandsSchema.get('install'),
      },
    };

    this.hooks = {
      'install:install': async () => this.install(),
    };
  }

  async install() {
    const commandRunStartTime = Date.now();
    progress.get('main').notice(`Downloading service from provided url: ${this.options.url}`);
    const serviceName = await download.downloadTemplateFromRepo(
      this.options.url,
      this.options.name
    );
    const message = [
      `Successfully installed "${serviceName}" `,
      `${
        this.options.name && this.options.name !== serviceName ? `as "${this.options.name}"` : ''
      }`,
    ].join('');

    log.notice();
    log.notice.success(
      `${message} ${style.aside(`(${Math.floor((Date.now() - commandRunStartTime) / 1000)}s)`)}`
    );
  }
}

export default Install;
