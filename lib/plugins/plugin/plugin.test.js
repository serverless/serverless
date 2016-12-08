'use strict';

const expect = require('chai').expect;
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

    it('should run promise chain in order for "plugin:uninstall:uninstall" hook', () => {
      const uninstallStub = sinon
        .stub(plugin, 'uninstall').returns(BbPromise.resolve());

      return plugin.hooks['plugin:uninstall:uninstall']().then(() => {
        expect(uninstallStub.calledOnce).to.equal(true);

        plugin.uninstall.restore();
      });
    });

    it('should run promise chain in order for "plugin:list:list" hook', () => {
      const listStub = sinon
        .stub(plugin, 'list').returns(BbPromise.resolve());

      return plugin.hooks['plugin:list:list']().then(() => {
        expect(listStub.calledOnce).to.equal(true);

        plugin.list.restore();
      });
    });

    it('should run promise chain in order for "plugin:search:search" hook', () => {
      const searchStub = sinon
        .stub(plugin, 'search').returns(BbPromise.resolve());

      return plugin.hooks['plugin:search:search']().then(() => {
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

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      packageJsonFilePath = path.join(servicePath, 'package.json');
      plugin.serverless.config.servicePath = servicePath;
      validateStub = sinon
        .stub(plugin, 'validate')
        .returns(BbPromise.resolve());
      getPluginsStub = sinon
        .stub(plugin, 'getPlugins')
        .returns(BbPromise.resolve(plugins));
      npmInstallStub = sinon
        .stub(childProcess, 'execSync')
        .withArgs(`npm install --prefix ${servicePath} --save-dev serverless-plugin-1`)
        .returns();
    });

    afterEach(() => {
      plugin.validate.restore();
      plugin.getPlugins.restore();
      childProcess.execSync.restore();
    });

    it('should not install the plugin if it can not be found in the registry', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      plugin.options.name = 'some-not-available-plugin'; // this plugin is not in the plugins mock

      return plugin.install().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.called).to.equal(false);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins).to.equal(undefined);
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

      return plugin.install().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
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

      return plugin.install().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(fs.existsSync(packageJsonFilePath)).to.equal(true);
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

      return plugin.install().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins[0]).to.equal('serverless-plugin-1');
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

      return plugin.install().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins.length).to.equal(2);
        expect(serverlessFileContent.plugins).to.include('serverless-existing-plugin');
        expect(serverlessFileContent.plugins).to.include('serverless-plugin-1');
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

      return plugin.install().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          `npm install --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins.length).to.equal(1);
        expect(serverlessFileContent.plugins).to.include('serverless-plugin-1');
      });
    });
  });

  describe('#uninstall()', () => {
    let servicePath;
    let serverlessYmlFilePath;
    let packageJsonFilePath;
    let validateStub;
    let npmUninstallStub;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      packageJsonFilePath = path.join(servicePath, 'package.json');
      plugin.serverless.config.servicePath = servicePath;
      validateStub = sinon
        .stub(plugin, 'validate').returns(BbPromise.resolve());
      npmUninstallStub = sinon
        .stub(childProcess, 'execSync')
        .withArgs(`npm uninstall --prefix ${servicePath} --save-dev serverless-plugin-1`)
        .returns();
    });

    afterEach(() => {
      plugin.validate.restore();
      childProcess.execSync.restore();
    });

    it('should log a message if a problem during uninstallation happens', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
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

      return plugin.uninstall().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --prefix ${servicePath} --save-dev ${plugin.options.name}`,
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

      return plugin.uninstall().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins.length).to.equal(1);
        expect(serverlessFileContent.plugins).to.not.contain('serverless-plugin-1');
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

      return plugin.uninstall().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins.length).to.equal(0);
        expect(serverlessFileContent.plugins).to.not.contain('serverless-plugin-1');
      });
    });

    it('should do nothing if plugins array is not present in service file', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        // no plugins array
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      // package.json file
      const packageJsonFileContent = {
        devDependencies: {}, // plugin was removed via npm
      };
      fse.writeJsonSync(packageJsonFilePath, packageJsonFileContent);

      plugin.options.name = 'serverless-plugin-1';

      return plugin.uninstall().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --prefix ${servicePath} --save-dev ${plugin.options.name}`,
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);

        // inspect the serverless.yml file
        const serverlessFileContent = YAML.load(fs.readFileSync(serverlessYmlFilePath).toString());
        expect(serverlessFileContent.plugins).to.equal(undefined);
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

      return plugin.search().then(() => {
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

  describe('#display()', () => {
    it('should display the plugins if present', () => {
      let expectedMessage = '';
      expectedMessage += `${chalk.yellow.underline('serverless-plugin-1')}\n`;
      expectedMessage += 'Serverless Plugin 1\n\n';
      expectedMessage += `${chalk.yellow.underline('serverless-plugin-2')}\n`;
      expectedMessage += 'Serverless Plugin 2\n\n';
      expectedMessage = expectedMessage.slice(0, -2);

      return plugin.display(plugins).then((message) => {
        expect(consoleLogStub.calledOnce).to.equal(true);
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
});
