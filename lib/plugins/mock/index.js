const Provider = require('./provider');
const Deploy = require('./deploy');
const Remove = require('./remove');

class Mock {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.serverless.pluginManager.addPlugin(Provider);
    this.serverless.pluginManager.addPlugin(Deploy);
    this.serverless.pluginManager.addPlugin(Remove);
  }
}

module.exports = Mock;
