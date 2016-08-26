'use strict';

const _ = require('lodash');
const path = require('path');
const traverse = require('traverse');
const replaceall = require('replaceall');

class Variables {

  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;
    this.variableSyntax = RegExp(this.service.defaults.variableSyntax, 'g');
    this.fileRefSyntax = RegExp(/^file\(([a-zA-Z0-9._\-\/]+?)\)/g);
  }

  populateService(processedOptions) {
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
    console.log(this.service.custom)
    return this.service;
  }

  populateProperty(propertyParam) {
    let property = propertyParam;
    if (typeof property === 'string' && property.match(this.variableSyntax)) {
      property.match(this.variableSyntax).forEach((matchedString) => {
        let variableString = matchedString
          .replace(this.variableSyntax, (match, varName) => varName.trim());

        // remove spaces
        variableString = variableString.replace(/\s/g, '');

        if (variableString.match(RegExp(/,/g))) {
          property = this.overwrite(variableString, property, matchedString);
        } else if (variableString.match(RegExp(/^opt\..*/g))) {
          property = this.fromOptions(variableString, property, matchedString);
        } else if (variableString.match(RegExp(/^self\..*/g))) {
          property = this.fromSelf(variableString, property, matchedString);
        } else if (variableString.match(this.fileRefSyntax)) {
          property = this.fromFile(variableString, property, matchedString);
        } else if (variableString.match(RegExp(/^env\..*/g))) {
          property = this.fromEnv(variableString, property, matchedString);
        } else {
          const errorMessage = [
            `Invalid variable reference syntax for variable ${matchedString}.`,
            ' You can only reference env vars, options, & files.',
            ' You can check our docs for more info.',
          ].join('');
          throw new this.serverless.classes.Error(errorMessage);
        }
      });
      return this.populateProperty(property);
    }
    return property;
  }

  fromEnv(variableString, propertyParam, matchedString) {
    let property = propertyParam;
    if (variableString.split('.').length !== 2) {
      const errorMessage = [
        'Trying to access sub properties of environment',
        ' variable strings, or trying to reference all environment variable.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
    const requestedEnvVar = variableString.split('.')[1];
    let propertyValue = process.env[requestedEnvVar];

    if (typeof propertyValue === 'undefined') propertyValue = '';

    if (property && matchedString) {
      property = replaceall(matchedString, propertyValue, property);
      return property;
    }
    return propertyValue;
  }


  fromOptions(variableString, propertyParam, matchedString) {
    let property = propertyParam;
    let propertyValue;
    if (variableString.split('.').length === 1) {
      if (property && matchedString) {
        if (property === matchedString) {
          property = this.options;
        } else {
          const errorMessage = [
            'Trying to reference all options object as a substring.',
            ' Please make sure the string referencing the variable',
            ' Does not contain any other sub-strings,',
            ' or reference a specific option string.',
          ].join('');
          throw new this.serverless.classes.Error(errorMessage);
        }
      }
    } else if (variableString.split('.').length === 2) {
      const requestedOption = variableString.split('.')[1];
      propertyValue = this.options[requestedOption];
      if (typeof propertyValue === 'undefined') propertyValue = '';
    } else {
      const errorMessage = [
        'Trying to reference a specific option sub properties.',
        ' Each passed option can only be a string, not objects.',
        ' Please make sure you only reference the option string',
        ' without any other dot notation.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    if (property && matchedString) {
      property = replaceall(matchedString, propertyValue, property);
      return property;
    }

    return propertyValue;
  }


  fromSelf(variableString, propertyParam, matchedString) {
    let property = propertyParam;
    if (variableString.split('.').length === 1) {
      const errorMessage = [
        'You can\'t reference the entire "self" serverless.yml file.',
        ' Please reference a sub property with ${self.subProp}',
      ].join('');
      throw new this.serverless.classes
        .Error(errorMessage);
    }
    let value = _.cloneDeep(this.service);
    const selfSubProperties = variableString.split('.');
    // remove first element. It's the "self" keyword
    selfSubProperties.splice(0, 1);
    selfSubProperties.forEach(selfSubProperty => {
      if (!value[selfSubProperty]) {
        const errorMessage = [
          `serverless.yml doesn't have sub property "${selfSubProperty}".`,
          ' Please make sure you are referencing the correct sub property',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }
      value = value[selfSubProperty];
    });

    if (property && matchedString) {
      if (typeof value === 'string') {
        property = replaceall(matchedString, value, property);
      } else {
        if (property !== matchedString) {
          const errorMessage = [
            'Trying to populate non string value into',
            ' a string when referencing "self".',
            ' Please make sure the value of the property',
            '  is a string',
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }
        property = value;
      }
      return property;
    }

    return value;
  }

  fromFile(variableString, propertyParam, matchedString) {
    let property = propertyParam;
    const matchedFileRefString = variableString.match(this.fileRefSyntax)[0];
    const referencedFileRelativePath = matchedFileRefString
      .replace(this.fileRefSyntax, (match, varName) => varName.trim());
    const referencedFileFullPath = path.join(this.serverless.config.servicePath,
      referencedFileRelativePath);

    let value = this.serverless.utils.readFileSync(referencedFileFullPath);
    if (matchedFileRefString !== variableString) {
      let deepProperties = variableString
        .replace(matchedFileRefString, '');
      if (deepProperties.substring(0, 1) !== '.') {
        const errorMessage = [
          'Invalid variable syntax when referencing',
          ` file "${referencedFileRelativePath}"`,
          ' Please use valid dot notation when referencing sub properties.',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }
      deepProperties = deepProperties.slice(1);
      const selfSubProperties = deepProperties.split('.');
      selfSubProperties.forEach(selfSubProperty => {
        if (!value[selfSubProperty]) {
          const errorMessage = [
            `file "${referencedFileRelativePath}" doesn't`,
            ` have sub property "${selfSubProperty}".`,
            ' Please make sure you are referencing the correct sub property',
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }
        value = value[selfSubProperty];
      });
    }

    if (property && matchedString) {
      if (typeof value === 'string') {
        property = replaceall(matchedString, value, property);
      } else {
        if (property !== matchedString) {
          const errorMessage = [
            'Trying to populate non string value into',
            ` a string when referencing file "${referencedFileRelativePath}".`,
            ' Please make sure the value of the property',
            '  is a string',
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }
        property = value;
      }
      return property;
    }

    return value;
  }

  overwrite(overwriteVariableString, propertyParam, matchedString) {
    let property = propertyParam;
    const variableStrings = overwriteVariableString.split(',');
    const variablesValues = variableStrings.map(variableString => {
      if (variableString.match(this.fileRefSyntax)) {
        return this.fromFile(variableString);
      } else if (variableString.match(RegExp(/^env\..*/g))) {
        return this.fromEnv(variableString);
      } else if (variableString.match(RegExp(/^opt\..*/g))) {
        return this.fromOptions(variableString);
      } else if (variableString.match(RegExp(/^self\..*/g))) {
        return this.fromSelf(variableString);
      }
      const errorMessage = [
        `Invalid variable reference syntax for variable ${matchedString}.`,
        ' You can only reference env vars, options, & files.',
        ' You can check our docs for more info.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);

    });

    const finalValue = variablesValues.find(value => !!value);

    if (typeof finalValue === 'string') {
      property = replaceall(matchedString, finalValue, property);
    } else {
      if (property !== matchedString) {
        const errorMessage = [
          'Trying to populate non string value into',
          ` a string when overwriting with "${matchedString}".`,
          ' Please make sure the value of the property',
          '  is a string',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }
      property = finalValue;
    }

    return property;
  }
}

module.exports = Variables;

