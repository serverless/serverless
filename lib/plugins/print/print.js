'use strict';

const BbPromise = require('bluebird');
const getServerlessConfigFile = require('../../utils/getServerlessConfigFile');
const jc = require('json-cycle');
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
        this.serverless.variables.service = conf;
        this.serverless.variables.cache = {};
        return this.serverless.variables.populateObject(conf);
      })
      .then((data) => {
        const conf = data;
        if (variableSyntax !== undefined) {
          conf.provider.variableSyntax = variableSyntax;
        }
        const out = JSON.parse(jc.stringify(conf));
        this.serverless.cli.consoleLog(YAML.dump(out, { noRefs: true }));
      });
  }

}

module.exports = Print;
