'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const chalk = require('chalk');
const PluginInstall = require('./../install/install');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const { expect } = require('chai');
const { getTmpDirPath } = require('../../../../tests/utils/fs');

chai.use(require('chai-as-promised'));

describe('PluginUtils', () => {
  let pluginUtils;
  let serverless;
  let consoleLogStub;
  const plugins = [
    {
      name: 'serverless-plugin-1',
      description: 'Serverless Plugin 1',
      githubUrl: 'https://github.com/serverless/serverless-plugin-1',
    },
    {
      name: 'serverless-plugin-2',
      description: 'Serverless Plugin 2',
      githubUrl: 'https://github.com/serverless/serverless-plugin-2',
    },
    {
      name: 'serverless-existing-plugin',
      description: 'Serverless Existing plugin',
      githubUrl: 'https://github.com/serverless/serverless-existing-plugin',
    },
  ];

  beforeEach(() => {
    serverless = new Serverless();
    serverless.cli = new CLI(serverless);
    const options = {};
    pluginUtils = new PluginInstall(serverless, options);
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns();
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
  });

  describe('#validate()', () => {
    it('should throw an error if the the cwd is not a Serverless service', () => {
      pluginUtils.serverless.config.servicePath = false;

      expect(() => {
        pluginUtils.validate();
      }).to.throw(Error);
    });

    it('should resolve if the cwd is a Serverless service', done => {
      pluginUtils.serverless.config.servicePath = true;

      pluginUtils.validate().then(() => done());
    });
  });

  describe('#getServerlessFilePath()', () => {
    let servicePath;

    beforeEach(() => {
      servicePath = getTmpDirPath();
      pluginUtils.serverless.config.servicePath = servicePath;
    });

    it('should return the correct serverless file path for a .yml file', () => {
      const serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      fse.ensureFileSync(serverlessYmlFilePath);

      return expect(pluginUtils.getServerlessFilePath()).to.be.fulfilled.then(
        serverlessFilePath => {
          expect(serverlessFilePath).to.equal(serverlessYmlFilePath);
        }
      );
    });

    it('should return the correct serverless file path for a .yaml file', () => {
      const serverlessYamlFilePath = path.join(servicePath, 'serverless.yaml');
      fse.ensureFileSync(serverlessYamlFilePath);

      return expect(pluginUtils.getServerlessFilePath()).to.be.fulfilled.then(
        serverlessFilePath => {
          expect(serverlessFilePath).to.equal(serverlessYamlFilePath);
        }
      );
    });

    it('should return the correct serverless file path for a .json file', () => {
      const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');
      fse.ensureFileSync(serverlessJsonFilePath);

      return expect(pluginUtils.getServerlessFilePath()).to.be.fulfilled.then(
        serverlessFilePath => {
          expect(serverlessFilePath).to.equal(serverlessJsonFilePath);
        }
      );
    });

    it('should return the correct serverless file path for a .js file', () => {
      const serverlessJsFilePath = path.join(servicePath, 'serverless.js');
      fse.ensureFileSync(serverlessJsFilePath);

      return expect(pluginUtils.getServerlessFilePath()).to.be.fulfilled.then(
        serverlessFilePath => {
          expect(serverlessFilePath).to.equal(serverlessJsFilePath);
        }
      );
    });

    it('should reject if no configuration file exists', () =>
      expect(pluginUtils.getServerlessFilePath()).to.be.rejectedWith(
        'Could not find any serverless service definition file.'
      ));
  });

  describe('#getPlugins()', () => {
    let fetchStub;
    let pluginWithFetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub().returns(
        BbPromise.resolve({
          json: sinon.stub().returns(BbPromise.resolve(plugins)),
        })
      );
      pluginWithFetchStub = proxyquire('./utils.js', {
        'node-fetch': fetchStub,
      });
    });

    it('should fetch and return the plugins from the plugins repository', () => {
      const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

      return pluginWithFetchStub.getPlugins().then(result => {
        expect(fetchStub.calledOnce).to.equal(true);
        expect(fetchStub.args[0][0]).to.equal(endpoint);
        expect(result).to.deep.equal(plugins);
      });
    });
  });

  describe('#getPluginInfo()', () => {
    it('should return the plugins name', () => {
      expect(pluginUtils.getPluginInfo('some-plugin')).to.deep.equal(['some-plugin']);
    });

    it('should return the plugins name and version', () => {
      expect(pluginUtils.getPluginInfo('some-plugin@0.1.0')).to.deep.equal([
        'some-plugin',
        '0.1.0',
      ]);
    });

    it('should support scoped names', () => {
      expect(pluginUtils.getPluginInfo('@acme/some-plugin')).to.deep.equal(['@acme/some-plugin']);
    });
  });

  describe('#display()', () => {
    it('should display the plugins if present', () => {
      let expectedMessage = '';
      expectedMessage += `${chalk.yellow.underline('serverless-existing-plugin')}`;
      expectedMessage += ' - Serverless Existing plugin\n';
      expectedMessage += `${chalk.yellow.underline('serverless-plugin-1')}`;
      expectedMessage += ' - Serverless Plugin 1\n';
      expectedMessage += `${chalk.yellow.underline('serverless-plugin-2')}`;
      expectedMessage += ' - Serverless Plugin 2\n';
      expectedMessage = expectedMessage.slice(0, -2);
      return expect(pluginUtils.display(plugins)).to.be.fulfilled.then(message => {
        expect(consoleLogStub.calledTwice).to.equal(true);
        expect(message).to.equal(expectedMessage);
      });
    });

    it('should print a message when no plugins are available to display', () => {
      const expectedMessage = 'There are no plugins available to display';

      return pluginUtils.display([]).then(message => {
        expect(consoleLogStub.calledOnce).to.equal(true);
        expect(message).to.equal(expectedMessage);
      });
    });
  });
});
