'use strict';

const _ = require('lodash');
const path = require('path');
const replaceall = require('replaceall');
const logWarning = require('./Error').logWarning;

_.mixin(require('lodash-deep'));

class Variables {

  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;

    this.overwriteSyntax = RegExp(/,/g);
    this.fileRefSyntax = RegExp(/^file\(([a-zA-Z0-9._\-/]+?)\)/g);
    this.envRefSyntax = RegExp(/^env:/g);
    this.optRefSyntax = RegExp(/^opt:/g);
    this.selfRefSyntax = RegExp(/^self:/g);
  }

  loadVariableSyntax() {
    this.variableSyntax = RegExp(this.service.provider.variableSyntax, 'g');
  }

  populateService(processedOptions) {
    this.options = processedOptions || {};

    this.loadVariableSyntax();

    const variableSyntaxProperty = this.service.provider.variableSyntax;

    // temporally remove variable syntax from service otherwise it'll match
    this.service.provider.variableSyntax = true;

    this.serverless.service.serverless = null;
    const populateAll = [];

    _.deepMapValues(this.service, (property, propertyPath) => {
      if (typeof property === 'string') {
        const populateSingleProperty = new Promise((resolve) => this
          .populateProperty(property, true).then(newProperty => {
            _.set(this.service, propertyPath, newProperty);
            return resolve();
          }));
        populateAll.push(populateSingleProperty);
      }
    });

    return Promise.all(populateAll).then(() => {
      this.service.provider.variableSyntax = variableSyntaxProperty;
      this.serverless.service.serverless = this.serverless;
      console.log(this.service)
      return this.service;
    });
  }

  populateProperty(propertyParam, populateInPlace) {
    let property;
    if (populateInPlace) {
      property = propertyParam;
    } else {
      property = _.cloneDeep(propertyParam);
    }
    const allValuesToPopulate = [];

    if (typeof property === 'string' && property.match(this.variableSyntax)) {
      property.match(this.variableSyntax).forEach((matchedString) => {
        const variableString = matchedString
          .replace(this.variableSyntax, (match, varName) => varName.trim())
          .replace(/\s/g, '');

        const singleValueToPopulate = new Promise((resolve) => {
          if (variableString.match(this.overwriteSyntax)) {
            return this.overwrite(variableString)
              .then(valueToPopulate => resolve(valueToPopulate));
          }
          return this.getValueFromSource(variableString)
            .then(valueToPopulate => resolve(valueToPopulate));
        });

        singleValueToPopulate.then(valueToPopulate => {
          this.warnIfNotFound(variableString, valueToPopulate);
          return this.populateVariable(property, matchedString, valueToPopulate)
            .then(newProperty => {
              property = newProperty;
              return Promise.resolve(property);
            });
        });

        allValuesToPopulate.push(singleValueToPopulate);
      });
      return Promise.all(allValuesToPopulate).then(() => {
        if (property !== this.service) {
          return this.populateProperty(property);
        }
        return Promise.resolve(property);
      });
    }
    // return property;
    return Promise.resolve(property);
  }

  populateVariable(propertyParam, matchedString, valueToPopulate) {
    let property = propertyParam;
    if (typeof valueToPopulate === 'string') {
      property = replaceall(matchedString, valueToPopulate, property);
    } else {
      if (property !== matchedString) {
        if (typeof valueToPopulate === 'number') {
          property = replaceall(matchedString, String(valueToPopulate), property);
        } else {
          const errorMessage = [
            'Trying to populate non string value into',
            ` a string for variable ${matchedString}.`,
            ' Please make sure the value of the property is a string.',
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }
        return Promise.resolve(property);
      }
      property = valueToPopulate;
    }
    return Promise.resolve(property);
  }

  overwrite(variableStringsString) {
    let finalValue;
    const variableStringsArray = variableStringsString.split(',');
    const allValuesFromSource = variableStringsArray
      .map(variableString => this.getValueFromSource(variableString));
    return Promise.all(allValuesFromSource).then(valuesFromSources => {
      valuesFromSources.find(valueFromSource => {
        finalValue = valueFromSource;
        return (finalValue !== null && typeof finalValue !== 'undefined') &&
          !(typeof finalValue === 'object' && _.isEmpty(finalValue));
      });
      return Promise.resolve(finalValue);
    });
  }

  getValueFromSource(variableString) {
    if (variableString.match(this.envRefSyntax)) {
      return this.getValueFromEnv(variableString);
    } else if (variableString.match(this.optRefSyntax)) {
      return this.getValueFromOptions(variableString);
    } else if (variableString.match(this.selfRefSyntax)) {
      return this.getValueFromSelf(variableString);
    } else if (variableString.match(this.fileRefSyntax)) {
      return this.getValueFromFile(variableString);
    }
    const errorMessage = [
      `Invalid variable reference syntax for variable ${variableString}.`,
      ' You can only reference env vars, options, & files.',
      ' You can check our docs for more info.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  }

  getValueFromEnv(variableString) {
    const requestedEnvVar = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedEnvVar !== '' || '' in process.env) {
      valueToPopulate = process.env[requestedEnvVar];
    } else {
      valueToPopulate = process.env;
    }
    return Promise.resolve(valueToPopulate);
  }

  getValueFromOptions(variableString) {
    const requestedOption = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedOption !== '' || '' in this.options) {
      valueToPopulate = this.options[requestedOption];
    } else {
      valueToPopulate = this.options;
    }
    return Promise.resolve(valueToPopulate);
  }

  getValueFromSelf(variableString) {
    const valueToPopulate = this.service;
    const deepProperties = variableString.split(':')[1].split('.');
    return this.getDeepValue(deepProperties, valueToPopulate);
  }

  getValueFromFile(variableString) {
    const matchedFileRefString = variableString.match(this.fileRefSyntax)[0];
    const referencedFileRelativePath = matchedFileRefString
      .replace(this.fileRefSyntax, (match, varName) => varName.trim());
    const referencedFileFullPath = path.join(this.serverless.config.servicePath,
      referencedFileRelativePath);
    let fileExtension = referencedFileRelativePath.split('.');
    fileExtension = fileExtension[fileExtension.length - 1];

    // Validate file exists
    if (!this.serverless.utils.fileExistsSync(referencedFileFullPath)) {
      return Promise.resolve(undefined);
    }

    let valueToPopulate;

    // Process JS files
    if (fileExtension === 'js') {
      const jsFile = require(referencedFileFullPath); // eslint-disable-line global-require
      let jsModule = variableString.split(':')[1];
      jsModule = jsModule.split('.')[0];
      valueToPopulate = jsFile[jsModule]();

      return Promise.resolve(valueToPopulate).then(valueToPopulateResolved => {
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
            return Promise.resolve(deepValueToPopulateResolved);
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
    return Promise.resolve(valueToPopulate);
  }

  getDeepValue(deepProperties, valueToPopulateParam) {
    let valueToPopulate = valueToPopulateParam;
    deepProperties.forEach(subProperty => {
      if (typeof valueToPopulate === 'undefined') {
        valueToPopulate = {};
      } else if (subProperty !== '' || '' in valueToPopulate) {
        valueToPopulate = valueToPopulate[subProperty];
      }
      if (typeof valueToPopulate === 'string' && valueToPopulate.match(this.variableSyntax)) {
        return this.populateProperty(valueToPopulate);
      }
      return Promise.resolve(valueToPopulate);
    });
    return Promise.resolve(valueToPopulate);
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
      }
      logWarning(
        `A valid ${varType} to satisfy the declaration '${variableString}' could not be found.`
      );
    }
  }
}

module.exports = Variables;
