'use strict';

const _ = require('lodash');
const path = require('path');
const replaceall = require('replaceall');
const logWarning = require('./Error').logWarning;
const BbPromise = require('bluebird');
const os = require('os');
const fse = require('../utils/fs/fse');

class Variables {

  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;
    this.cache = {};

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
    this.service.provider.variableSyntax = true; // matches itself
    this.serverless.service.serverless = null;
    return this.populateObject(this.service).then(() => {
      // restore
      this.service.provider.variableSyntax = variableSyntaxProperty;
      this.serverless.service.serverless = this.serverless;
      return BbPromise.resolve(this.service);
    });
  }
  /**
   * Populate the variables in the given object.
   * @param objectToPopulate The object to populate variables within.
   * @returns {Promise.<TResult>|*} A promise resolving to the in-place populated object.
   */
  populateObject(objectToPopulate) {
    // Map terminal values of given root (i.e. for every leaf value...)
    const forEachLeaf = (root, context, callback) => {
      const addContext = (value, key) => forEachLeaf(value, context.concat(key), callback);
      if (
        _.isArray(root)
      ) {
        return _.map(root, addContext);
      } else if (
        _.isObject(root) &&
        !_.isDate(root) &&
        !_.isRegExp(root) &&
        !_.isFunction(root)
      ) {
        return _.extend({}, root, _.mapValues(root, addContext));
      }
      return callback(root, context);
    };
    // For every leaf value...
    const pendingLeaves = [];
    forEachLeaf(
      objectToPopulate,
      [],
      (leafValue, leafPath) => {
        if (typeof leafValue === 'string') {
          pendingLeaves.push(this
            .populateProperty(leafValue, true)
            .then(leafValuePopulated => _.set(objectToPopulate, leafPath, leafValuePopulated))
          );
        }
      }
    );
    return BbPromise.all(pendingLeaves).then(() => objectToPopulate);
  }
  /**
   * Populate variables, in-place if specified, in the given property value.
   * @param propertyToPopulate The property to populate (only strings with variables are altered).
   * @param populateInPlace Whether to deeply clone the given property prior to population.
   * @returns {Promise.<TResult>|*} A promise resolving to the populated result.
   */
  populateProperty(propertyToPopulate, populateInPlace) {
    let property = propertyToPopulate;
    if (!populateInPlace) {
      property = _.cloneDeep(propertyToPopulate);
    }
    if (
      typeof property !== 'string' ||
      !property.match(this.variableSyntax)
    ) {
      return BbPromise.resolve(property);
    }
    const pendingMatches = [];
    property.match(this.variableSyntax).forEach((matchedString) => {
      const variableString = matchedString
        .replace(this.variableSyntax, (match, varName) => varName.trim())
        .replace(/\s/g, '');

      let pendingMatch;
      if (variableString.match(this.overwriteSyntax)) {
        pendingMatch = this.overwrite(variableString);
      } else {
        pendingMatch = this.getValueFromSource(variableString);
      }
      pendingMatches.push(pendingMatch.then(matchedValue => {
        this.warnIfNotFound(variableString, matchedValue);
        return this.populateVariable(property, matchedString, matchedValue)
          .then((populatedProperty) => {
            property = populatedProperty;
          });
      }));
    });
    return BbPromise.all(pendingMatches)
      .then(() => this.populateProperty(property, true));
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
    return BbPromise.resolve(property);
  }
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
      this.getValueFromSource(variableString)
    );
    const validValue = value => (
      value !== null &&
      typeof value !== 'undefined' &&
      !(typeof value === 'object' && _.isEmpty(value))
    );
    return BbPromise.all(variableValues)
      .then(values => // find and resolve first valid value, undefined if none
        BbPromise.resolve(values.find(validValue))
      );
  }
  /**
   * Given any variable string, return the value it should be populated with.
   * @param variableString The variable string to retrieve a value for.
   * @returns {Promise.<TResult>|*} A promise resolving to the given variables value.
   */
  getValueFromSource(variableString) {
    if (!(variableString in this.cache)) {
      let value;
      if (variableString.match(this.envRefSyntax)) {
        value = this.getValueFromEnv(variableString);
      } else if (variableString.match(this.optRefSyntax)) {
        value = this.getValueFromOptions(variableString);
      } else if (variableString.match(this.selfRefSyntax)) {
        value = this.getValueFromSelf(variableString);
      } else if (variableString.match(this.fileRefSyntax)) {
        value = this.getValueFromFile(variableString);
      } else if (variableString.match(this.cfRefSyntax)) {
        value = this.getValueFromCf(variableString);
      } else if (variableString.match(this.s3RefSyntax)) {
        value = this.getValueFromS3(variableString);
      } else if (variableString.match(this.stringRefSyntax)) {
        value = this.getValueFromString(variableString);
      } else if (variableString.match(this.ssmRefSyntax)) {
        value = this.getValueFromSsm(variableString);
      } else {
        const errorMessage = [
          `Invalid variable reference syntax for variable ${variableString}.`,
          ' You can only reference env vars, options, & files.',
          ' You can check our docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }
      this.cache[variableString] = BbPromise.resolve(value)
        .then(variableValue => {
          if (_.isObject(variableValue) && variableValue !== this.service) {
            return this.populateObject(variableValue);
          }
          return variableValue;
        });
    }
    return this.cache[variableString];
  }

  getValueFromEnv(variableString) {
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
      const jsFile = require(referencedFileFullPath); // eslint-disable-line global-require
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
        throw new this.serverless.classes
          .Error([
            'Invalid variable syntax when referencing',
            ` file "${referencedFileRelativePath}".`,
            ' Check if your javascript is exporting a function that returns a value.',
          ].join(''));
      }
      valueToPopulate = returnValueFunction.call(jsFile);

      return BbPromise.resolve(valueToPopulate).then(valueToPopulateResolved => {
        let deepProperties = variableString.replace(matchedFileRefString, '');
        deepProperties = deepProperties.slice(1).split('.');
        deepProperties.splice(0, 1);
        return this.getDeepValue(deepProperties, valueToPopulateResolved)
          .then(deepValueToPopulateResolved => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = [
                'Invalid variable syntax when referencing',
                ` file "${referencedFileRelativePath}".`,
                ' Check if your javascript is returning the correct data.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
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
          throw new this.serverless.classes
            .Error(errorMessage);
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
        { useCache: true }   // Use request cache
      )
      .then(result => {
        const outputs = result.Stacks[0].Outputs;
        const output = outputs.find(x => x.OutputKey === outputLogicalId);

        if (output === undefined) {
          const errorMessage = [
            'Trying to request a non exported variable from CloudFormation.',
            ` Stack name: "${stackName}"`,
            ` Requested variable: "${outputLogicalId}".`,
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }

        return output.OutputValue;
      });
  }

  getValueFromS3(variableString) {
    const groups = variableString.match(this.s3RefSyntax);
    const bucket = groups[1];
    const key = groups[2];
    return this.serverless.getProvider('aws')
    .request('S3',
      'getObject',
      {
        Bucket: bucket,
        Key: key,
      },
      { useCache: true }   // Use request cache
    )
    .then(
      response => response.Body.toString(),
      err => {
        const errorMessage = `Error getting value for ${variableString}. ${err.message}`;
        throw new this.serverless.classes.Error(errorMessage);
      }
    );
  }

  getValueFromSsm(variableString) {
    const groups = variableString.match(this.ssmRefSyntax);
    const param = groups[1];
    const decrypt = (groups[2] === 'true');
    return this.serverless.getProvider('aws')
    .request('SSM',
      'getParameter',
      {
        Name: param,
        WithDecryption: decrypt,
      },
      { useCache: true }   // Use request cache
    )
    .then(
      response => BbPromise.resolve(response.Parameter.Value),
      err => {
        const expectedErrorMessage = `Parameter ${param} not found.`;
        if (err.message !== expectedErrorMessage) {
          throw new this.serverless.classes.Error(err.message);
        }
        return BbPromise.resolve(undefined);
      }
    );
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
        return this.populateProperty(computedValueToPopulate, true);
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
      logWarning(
        `A valid ${varType} to satisfy the declaration '${variableString}' could not be found.`
      );
    }
  }
}

module.exports = Variables;
