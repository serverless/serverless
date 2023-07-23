'use strict';

const path = require('path');
const fse = require('fs-extra');

// mock to test functionality bound to a serverless plugin
class ServerlessPlugin {
  constructor(serverless, options, testSubject) {
    this.serverless = serverless;
    this.options = Object.assign({}, options);

    Object.assign(this, testSubject);
  }
}

function installPlugin(installDir, PluginClass) {
  const pluginPkg = { name: path.basename(installDir), version: '0.0.0' };
  const className = new PluginClass().constructor.name;
  fse.outputFileSync(path.join(installDir, 'package.json'), JSON.stringify(pluginPkg), 'utf8');
  fse.outputFileSync(
    path.join(installDir, 'index.js'),
    `"use strict";\n${PluginClass.toString()}\nmodule.exports = ${className}`,
    'utf8'
  );
}

module.exports = {
  ServerlessPlugin,
  installPlugin,
};
