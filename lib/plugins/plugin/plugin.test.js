'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const YAML = require('js-yaml');
const path = require('path');
const childProcess = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const chalk = require('chalk');
const Plugin = require('./plugin');
const Serverless = require('../../Serverless');
const CLI = require('../../classes/CLI');
const testUtils = require('../../../tests/utils');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('Plugin', () => {
  let plugin;
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
    plugin = new Plugin(serverless, options);
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns();
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
  });

  describe('#constructor()', () => {
    it('should have the command "plugin"', () => {
      expect(plugin.commands.plugin).to.not.equal(undefined);
    });

    it('should have the sub-command "install"', () => {
      expect(plugin.commands.plugin.commands.install).to.not.equal(undefined);
    });

    it('should have the sub-command "uninstall"', () => {
      expect(plugin.commands.plugin.commands.uninstall).to.not.equal(undefined);
    });

    it('should have the sub-command "list"', () => {
      expect(plugin.commands.plugin.commands.list).to.not.equal(undefined);
    });

    it('should have the sub-command "search"', () => {
      expect(plugin.commands.plugin.commands.search).to.not.equal(undefined);
    });

    it('should have the lifecycle event "install" for the "install" sub-command', () => {
      expect(plugin.commands.plugin.commands.install.lifecycleEvents).to.deep.equal([
        'install',
      ]);
    });

    it('should have the lifecycle event "uninstall" for the "uninstall" sub-command', () => {
      expect(plugin.commands.plugin.commands.uninstall.lifecycleEvents).to.deep.equal([
        'uninstall',
      ]);
    });

    it('should have the lifecycle event "list" for the "list" sub-command', () => {
      expect(plugin.commands.plugin.commands.list.lifecycleEvents).to.deep.equal([
        'list',
      ]);
    });

    it('should have the lifecycle event "search" for the "search" sub-command', () => {
      expect(plugin.commands.plugin.commands.search.lifecycleEvents).to.deep.equal([
        'search',
      ]);
    });

    it('should have a required option "name" for the "install" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(plugin.commands.plugin.commands.install.options.name.required).to.be.true;
    });

    it('should have a required option "name" for the "uninstall" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(plugin.commands.plugin.commands.uninstall.options.name.required).to.be.true;
    });

    it('should have no option for the "list" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(plugin.commands.plugin.commands.list.options).to.equal(undefined);
    });

    it('should have a required option "query" for the "search" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(plugin.commands.plugin.commands.search.options.query.required).to.be.true;
    });

    it('should have a "plugin:install:install" hook', () => {
      expect(plugin.hooks['plugin:install:install']).to.not.equal(undefined);
    });

    it('should have a "plugin:uninstall:uninstall" hook', () => {
      expect(plugin.hooks['plugin:uninstall:uninstall']).to.not.equal(undefined);
    });

    it('should have a "plugin:list:list" hook', () => {
      expect(plugin.hooks['plugin:list:list']).to.not.equal(undefined);
    });

    it('should have a "plugin:search:search" hook', () => {
      expect(plugin.hooks['plugin:search:search']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "plugin:install:install" hook', () => {
      const installStub = sinon
        .stub(plugin, 'install').returns(BbPromise.resolve());

      return plugin.hooks['plugin:install:install']().then(() => {
        expect(installStub.calledOnce).to.equal(true);

        plugin.install.restore();
      });
    });

    it('should run promise chain in order for install:plugin:plugin" hook', () => {
      const installStub = sinon
        .stub(plugin, 'install').returns(BbPromise.resolve());

      return plugin.hooks['install:plugin:plugin']().then(() => {
        expect(installStub.calledOnce).to.equal(true);

        plugin.install.restore();
      });
    });

    it('should run promise chain in order for "plugin:uninstall:uninstall" hook', () => {
      const uninstallStub = sinon
        .stub(plugin, 'uninstall').returns(BbPromise.resolve());

      return expect(plugin.hooks['plugin:uninstall:uninstall']()).to.be.fulfilled.then(() => {
        expect(uninstallStub.calledOnce).to.equal(true);

        plugin.uninstall.restore();
      });
    });

    it('should run promise chain in order for "uninstall:plugin:plugin" hook', () => {
      const uninstallStub = sinon
        .stub(plugin, 'uninstall').returns(BbPromise.resolve());

      return expect(plugin.hooks['uninstall:plugin:plugin']()).to.be.fulfilled.then(() => {
        expect(uninstallStub.calledOnce).to.equal(true);

        plugin.uninstall.restore();
      });
    });

    it('should run promise chain in order for "plugin:list:list" hook', () => {
      const listStub = sinon
        .stub(plugin, 'list').returns(BbPromise.resolve());

      return expect(plugin.hooks['plugin:list:list']()).to.be.fulfilled.then(() => {
        expect(listStub.calledOnce).to.equal(true);

        plugin.list.restore();
      });
    });

    it('should run promise chain in order for "plugin:search:search" hook', () => {
      const searchStub = sinon
        .stub(plugin, 'search').returns(BbPromise.resolve());

      return expect(plugin.hooks['plugin:search:search']()).to.be.fulfilled.then(() => {
        expect(searchStub.calledOnce).to.equal(true);

        plugin.search.restore();
      });
    });
  });

  describe('#install()', () => {
    let servicePath;
    let serverlessYmlFilePath;
    let packageJsonFilePath;
    let validateStub;
    let getPluginsStub;
    let npmInstallStub;
    let savedCwd;
    let addPluginToServerlessFileStub;
    let installPeerDependenciesStub;
    let jsonParseStub;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      packageJsonFilePath = path.join(servicePath, 'package.json');
      validateStub = sinon
        .stub(plugin, 'validate')
        .returns(BbPromise.resolve());
      addPluginToServerlessFileStub = sinon
        .stub(plugin, 'addPluginToServerlessFile')
        .returns();
      installPeerDependenciesStub = sinon
        .stub(plugin, 'installPeerDependencies')
        .returns();
      getPluginsStub = sinon
        .stub(plugin, 'getPlugins')
        .returns(BbPromise.resolve(plugins));
      npmInstallStub = sinon
        .stub(childProcess, 'execSync')
        .returns();
      jsonParseStub = sinon
        .stub(JSON, 'parse');
      // save the cwd so that we can restore it later
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      plugin.validate.restore();
      plugin.getPlugins.restore();
      plugin.addPluginToServerlessFile.restore();
      plugin.installPeerDependencies.restore();
      JSON.parse.restore();
      childProcess.execSync.restore();
      process.chdir(savedCwd);
    });

    it('should not install the plugin if it can not be found in the registry', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'serverless-not-available-plugin';

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.called).to.equal(false);
        expect(addPluginToServerlessFileStub.called).to.equal(false);
        expect(installPeerDependenciesStub.called).to.equal(false);
      });
    });

    it('should not install the plugin if it has been already installed', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['serverless-plugin-1'],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'serverless-plugin-1'; // this plugin is not in the plugins mock

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.called).to.equal(false);
        expect(addPluginToServerlessFileStub.called).to.equal(false);
        expect(installPeerDependenciesStub.called).to.equal(false);
      });
    });

    it('should install the specific version if --version option is given', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };

      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      plugin.options.name = 'serverless-plugin-1';
      plugin.options.version = '1.0.0';
      jsonParseStub.returns({ devDependencies: { 'serverless-plugin-1': true } });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@1.0.0`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(true);
        expect(installPeerDependenciesStub.called).to.equal(true);
      });
    });

    it('should log a message if a problem during installation happens', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {}, // plugin was not added successfully
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: { 'serverless-plugin-1': true } });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@latest`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(true);
        expect(installPeerDependenciesStub.called).to.equal(true);
      });
    });

    it('should generate a package.json file in the service directory if not present', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: { 'serverless-plugin-1': true } });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@latest`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(fs.existsSync(packageJsonFilePath)).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(true);
        expect(installPeerDependenciesStub.called).to.equal(true);
      });
    });

    it('should add the plugin to the service file if plugins array is not present', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        // no plugins array here
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {
          'serverless-plugin-1': '0.1.0',
        },
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: { 'serverless-plugin-1': true } });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@latest`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(true);
        expect(installPeerDependenciesStub.called).to.equal(true);
      });
    });

    it('should push the plugin to the service files plugin array if present', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['serverless-existing-plugin'], // one plugin was already added
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {
          'serverless-plugin-1': '0.1.0',
        },
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: { 'serverless-plugin-1': true } });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@latest`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(true);
        expect(installPeerDependenciesStub.called).to.equal(true);
      });
    });

    it('should push the plugin to the service files plugin array if it is empty', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [], // empty plugins array
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {
          'serverless-plugin-1': '0.1.0',
        },
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: { 'serverless-plugin-1': true } });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@latest`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(true);
        expect(installPeerDependenciesStub.called).to.equal(true);
      });
    });

    it('should log error message if install the plugin fail', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [], // empty plugins array
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {
          'serverless-plugin-1': '0.1.0',
        },
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: {} });

      return expect(plugin.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --save-dev ${plugin.options.name}@latest`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(addPluginToServerlessFileStub.called).to.equal(false);
        expect(installPeerDependenciesStub.called).to.equal(false);
      });
    });
  });

  describe('#uninstall()', () => {
    let servicePath;
    let serverlessYmlFilePath;
    let packageJsonFilePath;
    let validateStub;
    let getPluginsStub;
    let npmUninstallStub;
    let savedCwd;
    let removePluginFromServerlessFileStub;
    let uninstallPeerDependenciesStub;
    let jsonParseStub;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      packageJsonFilePath = path.join(servicePath, 'package.json');

      validateStub = sinon
        .stub(plugin, 'validate').returns(BbPromise.resolve());
      getPluginsStub = sinon
        .stub(plugin, 'getPlugins')
        .returns(BbPromise.resolve(plugins));
      npmUninstallStub = sinon
        .stub(childProcess, 'execSync')
        .withArgs('npm uninstall --save-dev serverless-plugin-1')
        .returns();
      removePluginFromServerlessFileStub = sinon
        .stub(plugin, 'removePluginFromServerlessFile')
        .returns(BbPromise.resolve());
      uninstallPeerDependenciesStub = sinon
        .stub(plugin, 'uninstallPeerDependencies')
        .returns();
      jsonParseStub = sinon
        .stub(JSON, 'parse')
        .returns({ devDependencies: {} });
      // save the cwd so that we can restore it later
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      plugin.validate.restore();
      plugin.getPlugins.restore();
      plugin.removePluginFromServerlessFile.restore();
      plugin.uninstallPeerDependencies.restore();
      childProcess.execSync.restore();
      JSON.parse.restore();
      process.chdir(savedCwd);
    });

    it('should not uninstall the plugin if it can not be found in the registry', () => {
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'some-not-available-plugin';

      return expect(plugin.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(false);
        expect(jsonParseStub.calledOnce).to.equal(false);
        expect(npmUninstallStub.called).to.equal(false);
        expect(removePluginFromServerlessFileStub.called).to.equal(false);
      });
    });

    it('should not uninstall the plugin if it has been already uninstalled', () => {
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'serverless-plugin-1';

      return expect(plugin.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(false);
        expect(jsonParseStub.calledOnce).to.equal(false);
        expect(npmUninstallStub.called).to.equal(false);
        expect(removePluginFromServerlessFileStub.called).to.equal(false);
      });
    });

    it('should log a message if a problem during uninstallation happens', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['serverless-plugin-1'],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {
          'serverless-plugin-1': '0.1.0', // plugin is still available
        },
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';

      return expect(plugin.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(jsonParseStub.calledOnce).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(true);
        expect(removePluginFromServerlessFileStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
      });
    });

    it('should only remove the given plugin from the service', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-plugin-1', // only this should be removed
          'serverless-existing-plugin',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {}, // plugin was removed via npm
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';

      return expect(plugin.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(true);
        expect(jsonParseStub.calledOnce).to.equal(true);
        expect(removePluginFromServerlessFileStub.calledOnce).to.equal(true);
      });
    });

    it('should remove the plugin from the service if it is the only one', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['serverless-plugin-1'], // plugin is available
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {}, // plugin was removed via npm
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);
      plugin.options.name = 'serverless-plugin-1';

      return expect(plugin.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(true);
        expect(jsonParseStub.calledOnce).to.equal(true);
        expect(removePluginFromServerlessFileStub.calledOnce).to.equal(true);
      });
    });

    it('should log error message if uninstall the plugin fail', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['serverless-plugin-1'],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {
          'serverless-plugin-1': '0.1.0',
        },
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';
      jsonParseStub.returns({ devDependencies: {
        'serverless-plugin-1': '0.1.0',
      } });

      return expect(plugin.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(true);
        expect(removePluginFromServerlessFileStub.calledOnce).to.equal(false);
      });
    });
  });

  describe('#list()', () => {
    let getPluginsStub;
    let displayStub;

    beforeEach(() => {
      getPluginsStub = sinon
        .stub(plugin, 'getPlugins').returns(BbPromise.resolve());
      displayStub = sinon
        .stub(plugin, 'display').returns(BbPromise.resolve());
    });

    afterEach(() => {
      plugin.getPlugins.restore();
      plugin.display.restore();
    });

    it('should print a list with all available plugins', () =>
      plugin.list().then(() => {
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(displayStub.calledOnce).to.equal(true);
      })
    );
  });

  describe('#search()', () => {
    let getPluginsStub;
    let displayStub;

    beforeEach(() => {
      getPluginsStub = sinon.stub(plugin, 'getPlugins').returns(BbPromise.resolve(plugins));
      displayStub = sinon.stub(plugin, 'display').returns(BbPromise.resolve());
    });

    afterEach(() => {
      plugin.getPlugins.restore();
      plugin.display.restore();
    });

    it('should return a list of plugins based on the search query', () => {
      plugin.options.query = 'serverless-plugin-1';

      return expect(plugin.search()).to.be.fulfilled.then(() => {
        expect(consoleLogStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(displayStub.calledOnce).to.equal(true);
      });
    });
  });

  describe('#validate()', () => {
    it('should throw an error if the the cwd is not a Serverless service', () => {
      plugin.serverless.config.servicePath = false;

      expect(() => { plugin.validate(); }).to.throw(Error);
    });

    it('should resolve if the cwd is a Serverless service', (done) => {
      plugin.serverless.config.servicePath = true;

      plugin.validate().then(() => done());
    });
  });

  describe('#getServerlessFilePath()', () => {
    let servicePath;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
    });

    it('should return the correct serverless file path for a .yml file', () => {
      const serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      fse.ensureFileSync(serverlessYmlFilePath);

      const serverlessFilePath = plugin.getServerlessFilePath();

      expect(serverlessFilePath).to.equal(serverlessYmlFilePath);
    });

    it('should return the correct serverless file path for a .yaml file', () => {
      const serverlessYamlFilePath = path.join(servicePath, 'serverless.yaml');
      fse.ensureFileSync(serverlessYamlFilePath);

      const serverlessFilePath = plugin.getServerlessFilePath();

      expect(serverlessFilePath).to.equal(serverlessYamlFilePath);
    });

    it('should return the correct serverless file path for a .json file', () => {
      const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');
      fse.ensureFileSync(serverlessJsonFilePath);

      const serverlessFilePath = plugin.getServerlessFilePath();

      expect(serverlessFilePath).to.equal(serverlessJsonFilePath);
    });
  });

  describe('#getPlugins()', () => {
    let fetchStub;
    let PluginWithFetchStub;
    let pluginWithFetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub().returns(
        BbPromise.resolve({
          json: sinon.stub().returns(BbPromise.resolve(plugins)),
        })
      );
      PluginWithFetchStub = proxyquire('./plugin.js', {
        'node-fetch': fetchStub,
      });
      pluginWithFetchStub = new PluginWithFetchStub(serverless);
    });

    it('should fetch and return the plugins from the plugins repository', () => {
      const endpoint = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';

      return pluginWithFetchStub.getPlugins().then((result) => {
        expect(fetchStub.calledOnce).to.equal(true);
        expect(fetchStub.args[0][0]).to.equal(endpoint);
        expect(result).to.deep.equal(plugins);
      });
    });
  });

  describe('#addPluginToServerlessFile()', () => {
    let servicePath;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
    });

    it('should add the pluginName to serverless file path for a .yml file', () => {
      const serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-plugin-1',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      plugin.options.name = 'serverless-plugin-2';
      plugin.addPluginToServerlessFile();
      expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8').plugins)
        .to.include.members(['serverless-plugin-2']);
    });

    it('should add the pluginName to serverless file path for a .json file', () => {
      const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');
      const serverlessJson = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessJsonFilePath, serverlessJson);
      plugin.options.name = 'serverless-plugin-1';
      plugin.addPluginToServerlessFile();
      expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
        .to.include.members(['serverless-plugin-1']);
      plugin.options.name = 'serverless-plugin-2';
      plugin.addPluginToServerlessFile();
      expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
        .to.include.members(['serverless-plugin-1']);
      expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
        .to.include.members(['serverless-plugin-2']);
    });
  });

  describe('#removePluginFromServerlessFile()', () => {
    let servicePath;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
    });

    it('should remove the pluginName to serverless file path for a .yml file', () => {
      const serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-plugin-1',
          'serverless-plugin-2',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      plugin.removePluginFromServerlessFile('serverless-plugin-2');
      expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8').plugins)
        .to.include.members(['serverless-plugin-1']);
      expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8').plugins)
        .to.not.have.members(['serverless-plugin-2']);
    });

    it('should remove the pluginName to serverless file path for a .json file', () => {
      const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');
      const serverlessJson = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-plugin-1',
          'serverless-plugin-2',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessJsonFilePath, serverlessJson);
      plugin.options.name = 'serverless-plugin-1';
      plugin.removePluginFromServerlessFile();
      expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
        .to.include.members(['serverless-plugin-2']);
      expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
        .to.not.have.members(['serverless-plugin-1']);
      plugin.options.name = 'serverless-plugin-2';
      plugin.removePluginFromServerlessFile();
      expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8'))
        .to.not.have.property('plugins');
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
      return expect(plugin.display(plugins)).to.be.fulfilled.then((message) => {
        expect(consoleLogStub.calledTwice).to.equal(true);
        expect(message).to.equal(expectedMessage);
      });
    });

    it('should print a message when no plugins are available to display', () => {
      const expectedMessage = 'There are no plugins available to display';

      return plugin.display([]).then((message) => {
        expect(consoleLogStub.calledOnce).to.equal(true);
        expect(message).to.equal(expectedMessage);
      });
    });
  });

  describe('#installPeerDependencies()', () => {
    let servicePath;
    let servicePackageJsonFilePath;
    let pluginPath;
    let pluginPackageJsonFilePath;
    let pluginName;
    let npmInstallStub;
    let savedCwd;

    beforeEach(() => {
      pluginName = 'some-plugin';
      plugin.options.name = pluginName;
      servicePath = testUtils.getTmpDirPath();
      fse.ensureDirSync(servicePath);
      plugin.serverless.config.servicePath = servicePath;
      servicePackageJsonFilePath = path.join(servicePath, 'package.json');
      fse.writeJsonSync(servicePackageJsonFilePath, {
        devDependencies: {},
      });
      pluginPath = path.join(
        servicePath, 'node_modules', pluginName);
      fse.ensureDirSync(pluginPath);
      pluginPackageJsonFilePath = path.join(pluginPath, 'package.json');
      npmInstallStub = sinon
        .stub(childProcess, 'execSync')
        .returns();
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      childProcess.execSync.restore();
      process.chdir(savedCwd);
    });

    it('should install peerDependencies if an installed plugin has ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {
        peerDependencies: {
          'some-package': '*',
        },
      });
      plugin.installPeerDependencies();
      expect(fse.readJsonSync(servicePackageJsonFilePath))
        .to.be.deep.equal({ devDependencies: { 'some-package': '*' } });
      expect(npmInstallStub.calledWithExactly(
        'npm install',
        { stdio: 'ignore' }
      )).to.equal(true);
    });

    it('should not install peerDependencies if an installed plugin does not have ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {});
      plugin.installPeerDependencies();
      expect(fse.readJsonSync(servicePackageJsonFilePath))
        .to.be.deep.equal({ devDependencies: {} });
      expect(npmInstallStub.calledWithExactly(
        'npm install',
        { stdio: 'ignore' }
      )).to.equal(false);
    });
  });

  describe('#uninstallPeerDependencies()', () => {
    let servicePath;
    let pluginPath;
    let pluginPackageJsonFilePath;
    let pluginName;
    let npmUninstallStub;
    let savedCwd;

    beforeEach(() => {
      pluginName = 'some-plugin';
      plugin.options.name = pluginName;
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
      pluginPath = path.join(
        servicePath, 'node_modules', pluginName);
      fse.ensureDirSync(pluginPath);
      pluginPackageJsonFilePath = path.join(pluginPath, 'package.json');
      npmUninstallStub = sinon
        .stub(childProcess, 'execSync')
        .returns();
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      childProcess.execSync.restore();
      process.chdir(savedCwd);
    });

    it('should uninstall peerDependencies if an installed plugin has ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {
        peerDependencies: {
          'some-plugin': '*',
        },
      });
      plugin.uninstallPeerDependencies();
      expect(npmUninstallStub.calledWithExactly(
        `npm uninstall --save-dev ${pluginName}`,
        { stdio: 'ignore' }
      )).to.equal(true);
    });

    it('should not uninstall peerDependencies if an installed plugin does not have ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {});
      plugin.uninstallPeerDependencies();
      expect(npmUninstallStub.calledWithExactly(
        `npm uninstall --save-dev ${pluginName}`,
        { stdio: 'ignore' }
      )).to.equal(false);
    });
  });

  describe('#checkPluginExists()', () => {
    let servicePath;
    let serverlessYmlFilePath;
    let serverlessJSONFilePath;
    let savedCwd;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      plugin.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      serverlessJSONFilePath = path.join(servicePath, 'serverless.json');
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      process.chdir(savedCwd);
    });

    it('should return true if the plugin is found in serverless.yml', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['some-plugin'],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'some-plugin';

      return expect(plugin.checkPluginExists()).to.be.equal(true);
    });

    it('should return true if the plugin is found in serverless.json', () => {
      const serverlessJson = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['some-plugin'],
      };
      serverless.utils
        .writeFileSync(serverlessJSONFilePath, serverlessJson);

      plugin.options.name = 'some-plugin';

      return expect(plugin.checkPluginExists()).to.be.equal(true);
    });

    it('should return false if the plugin is not found in both of them', () => {
      const serverlessObject = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: ['some-plugin'],
      };
      serverless.utils
        .writeFileSync(serverlessJSONFilePath, serverlessObject);
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessObject));

      plugin.options.name = 'some-plugin-1';

      return expect(plugin.checkPluginExists()).to.be.equal(false);
    });
  });
});
