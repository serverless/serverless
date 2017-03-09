'use strict';

class Package {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;


    this.commands = {
      package: {
        usage: 'Packages a Serverless service',
        lifecycleEvents: [
          'cleanup',
          'createDeploymentArtifacts',
          'initialize',
          'compileFunctions',
          'compileEvents',
          'finalize',
        ],
        options: {
          stage: {
            usage: 'Stage of the service',
            shortcut: 's',
          },
          region: {
            usage: 'Region of the service',
            shortcut: 'r',
          },
          package: {
            usage: 'Output path for the package',
            shortcut: 'p',
          },
        },
      },
    };
  }
}

module.exports = Package;
