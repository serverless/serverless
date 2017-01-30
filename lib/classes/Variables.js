'use strict';

const _ = require('lodash');
const path = require('path');
const traverse = require('traverse');
const replaceall = require('replaceall');

class Variables {

  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;

    this.overwriteSyntax = RegExp(/,/g);
    this.fileRefSyntax = RegExp(/^file\(([a-zA-Z0-9._\-/]+?)\)/g);
    this.envRefSyntax = RegExp(/^env:./g);
    this.optRefSyntax = RegExp(/^opt:./g);
    this.selfRefSyntax = RegExp(/^self:./g);
  }

  loadVariableSyntax() {
    this.variableSyntax = RegExp(this.service.provider.variableSyntax, 'g');
  }

  populateService(processedOptions) {
    const that = this;
    this.options = processedOptions || {};

    this.loadVariableSyntax();

    const variableSyntaxProperty = this.service.provider.variableSyntax;

    // temporally remove variable syntax from service otherwise it'll match
    this.service.provider.variableSyntax = true;

    /*
     * we can't use an arrow function in this case cause that would
     * change the lexical scoping required by the traverse module
     */
    traverse(this.service).forEach(function (propertyParam) {
      const t = this;
      let property = propertyParam;

      if (typeof property === 'string') {
        property = that.populateProperty(property);
        t.update(property);
      }
    });

    this.service.provider.variableSyntax = variableSyntaxProperty;
    return this.service;
  }

  populateProperty(propertyParam) {
    let property = propertyParam;
    let valueToPopulate;
    if (typeof property === 'string' && property.match(this.variableSyntax)) {
      property.match(this.variableSyntax).forEach((matchedString) => {
        const variableString = matchedString
          .replace(this.variableSyntax, (match, varName) => varName.trim())
          .replace(/\s/g, '');

        if (variableString.match(this.overwriteSyntax)) {
          valueToPopulate = this.overwrite(variableString);
        } else {
          valueToPopulate = this.getValueFromSource(variableString);
        }

        property = this.populateVariable(property, matchedString, valueToPopulate);
      });
      return this.populateProperty(property);
    }
    return property;
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
        return property;
      }
      property = valueToPopulate;
    }
    return property;
  }

  overwrite(variableStringsString) {
    let finalValue;
    const variableStringsArray = variableStringsString.split(',');
    variableStringsArray.find(variableString => {
      finalValue = this.getValueFromSource(variableString);
      return (finalValue !== null && typeof finalValue !== 'undefined') &&
        !(typeof finalValue === 'object' && _.isEmpty(finalValue));
    });

    return finalValue;
  }

  getValueFromSource(variableString) {
    let valueToPopulate;
    if (variableString.match(this.envRefSyntax)) {
      valueToPopulate = this.getValueFromEnv(variableString);
    } else if (variableString.match(this.optRefSyntax)) {
      valueToPopulate = this.getValueFromOptions(variableString);
    } else if (variableString.match(this.selfRefSyntax)) {
      valueToPopulate = this.getValueFromSelf(variableString);
    } else if (variableString.match(this.fileRefSyntax)) {
      valueToPopulate = this.getValueFromFile(variableString);
    } else {
      const errorMessage = [
        `Invalid variable reference syntax for variable ${variableString}.`,
        ' You can only reference env vars, options, & files.',
        ' You can check our docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    return valueToPopulate;
  }

  getValueFromEnv(variableString) {
    const requestedEnvVar = variableString.split(':')[1];
    const valueToPopulate = process.env[requestedEnvVar];
    return valueToPopulate;
  }

  getValueFromOptions(variableString) {
    const requestedOption = variableString.split(':')[1];
    const valueToPopulate = this.options[requestedOption];
    return valueToPopulate;
  }

  getValueFromSelf(variableString) {
    let valueToPopulate = _.cloneDeep(this.service);
    const deepProperties = variableString.split(':')[1].split('.');
    valueToPopulate = this.getDeepValue(deepProperties, valueToPopulate);
    return valueToPopulate;
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
      return undefined;
    }

    let valueToPopulate;

    // Process JS files
    if (fileExtension === 'js') {
      const jsFile = require(referencedFileFullPath); // eslint-disable-line global-require
      let jsModule = variableString.split(':')[1];
      jsModule = jsModule.split('.')[0];
      valueToPopulate = jsFile[jsModule]();
      let deepProperties = variableString.replace(matchedFileRefString, '');
      deepProperties = deepProperties.slice(1).split('.');
      deepProperties.splice(0, 1);
      valueToPopulate = this.getDeepValue(deepProperties, valueToPopulate);

      if (typeof valueToPopulate === 'undefined') {
        const errorMessage = [
          'Invalid variable syntax when referencing',
          ` file "${referencedFileRelativePath}".`,
          ' Check if your javascript is returning the correct data.',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }
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
        valueToPopulate = this.getDeepValue(deepProperties, valueToPopulate);
      }
    }
    return valueToPopulate;
  }

  getDeepValue(deepProperties, valueToPopulateParam) {
    let valueToPopulate = valueToPopulateParam;
    deepProperties.forEach(subProperty => {
      if (typeof valueToPopulate === 'undefined') {
        valueToPopulate = {};
      } else {
        valueToPopulate = valueToPopulate[subProperty];
      }
      if (typeof valueToPopulate === 'string' && valueToPopulate.match(this.variableSyntax)) {
        valueToPopulate = this.populateProperty(valueToPopulate);
      }
    });
    return valueToPopulate;
  }
}

module.exports = Variables;
