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
    getServerlessConfigFile(process.cwd())
      .then((data) => this.serverless.variables.populateObject(data))
      .then((data) => this.serverless.cli.consoleLog(YAML.dump(data)));
  }
}

module.exports = Print;
