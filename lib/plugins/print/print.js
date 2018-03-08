'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const getServerlessConfigFile = require('../../utils/getServerlessConfigFile');
const jc = require('json-cycle');
const YAML = require('js-yaml');

class Print {
  constructor(serverless) {
    this.serverless = serverless;
    this.cache = {};

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

  adorn(svc) {
    const service = svc;
    // service object treatment
    this.cache.serviceService = service.service;
    if (_.isObject(this.cache.serviceService)) {
      service.service = service.service.name;
      service.serviceObject = this.cache.serviceService;
    }
    // provider treatment and defaults
    this.cache.serviceProvider = service.provider;
    if (_.isString(this.cache.serviceProvider)) {
      service.provider = { name: this.cache.serviceProvider };
    }
    service.provider = _.merge({
      stage: 'dev',
      region: 'us-east-1',
      variableSyntax: '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}',
    }, service.provider);
  }
  strip(svc) {
    const service = svc;
    if (_.isObject(this.cache.serviceService)) {
      service.service = this.cache.serviceService;
      delete service.serviceObject;
    }
    if (_.isString(this.cache.serviceProvider)) {
      service.provider = this.cache.serviceProvider;
    } else { // is object
      if (!this.cache.serviceProvider.stage) {
        delete service.provider.stage;
      }
      if (!this.cache.serviceProvider.region) {
        delete service.provider.region;
      }
      if (this.cache.serviceProvider.variableSyntax) {
        service.provider.variableSyntax = this.cache.serviceProvider.variableSyntax;
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
    return getServerlessConfigFile(process.cwd())
      .then((svc) => {
        const service = svc;
        this.adorn(service);
        // Need to delete variableSyntax to avoid self-matching errors
        this.serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax; // cached by adorn, restored by strip
        this.serverless.variables.service = service;
        return this.serverless.variables.populateObject(service)
          .then((populated) => {
            this.strip(populated);
            const out = JSON.parse(jc.stringify(populated));
            this.serverless.cli.consoleLog(YAML.dump(out, { noRefs: true }));
          });
      });
  }

}

module.exports = Print;
