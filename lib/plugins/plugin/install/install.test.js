'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const YAML = require('js-yaml');
const path = require('path');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fs = require('fs');
const fse = require('fs-extra');
const PluginInstall = require('./install');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const testUtils = require('../../../../tests/utils');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('PluginInstall', () => {
  let pluginInstall;
  let serverless;
  let consoleLogStub;
  let serverlessErrorStub;

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
    pluginInstall = new PluginInstall(serverless, options);
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns();
    serverlessErrorStub = sinon.stub(serverless.classes, 'Error').throws();
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
    serverless.classes.Error.restore();
  });

  describe('#constructor()', () => {
    let installStub;

    beforeEach(() => {
      installStub = sinon
        .stub(pluginInstall, 'install').returns(BbPromise.resolve());
    });

    afterEach(() => {
      pluginInstall.install.restore();
    });

    it('should have the sub-command "install"', () => {
      expect(pluginInstall.commands.plugin.commands.install).to.not.equal(undefined);
    });

    it('should have the lifecycle event "install" for the "install" sub-command', () => {
      expect(pluginInstall.commands.plugin.commands.install.lifecycleEvents).to.deep.equal([
        'install',
      ]);
    });

    it('should have a required option "name" for the "install" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(pluginInstall.commands.plugin.commands.install.options.name.required).to.be.true;
    });

    it('should have a "plugin:install:install" hook', () => {
      expect(pluginInstall.hooks['plugin:install:install']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "plugin:install:install" hook',
      () => pluginInstall.hooks['plugin:install:install']().then(() => {
        expect(installStub.calledOnce).to.equal(true);
      })
    );
  });

  describe('#install()', () => {
    let servicePath;
    let serverlessYmlFilePath;
    let pluginInstallStub;
    let validateStub;
    let getPluginsStub;
    let savedCwd;
    let addPluginToServerlessFileStub;
    let installPeerDependenciesStub;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      pluginInstall.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      validateStub = sinon
        .stub(pluginInstall, 'validate')
        .returns(BbPromise.resolve());
      pluginInstallStub = sinon
        .stub(pluginInstall, 'pluginInstall')
        .returns(BbPromise.resolve());
      addPluginToServerlessFileStub = sinon
        .stub(pluginInstall, 'addPluginToServerlessFile')
        .returns(BbPromise.resolve());
      installPeerDependenciesStub = sinon
        .stub(pluginInstall, 'installPeerDependencies')
        .returns(BbPromise.resolve());
      getPluginsStub = sinon
        .stub(pluginInstall, 'getPlugins')
        .returns(BbPromise.resolve(plugins));
      // save the cwd so that we can restore it later
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      pluginInstall.validate.restore();
      pluginInstall.getPlugins.restore();
      pluginInstall.pluginInstall.restore();
      pluginInstall.addPluginToServerlessFile.restore();
      pluginInstall.installPeerDependencies.restore();
      process.chdir(savedCwd);
    });

    it('should install the plugin if it can be found in the registry', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      pluginInstall.options.name = 'serverless-plugin-1';

      return expect(pluginInstall.install()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(pluginInstallStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(serverlessErrorStub.calledOnce).to.equal(false);
        expect(addPluginToServerlessFileStub.calledOnce).to.equal(true);
        expect(installPeerDependenciesStub.calledOnce).to.equal(true);
      });
    });

    it('should not install the plugin if it can not be found in the registry', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      pluginInstall.options.name = 'serverless-not-available-plugin';
      return expect(pluginInstall.install()).to.be.rejected.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(pluginInstallStub.calledOnce).to.equal(false);
        expect(consoleLogStub.called).to.equal(false);
        expect(serverlessErrorStub.calledOnce).to.equal(true);
        expect(addPluginToServerlessFileStub.calledOnce).to.equal(false);
        expect(installPeerDependenciesStub.calledOnce).to.equal(false);
      });
    });

    it('should apply the latest version if you can not get the version from name option', () => {
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      pluginInstall.options.name = 'serverless-plugin-1';
      return expect(pluginInstall.install()).to.be.fulfilled.then(() => {
        expect(pluginInstall.options.pluginName).to.be.equal('serverless-plugin-1');
        expect(pluginInstall.options.pluginVersion).to.be.equal('latest');
      });
    });

    it('should apply the specified version if you can get the version from name option', () => {
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      pluginInstall.options.name = 'serverless-plugin-1@1.0.0';
      return expect(pluginInstall.install()).to.be.fulfilled.then(() => {
        expect(pluginInstall.options.pluginName).to.be.equal('serverless-plugin-1');
        expect(pluginInstall.options.pluginVersion).to.be.equal('1.0.0');
      });
    });
  });

  describe('#pluginInstall()', () => {
    let servicePath;
    let packageJsonFilePath;
    let npmInstallStub;
    let savedCwd;

    beforeEach(() => {
      pluginInstall.options.pluginName = 'serverless-plugin-1';
      pluginInstall.options.pluginVersion = 'latest';
      servicePath = testUtils.getTmpDirPath();
      pluginInstall.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      packageJsonFilePath = path.join(servicePath, 'package.json');
      npmInstallStub = sinon.stub(childProcess, 'execAsync', () => {
        const packageJson =
          serverless.utils.readFileSync(packageJsonFilePath, 'utf8');
        packageJson.devDependencies = {
          'serverless-plugin-1': 'latest',
        };
        serverless.utils
          .writeFileSync(packageJsonFilePath, packageJson);
        return BbPromise.resolve();
      });

      // save the cwd so that we can restore it later
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      childProcess.execAsync.restore();
      process.chdir(savedCwd);
    });

    it('should install the plugin if it has not been installed yet', () => {
      const packageJson = {
        name: 'test-service',
        description: '',
        version: '0.1.0',
        dependencies: {},
        devDependencies: {},
      };

      serverless.utils
        .writeFileSync(packageJsonFilePath, packageJson);

      return expect(pluginInstall.pluginInstall()).to.be.fulfilled.then(() => {
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          'npm install --save-dev serverless-plugin-1@latest',
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(serverlessErrorStub.calledOnce).to.equal(false);
      });
    });

    it('should generate a package.json file in the service directory if not present',
      () => expect(pluginInstall.pluginInstall()).to.be.fulfilled.then(() => {
        expect(consoleLogStub.called).to.equal(true);
        expect(npmInstallStub.calledWithExactly(
          'npm install --save-dev serverless-plugin-1@latest',
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(fs.existsSync(packageJsonFilePath)).to.equal(true);
      })
    );
  });

  describe('#addPluginToServerlessFile()', () => {
    let servicePath;
    let serverlessYmlFilePath;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      pluginInstall.serverless.config.servicePath = servicePath;
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
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

      pluginInstall.options.pluginName = 'serverless-plugin-1';

      return expect(pluginInstall.addPluginToServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8').plugins)
          .to.deep.equal(['serverless-plugin-1']);
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

      pluginInstall.options.pluginName = 'serverless-plugin-1';

      return expect(pluginInstall.addPluginToServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8').plugins)
          .to.deep.equal(['serverless-existing-plugin', 'serverless-plugin-1']);
      });
    });

    it('should add the plugin to serverless file path for a .yaml file', () => {
      const serverlessYamlFilePath = path.join(servicePath, 'serverless.yaml');
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYamlFilePath, YAML.dump(serverlessYml));
      pluginInstall.options.pluginName = 'serverless-plugin-1';
      return expect(pluginInstall.addPluginToServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessYamlFilePath, 'utf8').plugins)
          .to.deep.equal(['serverless-plugin-1']);
      });
    });

    it('should add the plugin to serverless file path for a .json file', () => {
      const serverlessJsonFilePath = path.join(servicePath, 'serverless.json');
      const serverlessJson = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessJsonFilePath, serverlessJson);
      pluginInstall.options.pluginName = 'serverless-plugin-1';
      return expect(pluginInstall.addPluginToServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
          .to.deep.equal(['serverless-plugin-1']);
      })
      .then(() => {
        pluginInstall.options.pluginName = 'serverless-plugin-2';
        return expect(pluginInstall.addPluginToServerlessFile()).to.be.fulfilled.then(() => {
          expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
            .to.deep.equal(['serverless-plugin-1', 'serverless-plugin-2']);
        });
      });
    });

    it('should not modify serverless .js file', () => {
      const serverlessJsFilePath = path.join(servicePath, 'serverless.js');
      const serverlessJson = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [],
      };
      serverless.utils
        .writeFileSync(serverlessJsFilePath, `module.exports = ${JSON.stringify(serverlessJson)};`);
      pluginInstall.options.pluginName = 'serverless-plugin-1';
      return expect(pluginInstall.addPluginToServerlessFile()).to.be.fulfilled.then(() => {
        // use require to load serverless.js
        // eslint-disable-next-line global-require
        expect(require(serverlessJsFilePath).plugins)
          .to.be.deep.equal([]);
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
      pluginInstall.options.pluginName = pluginName;
      servicePath = testUtils.getTmpDirPath();
      fse.ensureDirSync(servicePath);
      pluginInstall.serverless.config.servicePath = servicePath;
      servicePackageJsonFilePath = path.join(servicePath, 'package.json');
      fse.writeJsonSync(servicePackageJsonFilePath, {
        devDependencies: {},
      });
      pluginPath = path.join(
        servicePath, 'node_modules', pluginName);
      fse.ensureDirSync(pluginPath);
      pluginPackageJsonFilePath = path.join(pluginPath, 'package.json');
      npmInstallStub = sinon
        .stub(childProcess, 'execAsync')
        .returns(BbPromise.resolve());
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      childProcess.execAsync.restore();
      process.chdir(savedCwd);
    });

    it('should install peerDependencies if an installed plugin has ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {
        peerDependencies: {
          'some-package': '*',
        },
      });
      return expect(pluginInstall.installPeerDependencies()).to.be.fulfilled.then(() => {
        expect(npmInstallStub.calledWithExactly(
          'npm install --save-dev some-package@"*"',
          { stdio: 'ignore' }
        )).to.equal(true);
      });
    });

    it('should not install peerDependencies if an installed plugin does not have ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {});
      return expect(pluginInstall.installPeerDependencies()).to.be.fulfilled.then(() => {
        expect(fse.readJsonSync(servicePackageJsonFilePath))
          .to.be.deep.equal({ devDependencies: {} });
        expect(npmInstallStub.calledWithExactly(
          'npm install',
          { stdio: 'ignore' }
        )).to.equal(false);
      });
    });
  });
});
