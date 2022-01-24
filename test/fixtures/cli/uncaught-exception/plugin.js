'use strict';

module.exports = class Plugin {
  constructor() {
    setTimeout(() => {
      throw new Error('Stop');
    });
  }
};
