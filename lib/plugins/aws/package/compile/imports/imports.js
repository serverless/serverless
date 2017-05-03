'use strict';

const traverse = require('traverse');

class AwsCompileImports {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.compileImports = this.compileImports.bind(this);

    this.hooks = {
      'package:compileImports': this.compileImports,
    };
  }

  compileImports() {
    const that = this; // save this because of the upcoming scope switch
    traverse(this.serverless.service).forEach(function (propertyParam) {
      if (typeof propertyParam === 'string' && propertyParam.match(/imports:.+/)) {
        const removedPrefix = propertyParam.split(':')[1];
        const parts = removedPrefix.split('.');
        const stack = parts[0];
        const value = parts[1];

        const newImportValue = that.cfImportValueTemplate();
        newImportValue['Fn::ImportValue'] = `${stack}-${value}`;

        this.update(newImportValue);
      }
    });
  }

  cfImportValueTemplate() {
    return {
      'Fn::ImportValue': 'Value',
    };
  }
}

module.exports = AwsCompileImports;
