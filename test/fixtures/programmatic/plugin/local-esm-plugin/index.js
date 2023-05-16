export default class LocalESMPlugin {
  constructor(serverless, options, utils) {
    this.serverless = serverless;
    this.options = options;
    this.utils = utils;
    this.commands = {
      esmCustomCommand: {
        usage: 'Description of custom command',
        configDependent: false,
      },
    };
  }
}
