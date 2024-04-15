import ServerlessError from '../serverless-error.js';
import cliCommandsSchema from '../cli/commands-schema.js';
import utils from '@serverlessinc/sf-core/src/utils.js';

const { log } = utils;

// class wide constants
const validProviders = new Set(['aws']);

const humanReadableProvidersList = `"${Array.from(validProviders)}"`;

class Config {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      config: {
        ...cliCommandsSchema.get('config'),
        commands: {
          credentials: {
            // Command defined in AWS context
            validProviders,
          },
        },
      },
    };

    this.hooks = {
      'config:config': async () => this.updateConfig(),
      'before:config:credentials:config': () => this.validate(),
    };
  }

  // Deprecated in V4
  validate() {}

  // Deprecated in V4
  async updateConfig() {}
}

export default Config;
