'use strict';

const { expect } = require('chai');
const resolveFinal = require('../../../../../lib/cli/commands-schema/resolve-final');

describe('test/unit/lib/cli/commands-schema/resolve-final.test.js', () => {
  describe('Non-AWS provider', () => {
    let commands;
    before(() => {
      commands = resolveFinal(
        new Set([
          {
            commands: {
              deploy: {
                commands: {
                  list: {
                    usage: 'List deployments',
                    lifecycleEvents: ['list'],
                    options: {
                      resourceGroup: {
                        usage: 'Resource group for the service',
                        shortcut: 'g',
                        type: 'string',
                      },
                    },
                  },
                  apim: {
                    usage: 'Deploys APIM',
                    lifecycleEvents: ['apim'],
                  },
                },
                options: {
                  dryrun: {
                    usage: 'Get a summary for what the deployment would look like',
                    shortcut: 'd',
                    type: 'boolean',
                  },
                },
              },
            },
            hooks: {
              'deploy:deploy': () => {},
              'logs:logs': () => {},
            },
          },
        ]),
        { providerName: 'foo' }
      );
    });

    it('should expose no service commands', () =>
      expect(commands.get('create')).to.have.property('options'));
    it('should expose service commands', () =>
      expect(commands.get('package')).to.have.property('options'));
    it('should not expose not adapted AWS service commands', () =>
      expect(commands.has('metrics')).to.be.false);
    it('should expose adapted AWS service commands', () =>
      expect(commands.get('logs')).to.have.property('options'));

    it('should extend adapted and extended AWS service commands', () => {
      expect(commands.get('deploy').options).to.have.property('dryrun');
      expect(commands.get('deploy list').options).to.have.property('resourceGroup');
    });

    it('should not expose AWS specific optionson extended AWS service commands', () => {
      expect(commands.get('deploy').options).to.not.have.property('app');
      expect(commands.get('logs').options).to.not.have.property('app');
    });

    it('should support introduction of new commands', () => {
      expect(commands.get('deploy apim').usage).to.equal('Deploys APIM');
    });

    it('should expose no service options on new service commands', () =>
      expect(commands.get('deploy apim').options).to.have.property('help'));
    it('should expose service options on new service commands', () =>
      expect(commands.get('deploy apim').options).to.have.property('config'));
  });

  describe('AWS provider', () => {
    let commands;
    before(() => {
      commands = resolveFinal(
        new Set([
          {
            commands: {
              deploy: {
                commands: {
                  list: {
                    usage: 'List deployments',
                    lifecycleEvents: ['list'],
                    options: {
                      resourceGroup: {
                        usage: 'Resource group for the service',
                        shortcut: 'g',
                        type: 'string',
                      },
                    },
                  },
                  apim: {
                    usage: 'Deploys APIM',
                    lifecycleEvents: ['apim'],
                  },
                },
                options: {
                  dryrun: {
                    usage: 'Get a summary for what the deployment would look like',
                    shortcut: 'd',
                    type: 'boolean',
                  },
                },
              },
            },
            hooks: {
              'deploy:deploy': () => {},
              'logs:logs': () => {},
            },
          },
        ]),
        { providerName: 'aws' }
      );
    });

    it('should expose no service commands', () =>
      expect(commands.get('create')).to.have.property('options'));
    it('should expose service commands', () =>
      expect(commands.get('package')).to.have.property('options'));
    it('should expose all AWS service commands', () =>
      expect(commands.get('metrics')).to.have.property('options'));

    it('should extend existing commands', () => {
      expect(commands.get('deploy').options).to.have.property('dryrun');
      expect(commands.get('deploy list').options).to.have.property('resourceGroup');
    });

    it('should support introduction of new commands', () => {
      expect(commands.get('deploy apim').usage).to.equal('Deploys APIM');
    });

    it('should expose AWS specific options on newly introduced commands', () => {
      expect(commands.get('deploy apim').options).to.have.property('app');
    });

    it('should expose no service options on new service commands', () =>
      expect(commands.get('deploy apim').options).to.have.property('help'));
    it('should expose service options on new service commands', () =>
      expect(commands.get('deploy apim').options).to.have.property('config'));
  });
});
