'use strict';

const os = require('os');
const _ = require('lodash');
const jc = require('json-cycle');
const yaml = require('js-yaml');
const ServerlessError = require('../serverless-error');
const cliCommandsSchema = require('../cli/commands-schema');
const { writeText, legacy } = require('@serverless/utils/log');

class Print {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.cache = {};

    this.commands = {
      print: {
        ...cliCommandsSchema.get('print'),
      },
    };
    this.hooks = {
      'print:print': this.print.bind(this),
    };
  }

  adorn(serviceConfig) {
    // service object treatment
    this.cache.serviceService = serviceConfig.service;
    if (_.isObject(this.cache.serviceService)) {
      serviceConfig.service = serviceConfig.service.name;
      serviceConfig.serviceObject = this.cache.serviceService;
    }
    // provider treatment and defaults
    this.cache.serviceProvider = serviceConfig.provider;
    if (typeof this.cache.serviceProvider === 'string') {
      serviceConfig.provider = { name: this.cache.serviceProvider };
    }
    const serviceProvider = this.serverless.service.provider;
    serviceConfig.provider = _.merge(
      {
        stage: serviceProvider.stage,
        region: serviceProvider.region,
        variableSyntax: serviceProvider.variableSyntax,
      },
      serviceConfig.provider
    );
  }
  strip(serviceConfig) {
    if (_.isObject(this.cache.serviceService)) {
      serviceConfig.service = this.cache.serviceService;
      delete serviceConfig.serviceObject;
    }
    if (typeof this.cache.serviceProvider === 'string') {
      serviceConfig.provider = this.cache.serviceProvider;
    } else {
      // is object
      if (!this.cache.serviceProvider.stage) {
        delete serviceConfig.provider.stage;
      }
      if (!this.cache.serviceProvider.region) {
        delete serviceConfig.provider.region;
      }
      if (this.cache.serviceProvider.variableSyntax) {
        serviceConfig.provider.variableSyntax = this.cache.serviceProvider.variableSyntax;
      }
    }
  }
  async print() {
    const svc = this.serverless.configurationInput;
    const service = svc;
    this.adorn(service);
    // Need to delete variableSyntax to avoid self-matching errors
    this.serverless.variables.loadVariableSyntax();
    delete service.provider.variableSyntax; // cached by adorn, restored by strip
    this.serverless.variables.service = service;
    const populated = await this.serverless.variables.populateObject(service);
    let conf = populated;
    this.strip(conf);

    // dig into the object
    if (this.options.path) {
      const steps = this.options.path.split('.');
      for (const step of steps) {
        conf = conf[step];

        if (!conf) {
          throw new ServerlessError(
            `Path "${this.options.path}" not found`,
            'INVALID_PATH_ARGUMENT'
          );
        }
      }
    }

    // apply an optional filter
    if (this.options.transform) {
      if (this.options.transform === 'keys') {
        conf = Object.keys(conf);
      } else {
        throw new ServerlessError('Transform can only be "keys"', 'INVALID_TRANSFORM');
      }
    }

    // print configuration in the specified format
    const format = this.options.format || 'yaml';
    let out;

    if (format === 'text') {
      if (Array.isArray(conf)) {
        out = conf.join(os.EOL);
      } else {
        if (_.isObject(conf)) {
          throw new ServerlessError(
            'Cannot print an object as "text"',
            'PRINT_INVALID_OBJECT_AS_TEXT'
          );
        }

        out = String(conf);
      }
    } else if (format === 'json') {
      out = jc.stringify(conf, null, '  ');
    } else if (format === 'yaml') {
      out = yaml.dump(JSON.parse(jc.stringify(conf)), { noRefs: true });
    } else {
      throw new ServerlessError('Format must be "yaml", "json" or "text"', 'PRINT_INVALID_FORMAT');
    }

    legacy.consoleLog(out);
    writeText(out);
  }
}

module.exports = Print;
