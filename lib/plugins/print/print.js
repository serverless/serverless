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
    let variableSyntax;
    this.serverless.variables.options = this.serverless.processedInput.options;
    this.serverless.variables.loadVariableSyntax();
    return getServerlessConfigFile(process.cwd())
      .then((data) => {
        const conf = data;
        // Need to delete variableSyntax to avoid potential matching errors
        if (conf.provider.variableSyntax) {
          variableSyntax = conf.provider.variableSyntax;
          delete conf.provider.variableSyntax;
        }
        return conf;
      })
      .then((data) => this.serverless.variables.populateObject(data))
      .then((data) => {
        const conf = data;
        if (variableSyntax !== undefined) {
          conf.provider.variableSyntax = variableSyntax;
        }
        this.serverless.cli.consoleLog(YAML.dump(conf, { noRefs: true }));
      });
  }

}

module.exports = Print;
