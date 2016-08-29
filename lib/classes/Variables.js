'use strict';

const _ = require('lodash');
const path = require('path');
const traverse = require('traverse');
const replaceall = require('replaceall');

class Variables {

  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service; // ${file(.)}

    this.variableSyntax = RegExp(this.service.defaults.variableSyntax, 'g');
    this.overwriteSyntax = RegExp(/,/g);
    this.fileRefSyntax = RegExp(/^file\(([a-zA-Z0-9._\-\/]+?)\)/g);
    this.envRefSyntax = RegExp(/^env:./g);
    this.optRefSyntax = RegExp(/^opt:./g);
    this.selfRefSyntax = RegExp(/^self:./g);
  }

  populateService(processedOptions) { // ${self.provider.test, self.custom.numb}
    const that = this;
    this.options = processedOptions || {};
    const variableSyntaxProperty = this.service.defaults.variableSyntax;

    // temporally remove variable syntax from service otherwise it'll match
    this.service.defaults.variableSyntax = true;

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

    this.service.defaults.variableSyntax = variableSyntaxProperty;
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
        const errorMessage = [
          'Trying to populate non string value into',
          ` a string for variable ${matchedString}.`,
          ' Please make sure the value of the property is a string.',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }
      property = valueToPopulate;
    }
    return property;
  }

  overwrite(variableStringsString) {
    const variableStringsArray = variableStringsString.split(',');
    const variablesValues = variableStringsArray
      .map(variableString => this.getValueFromSource(variableString));

    // find the first defined variable value
    const finalValue = variablesValues
      .find(value => (typeof value !== 'undefined' && value !== null));

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
    const selfSubProperties = variableString.split(':')[1].split('.');
    selfSubProperties.forEach(selfSubProperty => {
      valueToPopulate = valueToPopulate[selfSubProperty];
    });

    return valueToPopulate;
  }

  getValueFromFile(variableString) {
    const matchedFileRefString = variableString.match(this.fileRefSyntax)[0];
    const referencedFileRelativePath = matchedFileRefString
      .replace(this.fileRefSyntax, (match, varName) => varName.trim());
    const referencedFileFullPath = path.join(this.serverless.config.servicePath,
      referencedFileRelativePath);

    let valueToPopulate = this.serverless.utils.readFileSync(referencedFileFullPath);
    if (matchedFileRefString !== variableString) {
      let deepProperties = variableString
        .replace(matchedFileRefString, '');
      if (deepProperties.substring(0, 1) !== ':') {
        const errorMessage = [
          'Invalid variable syntax when referencing',
          ` file "${referencedFileRelativePath}" sub properties`,
          ' Please use ":" or "." to reference sub properties.',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }
      deepProperties = deepProperties.slice(1);
      const selfSubProperties = deepProperties.split('.');
      selfSubProperties.forEach(selfSubProperty => {
        valueToPopulate = valueToPopulate[selfSubProperty];
      });
    }

    return valueToPopulate;
  }
}

module.exports = Variables;

