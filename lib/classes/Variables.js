'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const os = require('os');
const path = require('path');
const replaceall = require('replaceall');

const fse = require('../utils/fs/fse');
const logWarning = require('./Error').logWarning;
const PromiseTracker = require('./PromiseTracker');

/**
 * Maintainer's notes:
 *
 * This is a tricky class to modify and maintain.  A few rules on how it works...
 *
 * 0. The population of a service consists of pre-population, followed by population.  Pre-
 *   population consists of populating only those settings which are required for variable
 *   resolution.  Current examples include region and stage as they must be resolved to a
 *   concrete value before they can be used in the provider's `request` method (used by
 *   `getValueFromCf`, `getValueFromS3`, and `getValueFromSsm`) to resolve the associated values.
 *   Original issue: #4725
 * 1. All variable populations occur in generations.  Each of these generations resolves each
 *   present variable in the given object or property (i.e. terminal string properties and/or
 *   property parts) once.  This is to say that recursive resolutions should not be made.  This is
 *   because cyclic references are allowed [i.e. ${self:} and the like]) and doing so leads to
 *   dependency and dead-locking issues.  This leads to a problem with deep value population (i.e.
 *   populating ${self:foo.bar} when ${self:foo} has a value of {opt:bar}).  To pause that, one must
 *   pause population, noting the continued depth to traverse.  This motivated "deep" variables.
 *   Original issue #4687
 * 2. The resolution of variables can get very confusing if the same object is used multiple times.
 *   An example of this is the print command which *implicitly/invisibly* populates the
 *   serverless.yml and then *explicitly/visibily* renders the same file again, without the
 *   adornments that the framework's components make to the originally loaded service.  As a result,
 *   it is important to reset this object for each use.
 * 3. Note that despite some AWS code herein that this class is used in all plugins.  Obviously
 *   users avoid the AWS-specific variable types when targeting other clouds.
 */
class Variables {
  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;
    this.tracker = new PromiseTracker();

    this.deep = [];
    this.deepRefSyntax = RegExp(/(\${)?deep:\d+(\.[^}]+)*()}?/);
    this.overwriteSyntax = RegExp(/\s*(?:,\s*)+/g);
    this.fileRefSyntax = RegExp(/^file\(([^?%*:|"<>]+?)\)/g);
    this.slsRefSyntax = RegExp(/^sls:/g);
    this.envRefSyntax = RegExp(/^env:/g);
    this.optRefSyntax = RegExp(/^opt:/g);
    this.selfRefSyntax = RegExp(/^self:/g);
    this.stringRefSyntax = RegExp(/(?:('|").*?\1)/g);
    this.cfRefSyntax = RegExp(/^(?:\${)?cf(\.[a-zA-Z0-9-]+)?:/g);
    this.s3RefSyntax = RegExp(/^(?:\${)?s3:(.+?)\/(.+)$/);
    this.ssmRefSyntax = RegExp(/^(?:\${)?ssm:([a-zA-Z0-9_.\-/]+)[~]?(true|false|split)?/);
    this.strToBoolRefSyntax = RegExp(/^(?:\${)?strToBool\(([a-zA-Z0-9_.\-/]+)\)/);

    this.variableResolvers = [
      { regex: this.slsRefSyntax, resolver: this.getValueFromSls.bind(this) },
      { regex: this.envRefSyntax, resolver: this.getValueFromEnv.bind(this) },
      { regex: this.optRefSyntax, resolver: this.getValueFromOptions.bind(this) },
      { regex: this.selfRefSyntax, resolver: this.getValueFromSelf.bind(this) },
      { regex: this.fileRefSyntax, resolver: this.getValueFromFile.bind(this) },
      {
        regex: this.cfRefSyntax,
        resolver: this.getValueFromCf.bind(this),
        isDisabledAtPrepopulation: true,
        serviceName: 'CloudFormation',
      },
      {
        regex: this.s3RefSyntax,
        resolver: this.getValueFromS3.bind(this),
        isDisabledAtPrepopulation: true,
        serviceName: 'S3',
      },
      { regex: this.stringRefSyntax, resolver: this.getValueFromString.bind(this) },
      {
        regex: this.ssmRefSyntax,
        resolver: this.getValueFromSsm.bind(this),
        isDisabledAtPrepopulation: true,
        serviceName: 'SSM',
      },
      {
        regex: this.strToBoolRefSyntax,
        resolver: this.getValueStrToBool.bind(this),
      },
      { regex: this.deepRefSyntax, resolver: this.getValueFromDeep.bind(this) },
    ];
  }

  loadVariableSyntax() {
    this.variableSyntax = RegExp(this.service.provider.variableSyntax, 'g');
  }

  initialCall(func) {
    this.deep = [];
    this.tracker.start();
    return func().finally(() => {
      this.tracker.stop();
      this.deep = [];
    });
  }

  // #############
  // ## SERVICE ##
  // #############
  disableDepedentServices(func) {
    const dependencyMessage = (configValue, serviceName) =>
      `Variable dependency failure: variable '${configValue}' references ${serviceName} but using that service requires a concrete value to be called.`;
    // replace and then restore the methods for obtaining values from dependent services.  the
    // replacement naturally rejects dependencies on these services that occur during prepopulation.
    // prepopulation is, of course, the process of obtaining the required configuration for using
    // these services.
    for (const resolver of this.variableResolvers) {
      if (resolver.isDisabledAtPrepopulation) {
        // save original
        resolver.original = resolver.resolver;
        // knock out
        resolver.resolver = variableString =>
          BbPromise.reject(dependencyMessage(variableString, resolver.serviceName));
      }
    }
    return func().finally(() => {
      // restore
      for (const resolver of this.variableResolvers) {
        if (resolver.isDisabledAtPrepopulation) {
          resolver.resolver = resolver.original;
        }
      }
    });
  }
  prepopulateService() {
    const provider = this.serverless.getProvider('aws');
    if (provider) {
      const requiredConfigs = [
        _.assign({ name: 'region' }, provider.getRegionSourceValue()),
        _.assign({ name: 'stage' }, provider.getStageSourceValue()),
        {
          name: 'profile',
          value: this.service.provider.profile,
          path: 'serverless.service.provider.profile',
        },
        {
          name: 'credentials',
          value: this.service.provider.credentials,
          path: 'serverless.service.provider.credentials',
        },
        {
          name: 'credentials.accessKeyId',
          value: _.get(this, 'service.provider.credentials.accessKeyId'),
          path: 'serverless.service.provider.credentials.accessKeyId',
        },
        {
          name: 'credentials.secretAccessKey',
          value: _.get(this, 'service.provider.credentials.secretAccessKey'),
          path: 'serverless.service.provider.credentials.secretAccessKey',
        },
        {
          name: 'credentials.sessionToken',
          value: _.get(this, 'service.provider.credentials.sessionToken'),
          path: 'serverless.service.provider.credentials.sessionToken',
        },
      ];
      return this.disableDepedentServices(() => {
        const prepopulations = requiredConfigs.map(config =>
          this.populateValue(config.value, true) // populate
            .then(populated => _.assign(config, { populated }))
        );
        return this.assignProperties(provider, prepopulations);
      });
    }
    return BbPromise.resolve();
  }
  /**
   * Populate all variables in the service, conviently remove and restore the service attributes
   * that confuse the population methods.
   * @param processedOptions An options hive to use for ${opt:...} variables.
   * @returns {Promise.<TResult>|*} A promise resolving to the populated service.
   */
  populateService(processedOptions) {
    // #######################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/plugins/print/print.js ##
    // #######################################################################
    this.options = processedOptions || {};

    this.loadVariableSyntax();
    // store
    const variableSyntaxProperty = this.service.provider.variableSyntax;
    // remove
    this.service.provider.variableSyntax = undefined; // otherwise matches itself
    this.service.serverless = undefined;
    return this.initialCall(() =>
      this.prepopulateService()
        .then(() =>
          this.populateObjectImpl(this.service).finally(() => {
            // restore
            this.service.serverless = this.serverless;
            this.service.provider.variableSyntax = variableSyntaxProperty;
          })
        )
        .then(() => this.service)
    );
  }
  // ############
  // ## OBJECT ##
  // ############
  /**
   * The declaration of a terminal property.  This declaration includes the path and value of the
   * property.
   * Example Input:
   * {
   *   foo: {
   *     bar: 'baz'
   *   }
   * }
   * Example Result:
   * [
   *   {
   *     path: ['foo', 'bar']
   *     value: 'baz
   *   }
   * ]
   * @typedef {Object} TerminalProperty
   * @property {String[]} path The path to the terminal property
   * @property {Date|RegEx|String} The value of the terminal property
   */
  /**
   * Generate an array of objects noting the terminal properties of the given root object and their
   * paths
   * @param root The object to generate a terminal property path/value set for
   * @param current The current part of the given root that terminal properties are being sought
   * within
   * @param [context] An array containing the path to the current object root (intended for internal
   * use)
   * @param [results] An array of current results (intended for internal use)
   * @returns {TerminalProperty[]} The terminal properties of the given root object, with the path
   * and value of each
   */
  getProperties(root, atRoot, current, cntxt, rslts) {
    let context = cntxt;
    if (!context) {
      context = [];
    }
    let results = rslts;
    if (!results) {
      results = [];
    }
    const addContext = (value, key) =>
      this.getProperties(root, false, value, context.concat(key), results);
    if (_.isArray(current)) {
      _.map(current, addContext);
    } else if (
      _.isObject(current) &&
      !_.isDate(current) &&
      !_.isRegExp(current) &&
      !_.isFunction(current)
    ) {
      if (atRoot || current !== root) {
        _.mapValues(current, addContext);
      }
    } else {
      results.push({ path: context, value: current });
    }
    return results;
  }

  /**
   * @typedef {TerminalProperty} TerminalPropertyPopulated
   * @property {Object} populated The populated value of the value at the path
   */
  /**
   * Populate the given terminal properties, returning promises to do so
   * @param properties The terminal properties to populate
   * @returns {Promise<TerminalPropertyPopulated[]>[]} The promises that will resolve to the
   * populated values of the given terminal properties
   */
  populateVariables(properties) {
    const variables = properties.filter(
      property => _.isString(property.value) && property.value.match(this.variableSyntax)
    );
    return _.map(variables, variable =>
      this.populateValue(variable.value, false).then(populated =>
        _.assign({}, variable, { populated })
      )
    );
  }
  /**
   * Assign the populated values back to the target object
   * @param target The object to which the given populated terminal properties should be applied
   * @param populations The fully populated terminal properties
   * @returns {Promise<number>} resolving with the number of changes that were applied to the given
   * target
   */
  assignProperties(target, populations) {
    // eslint-disable-line class-methods-use-this
    return BbPromise.all(populations).then(results =>
      results.forEach(result => {
        if (result.value !== result.populated) {
          _.set(target, result.path, result.populated);
        }
      })
    );
  }
  /**
   * Populate the variables in the given object.
   * @param objectToPopulate The object to populate variables within.
   * @returns {Promise.<TResult>|*} A promise resolving to the in-place populated object.
   */
  populateObject(objectToPopulate) {
    return this.initialCall(() => this.populateObjectImpl(objectToPopulate));
  }
  populateObjectImpl(objectToPopulate) {
    const leaves = this.getProperties(objectToPopulate, true, objectToPopulate);
    const populations = this.populateVariables(leaves);
    if (populations.length === 0) {
      return BbPromise.resolve(objectToPopulate);
    }
    return this.assignProperties(objectToPopulate, populations).then(() =>
      this.populateObjectImpl(objectToPopulate)
    );
  }
  // ##############
  // ## PROPERTY ##
  // ##############
  /**
   * Standard logic for cleaning a variable
   * Example: cleanVariable('${opt:foo}') => 'opt:foo'
   * @param match The variable match instance variable part
   * @returns {string} The cleaned variable match
   */
  cleanVariable(match) {
    let cleaned = match.replace(this.variableSyntax, (context, contents) => contents.trim());
    if (!cleaned.match(/".*"|'.*'/)) {
      cleaned = cleaned.replace(/\s/g, '');
    }
    return cleaned;
  }
  /**
   * @typedef {Object} MatchResult
   * @property {String} match The original property value that matched the variable syntax
   * @property {String} variable The cleaned variable string that specifies the origin for the
   * property value
   */
  /**
   * Get matches against the configured variable syntax
   * @param property The property value to attempt extracting matches from
   * @returns {Object|String|MatchResult[]} The given property or the identified matches
   */
  getMatches(property) {
    if (typeof property !== 'string') {
      return property;
    }
    const matches = property.match(this.variableSyntax);
    if (!matches || !matches.length) {
      return property;
    }
    return _.map(matches, match => ({
      match,
      variable: this.cleanVariable(match),
    }));
  }
  /**
   * Populate the given matches, returning an array of Promises which will resolve to the populated
   * values of the given matches
   * @param {MatchResult[]} matches The matches to populate
   * @returns {Promise[]} Promises for the eventual populated values of the given matches
   */
  populateMatches(matches, property) {
    return _.map(matches, match => this.splitAndGet(match, property));
  }
  /**
   * Render the given matches and their associated results to the given value
   * @param value The value into which to render the given results
   * @param matches The matches on the given value where the results are to be rendered
   * @param results The results that are to be rendered to the given value
   * @returns {*} The populated value with the given results rendered according to the given matches
   */
  renderMatches(value, matches, results) {
    let result = value;
    for (let i = 0; i < matches.length; i += 1) {
      this.warnIfNotFound(matches[i].variable, results[i]);
      result = this.populateVariable(result, matches[i].match, results[i]);
    }
    return result;
  }
  /**
   * Populate the given value, recursively if root is true
   * @param valueToPopulate The value to populate variables within
   * @param root Whether the caller is the root populator and thereby whether to recursively
   * populate
   * @returns {PromiseLike<T>} A promise that resolves to the populated value, recursively if root
   * is true
   */
  populateValue(valueToPopulate, root) {
    const property = valueToPopulate;
    const matches = this.getMatches(property);
    if (!_.isArray(matches)) {
      return BbPromise.resolve(property);
    }
    const populations = this.populateMatches(matches, valueToPopulate);
    return BbPromise.all(populations)
      .then(results => this.renderMatches(property, matches, results))
      .then(result => {
        if (root && matches.length) {
          return this.populateValue(result, root);
        }
        return result;
      });
  }
  /**
   * Populate variables in the given property.
   * @param propertyToPopulate The property to populate (replace variables with their values).
   * @returns {Promise.<TResult>|*} A promise resolving to the populated result.
   */
  populateProperty(propertyToPopulate) {
    return this.initialCall(() => this.populateValue(propertyToPopulate, true));
  }

  /**
   * Split the cleaned variable string containing one or more comma delimited variables and get a
   * final value for the entirety of the string
   * @param match The regex match containing both the variable string to split and get a final
   * value for as well as the originally matched string
   * @param property The original property string the given variable was extracted from
   * @returns {Promise} A promise resolving to the final value of the given variable
   */
  splitAndGet(match, property) {
    const parts = this.splitByComma(match.variable);
    if (parts.length > 1) {
      return this.overwrite(parts, match.match, property);
    }
    return this.getValueFromSource(parts[0], property);
  }
  /**
   * Populate a given property, given the matched string to replace and the value to replace the
   * matched string with.
   * @param propertyParam The property to replace the matched string with the value.
   * @param matchedString The string in the given property that was matched and is to be replaced.
   * @param valueToPopulate The value to replace the given matched string in the property with.
   * @returns {Promise.<TResult>|*} A promise resolving to the property populated with the given
   *  value for all instances of the given matched string.
   */
  populateVariable(propertyParam, matchedString, valueToPopulate) {
    let property = propertyParam;
    if (property === matchedString) {
      // total replacement
      property = valueToPopulate;
    } else if (_.isString(valueToPopulate)) {
      // partial replacement, string
      property = replaceall(matchedString, valueToPopulate, property);
    } else if (_.isNumber(valueToPopulate)) {
      // partial replacement, number
      property = replaceall(matchedString, String(valueToPopulate), property);
    } else {
      const errorMessage = [
        'Trying to populate non string value into',
        ` a string for variable ${matchedString}.`,
        ' Please make sure the value of the property is a string.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return property;
  }
  // ###############
  // ## VARIABLES ##
  // ###############
  /**
   * Split a given string by whitespace padded commas excluding those within single or double quoted
   * strings.
   * @param string The string to split by comma.
   */
  splitByComma(string) {
    const input = string.trim();
    const stringMatches = [];
    let match = this.stringRefSyntax.exec(input);
    while (match) {
      stringMatches.push({
        start: match.index,
        end: this.stringRefSyntax.lastIndex,
      });
      match = this.stringRefSyntax.exec(input);
    }
    const commaReplacements = [];
    const contained = (
      commaMatch // curry the current commaMatch
    ) => (
      stringMatch // check whether stringMatch containing the commaMatch
    ) => stringMatch.start < commaMatch.index && this.overwriteSyntax.lastIndex < stringMatch.end;
    match = this.overwriteSyntax.exec(input);
    while (match) {
      const matchContained = contained(match);
      const containedBy = stringMatches.find(matchContained);
      if (!containedBy) {
        // if uncontained, this comma respresents a splitting location
        commaReplacements.push({
          start: match.index,
          end: this.overwriteSyntax.lastIndex,
        });
      }
      match = this.overwriteSyntax.exec(input);
    }
    let prior = 0;
    const results = [];
    commaReplacements.forEach(replacement => {
      results.push(input.slice(prior, replacement.start));
      prior = replacement.end;
    });
    results.push(input.slice(prior));
    return results;
  }
  /**
   * Resolve the given variable string that expresses a series of fallback values in case the
   * initial values are not valid, resolving each variable and resolving to the first valid value.
   * @param variableStrings The overwrite variables to populate and choose from.
   * @param variableMatch The original string from which the variables were extracted.
   * @returns {Promise.<TResult>|*} A promise resolving to the first validly populating variable
   *  in the given variable strings string.
   */
  overwrite(variableStrings, variableMatch, propertyString) {
    // A sentinel to rid rejected Promises, so any of resolved value can be used as fallback.
    const FAIL_TOKEN = {};
    const variableValues = variableStrings.map(variableString =>
      this.getValueFromSource(variableString, propertyString).catch(() => FAIL_TOKEN)
    ); // eslint-disable-line no-unused-vars

    const validValue = value =>
      value !== null &&
      typeof value !== 'undefined' &&
      (Array.isArray(value) || !(typeof value === 'object' && _.isEmpty(value)));

    return BbPromise.all(variableValues)
      .then(values => values.filter(v => v !== FAIL_TOKEN))
      .then(values => {
        let deepPropertyString = variableMatch;
        let deepProperties = 0;
        values.forEach((value, index) => {
          if (_.isString(value) && value.match(this.variableSyntax)) {
            deepProperties += 1;
            const deepVariable = this.makeDeepVariable(value);
            deepPropertyString = deepPropertyString.replace(
              variableStrings[index],
              this.cleanVariable(deepVariable)
            );
          }
        });
        return deepProperties > 0
          ? BbPromise.resolve(deepPropertyString) // return deep variable replacement of original
          : BbPromise.resolve(values.find(validValue)); // resolve first valid value, else undefined
      });
  }
  /**
   * Given any variable string, return the value it should be populated with.
   * @param variableString The variable string to retrieve a value for.
   * @returns {Promise.<TResult>|*} A promise resolving to the given variables value.
   */
  getValueFromSource(variableString, propertyString) {
    let ret;
    if (this.tracker.contains(variableString)) {
      ret = this.tracker.get(variableString, propertyString);
    } else {
      for (const { regex, resolver } of this.variableResolvers) {
        if (variableString.match(regex)) {
          ret = resolver(variableString);
          break;
        }
      }
      if (!ret) {
        const errorMessage = [
          `Invalid variable reference syntax for variable ${variableString}.`,
          ' You can only reference env vars, options, & files.',
          ' You can check our docs for more info.',
        ].join('');
        ret = BbPromise.reject(new this.serverless.classes.Error(errorMessage));
      }
      ret = this.tracker.add(variableString, ret, propertyString);
    }
    return ret;
  }

  getValueFromSls(variableString) {
    let valueToPopulate = {};
    const requestedSlsVar = variableString.split(':')[1];
    if (requestedSlsVar === 'instanceId') {
      valueToPopulate = this.serverless.instanceId;
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromEnv(variableString) {
    // eslint-disable-line class-methods-use-this
    const requestedEnvVar = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedEnvVar !== '' || '' in process.env) {
      valueToPopulate = process.env[requestedEnvVar];
    } else {
      valueToPopulate = process.env;
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromString(variableString) {
    // eslint-disable-line class-methods-use-this
    const valueToPopulate = variableString.replace(/^['"]|['"]$/g, '');
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromOptions(variableString) {
    const requestedOption = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedOption !== '' || '' in this.options) {
      valueToPopulate = this.options[requestedOption];
    } else {
      valueToPopulate = this.options;
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromSelf(variableString) {
    const selfServiceRex = /self:service\./;
    let variable = variableString;
    // ###################################################################
    // ## KEEP SYNCHRONIZED WITH EQUIVALENT IN ~/lib/classes/Service.js ##
    // ##   there, see `loadServiceFileParam`                           ##
    // ###################################################################
    // The loaded service is altered during load in ~/lib/classes/Service (see loadServiceFileParam)
    // Account for these so that user's reference to their file populate properly
    if (variable === 'self:service.name') {
      variable = 'self:service';
    } else if (variable.match(selfServiceRex)) {
      variable = variable.replace(selfServiceRex, 'self:serviceObject.');
    } else if (variable === 'self:provider') {
      variable = 'self:provider.name';
    }
    const valueToPopulate = this.service;
    const deepProperties = variable
      .split(':')[1]
      .split('.')
      .filter(property => property);
    return this.getDeeperValue(deepProperties, valueToPopulate);
  }

  getValueFromFile(variableString) {
    const matchedFileRefString = variableString.match(this.fileRefSyntax)[0];
    const referencedFileRelativePath = matchedFileRefString
      .replace(this.fileRefSyntax, (match, varName) => varName.trim())
      .replace('~', os.homedir());

    let referencedFileFullPath = path.isAbsolute(referencedFileRelativePath)
      ? referencedFileRelativePath
      : path.join(this.serverless.config.servicePath, referencedFileRelativePath);

    // Get real path to handle potential symlinks (but don't fatal error)
    referencedFileFullPath = fse.existsSync(referencedFileFullPath)
      ? fse.realpathSync(referencedFileFullPath)
      : referencedFileFullPath;

    let fileExtension = referencedFileRelativePath.split('.');
    fileExtension = fileExtension[fileExtension.length - 1];
    // Validate file exists
    if (!this.serverless.utils.fileExistsSync(referencedFileFullPath)) {
      return BbPromise.resolve(undefined);
    }

    let valueToPopulate;

    // Process JS files
    if (fileExtension === 'js') {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const jsFile = require(referencedFileFullPath);
      const variableArray = variableString.split(':');
      let returnValueFunction;
      if (variableArray[1]) {
        let jsModule = variableArray[1];
        jsModule = jsModule.split('.')[0];
        returnValueFunction = jsFile[jsModule];
      } else {
        returnValueFunction = jsFile;
      }

      if (typeof returnValueFunction !== 'function') {
        const errorMessage = [
          'Invalid variable syntax when referencing',
          ` file "${referencedFileRelativePath}".`,
          ' Check if your javascript is exporting a function that returns a value.',
        ].join('');
        return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
      }
      valueToPopulate = returnValueFunction.call(jsFile, this.serverless);

      return BbPromise.resolve(valueToPopulate).then(valueToPopulateResolved => {
        let deepProperties = variableString.replace(matchedFileRefString, '');
        deepProperties = deepProperties.slice(1).split('.');
        deepProperties.splice(0, 1);
        return this.getDeeperValue(deepProperties, valueToPopulateResolved).then(
          deepValueToPopulateResolved => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = [
                'Invalid variable syntax when referencing',
                ` file "${referencedFileRelativePath}".`,
                ' Check if your javascript is returning the correct data.',
              ].join('');
              return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
            }
            return BbPromise.resolve(deepValueToPopulateResolved);
          }
        );
      });
    }

    // Process everything except JS
    if (fileExtension !== 'js') {
      valueToPopulate = this.serverless.utils.readFileSync(referencedFileFullPath);
      if (matchedFileRefString !== variableString) {
        let deepProperties = variableString.replace(matchedFileRefString, '');
        if (deepProperties.substring(0, 1) !== ':') {
          const errorMessage = [
            'Invalid variable syntax when referencing',
            ` file "${referencedFileRelativePath}" sub properties`,
            ' Please use ":" to reference sub properties.',
          ].join('');
          return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
        }
        deepProperties = deepProperties.slice(1).split('.');
        return this.getDeeperValue(deepProperties, valueToPopulate);
      }
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromCf(variableString) {
    const regionSuffix = variableString.split(':')[0].split('.')[1];
    const variableStringWithoutSource = variableString.split(':')[1].split('.');
    const stackName = variableStringWithoutSource[0];
    const outputLogicalId = variableStringWithoutSource[1];
    const options = { useCache: true };
    if (!_.isUndefined(regionSuffix)) {
      options.region = regionSuffix;
    }
    return this.serverless
      .getProvider('aws')
      .request('CloudFormation', 'describeStacks', { StackName: stackName }, options)
      .then(result => {
        const outputs = result.Stacks[0].Outputs;
        const output = outputs.find(x => x.OutputKey === outputLogicalId);

        if (output === undefined) {
          const errorMessage = [
            'Trying to request a non exported variable from CloudFormation.',
            ` Stack name: "${stackName}"`,
            ` Requested variable: "${outputLogicalId}".`,
          ].join('');
          return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
        }
        return BbPromise.resolve(output.OutputValue);
      });
  }

  getValueFromS3(variableString) {
    const groups = variableString.match(this.s3RefSyntax);
    const bucket = groups[1];
    const key = groups[2];
    return this.serverless
      .getProvider('aws')
      .request(
        'S3',
        'getObject',
        {
          Bucket: bucket,
          Key: key,
        },
        { useCache: true }
      ) // Use request cache
      .then(response => BbPromise.resolve(response.Body.toString()))
      .catch(err => {
        const errorMessage = `Error getting value for ${variableString}. ${err.message}`;
        return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
      });
  }

  getValueFromSsm(variableString) {
    const groups = variableString.match(this.ssmRefSyntax);
    const param = groups[1];
    const decrypt = groups[2] === 'true';
    const split = groups[2] === 'split';
    return this.serverless
      .getProvider('aws')
      .request(
        'SSM',
        'getParameter',
        {
          Name: param,
          WithDecryption: decrypt,
        },
        { useCache: true }
      ) // Use request cache
      .then(response => {
        const plainText = response.Parameter.Value;
        const type = response.Parameter.Type;
        // Only if Secrets Manager. Parameter Store does not support JSON.
        // We cannot parse StringList types, so don't try
        if (type !== 'StringList' && param.startsWith('/aws/reference/secretsmanager')) {
          try {
            const json = JSON.parse(plainText);
            return BbPromise.resolve(json);
          } catch (err) {
            // return as plain text if value is not JSON
          }
        }
        if (split) {
          if (type === 'StringList') {
            return BbPromise.resolve(plainText.split(','));
          }
          logWarning(
            `Cannot split SSM parameter '${param}' of type '${type}'. Must be 'StringList'.`
          );
        }
        return BbPromise.resolve(plainText);
      })
      .catch(err => {
        if (err.statusCode !== 400) {
          return BbPromise.reject(new this.serverless.classes.Error(err.message));
        }

        return BbPromise.resolve(undefined);
      });
  }

  getValueStrToBool(variableString) {
    return BbPromise.try(() => {
      if (_.isString(variableString)) {
        const groups = variableString.match(this.strToBoolRefSyntax);
        const param = groups[1].trim();
        if (/^(true|false|0|1)$/.test(param)) {
          if (param === 'false' || param === '0') {
            return false;
          }
          // truthy or non-empty strings
          return true;
        }
        throw new this.serverless.classes.Error(
          'Unexpected strToBool input; expected either "true", "false", "0", or "1".'
        );
      }
      // Cast non-string inputs
      return Boolean(variableString);
    });
  }

  getDeepIndex(variableString) {
    const deepIndexReplace = RegExp(/^deep:|(\.[^}]+)*$/g);
    return variableString.replace(deepIndexReplace, '');
  }
  getVariableFromDeep(variableString) {
    const index = this.getDeepIndex(variableString);
    return this.deep[index];
  }
  getValueFromDeep(variableString) {
    const deepPrefixReplace = RegExp(/(?:^deep:)\d+\.?/g);
    const variable = this.getVariableFromDeep(variableString);
    const deepRef = variableString.replace(deepPrefixReplace, '');
    let ret = this.populateValue(variable);
    if (deepRef.length) {
      // if there is a deep reference remaining
      ret = ret.then(result => {
        if (_.isString(result) && result.match(this.variableSyntax)) {
          const deepVariable = this.makeDeepVariable(result);
          return BbPromise.resolve(this.appendDeepVariable(deepVariable, deepRef));
        }
        return this.getDeeperValue(deepRef.split('.'), result);
      });
    }
    return ret;
  }

  makeDeepVariable(variable) {
    let index = this.deep.findIndex(item => variable === item);
    if (index < 0) {
      index = this.deep.push(variable) - 1;
    }
    const variableContainer = variable.match(this.variableSyntax)[0];
    const variableString = this.cleanVariable(variableContainer).replace(/\s/g, '');
    return variableContainer.replace(/\s/g, '').replace(variableString, `deep:${index}`);
  }
  appendDeepVariable(variable, subProperty) {
    const variableString = this.cleanVariable(variable);
    return variable.replace(variableString, `${variableString}.${subProperty}`);
  }

  /**
   * Get a value that is within the given valueToPopulate.  The deepProperties specify what value
   * to retrieve from the given valueToPopulate.  The trouble is that anywhere along this chain a
   * variable can be discovered.  If this occurs, to avoid cyclic dependencies, the resolution of
   * the deep value from the given valueToPopulate must be halted.  The discovered variable is thus
   * set aside into a "deep variable" (see makeDeepVariable).  The indexing into the given
   * valueToPopulate is then resolved with a replacement ${deep:${index}.${remaining.properties}}
   * variable (e.g. ${deep:1.foo}).  This pauses the population for continuation during the next
   * generation of evaluation (see getValueFromDeep)
   * @param deepProperties The "path" of properties to follow in obtaining the deeper value
   * @param valueToPopulate The value from which to obtain the deeper value
   * @returns {Promise} A promise resolving to the deeper value or to a `deep` variable that
   * will later resolve to the deeper value
   */
  getDeeperValue(deepProperties, valueToPopulate) {
    return BbPromise.reduce(
      deepProperties,
      (reducedValueParam, subProperty) => {
        let reducedValue = reducedValueParam;
        if (_.isString(reducedValue) && reducedValue.match(this.deepRefSyntax)) {
          // build mode
          reducedValue = this.appendDeepVariable(reducedValue, subProperty);
        } else {
          // get mode
          if (typeof reducedValue === 'undefined') {
            reducedValue = {};
          } else if (subProperty !== '' || '' in reducedValue) {
            reducedValue = reducedValue[subProperty];
          }
          if (typeof reducedValue === 'string' && reducedValue.match(this.variableSyntax)) {
            reducedValue = this.makeDeepVariable(reducedValue);
          }
        }
        return BbPromise.resolve(reducedValue);
      },
      valueToPopulate
    );
  }

  warnIfNotFound(variableString, valueToPopulate) {
    if (
      valueToPopulate === null ||
      typeof valueToPopulate === 'undefined' ||
      (typeof valueToPopulate === 'object' &&
        !Array.isArray(valueToPopulate) &&
        _.isEmpty(valueToPopulate))
    ) {
      let varType;
      if (variableString.match(this.envRefSyntax)) {
        varType = 'environment variable';
      } else if (variableString.match(this.optRefSyntax)) {
        varType = 'option';
      } else if (variableString.match(this.selfRefSyntax)) {
        varType = 'service attribute';
      } else if (variableString.match(this.fileRefSyntax)) {
        varType = 'file';
      } else if (variableString.match(this.ssmRefSyntax)) {
        varType = 'SSM parameter';
      }
      if (!_.isUndefined(varType)) {
        logWarning(
          `A valid ${varType} to satisfy the declaration '${variableString}' could not be found.`
        );
      }
    }
    return valueToPopulate;
  }
}

module.exports = Variables;
