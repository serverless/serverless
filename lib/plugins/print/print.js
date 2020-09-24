'use strict';

const os = require('os');
const _ = require('lodash');
const BbPromise = require('bluebird');
const getServerlessConfigFile = require('../../utils/getServerlessConfigFile')
  .getServerlessConfigFile;
const jc = require('json-cycle');
const YAML = require('js-yaml');

class Print {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.cache = {};

    this.commands = {
      print: {
        usage: 'Print your compiled and resolved config file',
        configDependent: true,
        lifecycleEvents: ['print'],
        options: {
          format: {
            usage: 'Print configuration in given format ("yaml", "json", "text"). Default: yaml',
          },
          path: {
            usage: 'Optional period-separated path to print a sub-value (eg: "provider.name")',
          },
          transform: {
            usage: 'Optional transform-function to apply to the value ("keys")',
          },
        },
      },
    };
    this.hooks = {
      'print:print': () => BbPromise.bind(this).then(this.print),
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
  print() {
    // #####################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/classes/Variables.js ##
    // ##   there, see `populateService`                                  ##
    // ##   here, see below                                               ##
    // #####################################################################
    // ###################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/classes/Service.js ##
    // ##   there, see `constructor` and `loadServiceFileParam`         ##
    // ##   here, see `strip` and `adorn`                               ##
    // ###################################################################
    // The *already loaded* Service (i.e. serverless.yml) is adorned with extras for use by the
    // framework and throughout its codebase.  We could try using the populated service but that
    // would require playing whack-a-mole on issues as changes are made to the service anywhere in
    // the codebase.  Avoiding that, this method must read the serverless.yml file itself, adorn it
    // as the Service class would and then populate it, reversing the adornments thereafter in
    // preparation for printing the service for the user.
    return getServerlessConfigFile(this.serverless).then(svc => {
      const service = svc;
      this.adorn(service);
      // Need to delete variableSyntax to avoid self-matching errors
      this.serverless.variables.loadVariableSyntax();
      delete service.provider.variableSyntax; // cached by adorn, restored by strip
      this.serverless.variables.service = service;
      return this.serverless.variables.populateObject(service).then(populated => {
        let conf = populated;
        this.strip(conf);

        // dig into the object
        if (this.options.path) {
          const steps = this.options.path.split('.');
          for (const step of steps) {
            conf = conf[step];

            if (!conf) {
              return BbPromise.reject(
                new this.serverless.classes.Error(`Path "${this.options.path}" not found`)
              );
            }
          }
        }

        // apply an optional filter
        if (this.options.transform) {
          if (this.options.transform === 'keys') {
            conf = Object.keys(conf);
          } else {
            return BbPromise.reject(
              new this.serverless.classes.Error('Transform can only be "keys"')
            );
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
              return BbPromise.reject(
                new this.serverless.classes.Error('Cannot print an object as "text"')
              );
            }

            out = String(conf);
          }
        } else if (format === 'json') {
          out = jc.stringify(conf, null, '  ');
        } else if (format === 'yaml') {
          out = YAML.dump(JSON.parse(jc.stringify(conf)), { noRefs: true });
        } else {
          return BbPromise.reject(
            new this.serverless.classes.Error('Format must be "yaml", "json" or "text"')
          );
        }

        this.serverless.cli.consoleLog(out);
        return BbPromise.resolve();
      });
    });
  }
}

module.exports = Print;
