'use strict';

module.exports = class Plugin {
  constructor() {
    this.commands = {
      customCommand: {
        usage: 'Description of custom command',
        configDependent: false,
      },
    };
  }
};
