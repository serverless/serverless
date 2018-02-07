'use strict';

const _ = require('lodash');
const path = require('path');
const replaceall = require('replaceall');
const logWarning = require('./Error').logWarning;
const BbPromise = require('bluebird');
const os = require('os');
const fse = require('../utils/fs/fse');

class PromiseTracker {
  constructor() {
    this.promiseList = [];
    this.promiseMap = {};
    this.startTime = Date.now();
  }
  start() {
    this.interval = setInterval(this.report.bind(this), 2500);
  }
  report() {
    const delta = Date.now() - this.startTime;
    logWarning('################################################################################');
    logWarning(`# ${delta}: ${this.getSettled().length} of ${
      this.getAll().length} promises have settled`);
    const pending = this.getPending();
    logWarning(`# ${delta}: ${pending.length} unsettled promises:`);
    pending.forEach((promise) => {
      logWarning(`# ${delta}:   ${promise.waitList}`);
    });
    logWarning('################################################################################');
  }
  stop() {
    clearInterval(this.interval);
  }
  add(variable, prms, specifier) {
    const promise = prms;
    promise.waitList = `${variable} waited on by: ${specifier}`;
    promise.state = 'pending';
    promise.then( // creates a promise with the following effects but that we otherwise ignore
      () => { promise.state = 'resolved'; },
      () => { promise.state = 'rejected'; });
    this.promiseList.push(promise);
    this.promiseMap[variable] = promise;
    return promise;
  }
  contains(variable) {
    return variable in this.promiseMap;
  }
  get(variable, specifier) {
    const promise = this.promiseMap[variable];
    promise.waitList += ` ${specifier}`;
    return promise;
  }
  getPending() { return this.promiseList.filter(p => (p.state === 'pending')); }
  getSettled() { return this.promiseList.filter(p => (p.state !== 'pending')); }
  getAll() { return this.promiseList; }
}

class Variables {
  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;
    this.tracker = new PromiseTracker();

    this.overwriteSyntax = RegExp(/,/g);
    this.fileRefSyntax = RegExp(/^file\((~?[a-zA-Z0-9._\-/]+?)\)/g);
    this.envRefSyntax = RegExp(/^env:/g);
    this.optRefSyntax = RegExp(/^opt:/g);
    this.selfRefSyntax = RegExp(/^self:/g);
    this.cfRefSyntax = RegExp(/^cf:/g);
    this.s3RefSyntax = RegExp(/^s3:(.+?)\/(.+)$/);
    this.stringRefSyntax = RegExp(/('.*')|(".*")/g);
    this.ssmRefSyntax = RegExp(/^ssm:([a-zA-Z0-9_.\-/]+)[~]?(true|false)?/);
  }

  loadVariableSyntax() {
    this.variableSyntax = RegExp(this.service.provider.variableSyntax, 'g');
  }
  // #############
  // ## SERVICE ##
  // #############
  /**
   * Populate all variables in the service, conviently remove and restore the service attributes
   * that confuse the population methods.
   * @param processedOptions An options hive to use for ${opt:...} variables.
   * @returns {Promise.<TResult>|*} A promise resolving to the populated service.
   */
  populateService(processedOptions) {
    this.options = processedOptions || {};

    this.loadVariableSyntax();
    // store
    const variableSyntaxProperty = this.service.provider.variableSyntax;
    // remove
    this.service.provider.variableSyntax = undefined; // otherwise matches itself
    this.service.serverless = undefined;
    this.tracker.start();
    return this.populateObject(this.service)
      .finally(() => {
        // restore
        this.tracker.stop();
        this.service.serverless = this.serverless;
        this.service.provider.variableSyntax = variableSyntaxProperty;
      })
      .then(() => this.service);
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
    if (
      _.isArray(current)
    ) {
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
  populateProperties(properties) {
    return _.map(properties, property =>
      this.populateValue(property.value, false)
        .then(populated => _.assign({}, property, { populated })));
  }
  /**
   * Assign the populated values back to the target object
   * @param target The object to which the given populated terminal properties should be applied
   * @param populations The fully populated terminal properties
   * @returns {Promise<number>} resolving with the number of changes that were applied to the given
   * target
   */
  assignProperties(target, populations) { // eslint-disable-line class-methods-use-this
    return BbPromise.all(populations)
      .then((results) => {
        let changes = 0;
        results.forEach((result) => {
          if (result.value !== result.populated) {
            changes += 1;
            _.set(target, result.path, result.populated);
          }
        });
        return BbPromise.resolve(changes);
      });
  }
  /**
   * Populate the variables in the given object.
   * @param objectToPopulate The object to populate variables within.
   * @returns {Promise.<TResult>|*} A promise resolving to the in-place populated object.
   */
  populateObject(objectToPopulate) {
    const leaves = this.getProperties(objectToPopulate, true, objectToPopulate);
    const populations = this.populateProperties(leaves);
    return this.assignProperties(objectToPopulate, populations)
      .then((changes) => {
        if (changes) {
          return this.populateObject(objectToPopulate);
        }
        return objectToPopulate;
      });
  }
  // ##############
  // ## PROPERTY ##
  // ##############
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
      variable: match.replace(this.variableSyntax, (context, contents) => contents.trim())
        .replace(/\s/g, ''),
    }));
  }
  /**
   * Populate the given matches, returning an array of Promises which will resolve to the populated
   * values of the given matches
   * @param {MatchResult[]} matches The matches to populate
   * @returns {Promise[]} Promises for the eventual populated values of the given matches
   */
  populateMatches(matches) {
    return _.map(matches, (match) => {
      if (match.variable.match(this.overwriteSyntax)) {
        return this.overwrite(match.variable);
      }
      return this.getValueFromSource(match.variable, match.match);
    });
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
      this.warnIfNotFound(matches[i].match, results[i]);
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
    const property = _.cloneDeep(valueToPopulate);
    const matches = this.getMatches(property);
    if (!_.isArray(matches)) {
      return BbPromise.resolve(property);
    }
    const populations = this.populateMatches(matches);
    return BbPromise.all(populations)
      .then(results => this.renderMatches(property, matches, results))
      .then((result) => {
        if (root && matches.length) {
          return this.populateValue(result);
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
    return this.populateValue(propertyToPopulate, true);
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
    if (property === matchedString) { // total replacement
      property = valueToPopulate;
    } else if (_.isString(valueToPopulate)) { // partial replacement, string
      property = replaceall(matchedString, valueToPopulate, property);
    } else if (_.isNumber(valueToPopulate)) { // partial replacement, number
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
   * Overwrite the given variable string, resolve each variable and resolve to the first valid
   * value.
   * @param variableStringsString The overwrite string of variables to populate and choose from.
   * @returns {Promise.<TResult>|*} A promise resolving to the first validly populating variable
   *  in the given variable strings string.
   */
  overwrite(variableStringsString) {
    const variableStrings = variableStringsString.split(',');
    const variableValues = variableStrings.map(variableString =>
      this.getValueFromSource(variableString, variableStringsString));
    const validValue = value => (
      value !== null &&
      typeof value !== 'undefined' &&
      !(typeof value === 'object' && _.isEmpty(value))
    );
    return BbPromise.all(variableValues)
      .then(values => // find and resolve first valid value, undefined if none
        BbPromise.resolve(values.find(validValue)));
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
      if (variableString.match(this.envRefSyntax)) {
        ret = this.getValueFromEnv(variableString);
      } else if (variableString.match(this.optRefSyntax)) {
        ret = this.getValueFromOptions(variableString);
      } else if (variableString.match(this.selfRefSyntax)) {
        ret = this.getValueFromSelf(variableString);
      } else if (variableString.match(this.fileRefSyntax)) {
        ret = this.getValueFromFile(variableString);
      } else if (variableString.match(this.cfRefSyntax)) {
        ret = this.getValueFromCf(variableString);
      } else if (variableString.match(this.s3RefSyntax)) {
        ret = this.getValueFromS3(variableString);
      } else if (variableString.match(this.stringRefSyntax)) {
        ret = this.getValueFromString(variableString);
      } else if (variableString.match(this.ssmRefSyntax)) {
        ret = this.getValueFromSsm(variableString);
      } else {
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

  getValueFromEnv(variableString) { // eslint-disable-line class-methods-use-this
    const requestedEnvVar = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedEnvVar !== '' || '' in process.env) {
      valueToPopulate = process.env[requestedEnvVar];
    } else {
      valueToPopulate = process.env;
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromString(variableString) { // eslint-disable-line class-methods-use-this
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
    const valueToPopulate = this.service;
    const deepProperties = variableString.split(':')[1].split('.');
    return this.getDeepValue(deepProperties, valueToPopulate);
  }

  getValueFromFile(variableString) {
    const matchedFileRefString = variableString.match(this.fileRefSyntax)[0];
    const referencedFileRelativePath = matchedFileRefString
      .replace(this.fileRefSyntax, (match, varName) => varName.trim())
      .replace('~', os.homedir());

    let referencedFileFullPath = (path.isAbsolute(referencedFileRelativePath) ?
      referencedFileRelativePath :
      path.join(this.serverless.config.servicePath, referencedFileRelativePath));

    // Get real path to handle potential symlinks (but don't fatal error)
    referencedFileFullPath = fse.existsSync(referencedFileFullPath) ?
      fse.realpathSync(referencedFileFullPath) :
      referencedFileFullPath;

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
      valueToPopulate = returnValueFunction.call(jsFile);

      return BbPromise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
        let deepProperties = variableString.replace(matchedFileRefString, '');
        deepProperties = deepProperties.slice(1).split('.');
        deepProperties.splice(0, 1);
        return this.getDeepValue(deepProperties, valueToPopulateResolved)
          .then((deepValueToPopulateResolved) => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = [
                'Invalid variable syntax when referencing',
                ` file "${referencedFileRelativePath}".`,
                ' Check if your javascript is returning the correct data.',
              ].join('');
              return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
            }
            return BbPromise.resolve(deepValueToPopulateResolved);
          });
      });
    }

    // Process everything except JS
    if (fileExtension !== 'js') {
      valueToPopulate = this.serverless.utils.readFileSync(referencedFileFullPath);
      if (matchedFileRefString !== variableString) {
        let deepProperties = variableString
          .replace(matchedFileRefString, '');
        if (deepProperties.substring(0, 1) !== ':') {
          const errorMessage = [
            'Invalid variable syntax when referencing',
            ` file "${referencedFileRelativePath}" sub properties`,
            ' Please use ":" to reference sub properties.',
          ].join('');
          return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
        }
        deepProperties = deepProperties.slice(1).split('.');
        return this.getDeepValue(deepProperties, valueToPopulate);
      }
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromCf(variableString) {
    const variableStringWithoutSource = variableString.split(':')[1].split('.');
    const stackName = variableStringWithoutSource[0];
    const outputLogicalId = variableStringWithoutSource[1];
    return this.serverless.getProvider('aws')
      .request('CloudFormation',
        'describeStacks',
        { StackName: stackName },
        { useCache: true })// Use request cache
      .then((result) => {
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
    return this.serverless.getProvider('aws').request(
      'S3',
      'getObject',
      {
        Bucket: bucket,
        Key: key,
      },
      { useCache: true }) // Use request cache
      .then(response => BbPromise.resolve(response.Body.toString()))
      .catch((err) => {
        const errorMessage = `Error getting value for ${variableString}. ${err.message}`;
        return BbPromise.reject(new this.serverless.classes.Error(errorMessage));
      });
  }

  getValueFromSsm(variableString) {
    const groups = variableString.match(this.ssmRefSyntax);
    const param = groups[1];
    const decrypt = (groups[2] === 'true');
    return this.serverless.getProvider('aws').request(
      'SSM',
      'getParameter',
      {
        Name: param,
        WithDecryption: decrypt,
      },
      { useCache: true }) // Use request cache
      .then(response => BbPromise.resolve(response.Parameter.Value))
      .catch((err) => {
        const expectedErrorMessage = `Parameter ${param} not found.`;
        if (err.message !== expectedErrorMessage) {
          return BbPromise.reject(new this.serverless.classes.Error(err.message));
        }
        return BbPromise.resolve(undefined);
      });
  }

  getDeepValue(deepProperties, valueToPopulate) {
    return BbPromise.reduce(deepProperties, (computedValueToPopulateParam, subProperty) => {
      let computedValueToPopulate = computedValueToPopulateParam;
      if (typeof computedValueToPopulate === 'undefined') {
        computedValueToPopulate = {};
      } else if (subProperty !== '' || '' in computedValueToPopulate) {
        computedValueToPopulate = computedValueToPopulate[subProperty];
      }
      if (typeof computedValueToPopulate === 'string' &&
        computedValueToPopulate.match(this.variableSyntax)) {
        return this.populateValue(computedValueToPopulate, false);
      }
      return BbPromise.resolve(computedValueToPopulate);
    }, valueToPopulate);
  }

  warnIfNotFound(variableString, valueToPopulate) {
    if (
      valueToPopulate === null ||
      typeof valueToPopulate === 'undefined' ||
      (typeof valueToPopulate === 'object' && _.isEmpty(valueToPopulate))
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
      logWarning(`A valid ${varType} to satisfy the declaration '${
        variableString}' could not be found.`);
    }
    return valueToPopulate;
  }
}

module.exports = Variables;
