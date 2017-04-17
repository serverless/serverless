'use strict';

const _ = require('lodash');

class AwsCompileExports {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.compileExports = this.compileExports.bind(this);

    this.hooks = {
      'package:compileExports': this.compileExports,
    };
  }

  compileExports() {
    const exports = this.serverless.service.exports;
    _.forEach(exports, (value, key) => {
      const stackName = this.provider.naming.getStackName();
      const exportOutputLogicalId = this.provider.naming.getExportOutputLogicalId(key);
      const newExportOutput = this.cfOutputExportTemplate();

      newExportOutput.Description = `Exported ${key}`;
      newExportOutput.Value = value;
      newExportOutput.Export.Name = `${stackName}-${key}`;

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Outputs, {
        [exportOutputLogicalId]: newExportOutput,
      });
    });
  }

  cfOutputExportTemplate() {
    return {
      Description: 'Exported value',
      Value: 'Value',
      Export: {
        Name: 'Name',
      },
    };
  }
}

module.exports = AwsCompileExports;
