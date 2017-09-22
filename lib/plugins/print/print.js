'use strict';

const BbPromise = require('bluebird');
const getServerlessConfigFile = require('../../utils/getServerlessConfigFile');
const YAML = require('js-yaml');

class Print {
  constructor(serverless) {
    this.serverless = serverless;

    this.commands = {
      print: {
        usage: 'Print your compiled and resolved config file',
        lifecycleEvents: [
          'print',
        ],
      },
    };
    this.hooks = {
      'print:print': () => BbPromise.bind(this)
        .then(this.print),
    };
  }

  print() {
    this.serverless.variables.options = this.serverless.processedInput.options;
    this.serverless.variables.loadVariableSyntax();
    getServerlessConfigFile(process.cwd())
      .then((data) => {
        const conf = data;
        // Need to delete variableSyntax to avoid potential matching errors
        if (conf.provider.variableSyntax) {
          delete conf.provider.variableSyntax;
        }
        return this.serverless.variables.populateObject(conf);
      }).then((data) => this.serverless.cli.consoleLog(YAML.dump(data)));

    return BbPromise.resolve();
  }
}

module.exports = Print;
