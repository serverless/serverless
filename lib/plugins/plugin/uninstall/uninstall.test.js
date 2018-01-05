'use strict';

const chai = require('chai');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const YAML = require('js-yaml');
const path = require('path');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = require('fs-extra');
const PluginUninstall = require('./uninstall');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const testUtils = require('../../../../tests/utils');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('PluginUninstall', () => {
  let pluginUninstall;
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
    pluginUninstall = new PluginUninstall(serverless, options);
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns();
    serverlessErrorStub = sinon.stub(serverless.classes, 'Error').throws();
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
    serverless.classes.Error.restore();
  });

  describe('#constructor()', () => {
    let uninstallStub;

    beforeEach(() => {
      uninstallStub = sinon
        .stub(pluginUninstall, 'uninstall').returns(BbPromise.resolve());
    });

    afterEach(() => {
      pluginUninstall.uninstall.restore();
    });

    it('should have the sub-command "uninstall"', () => {
      expect(pluginUninstall.commands.plugin.commands.uninstall).to.not.equal(undefined);
    });

    it('should have the lifecycle event "uninstall" for the "uninstall" sub-command', () => {
      expect(pluginUninstall.commands.plugin.commands.uninstall.lifecycleEvents).to.deep.equal([
        'uninstall',
      ]);
    });

    it('should have a required option "name" for the "uninstall" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(pluginUninstall.commands.plugin.commands.uninstall.options.name.required).to.be.true;
    });

    it('should have a "plugin:uninstall:uninstall" hook', () => {
      expect(pluginUninstall.hooks['plugin:uninstall:uninstall']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "plugin:uninstall:uninstall" hook',
      () => expect(pluginUninstall.hooks['plugin:uninstall:uninstall']())
      .to.be.fulfilled.then(() => {
        expect(uninstallStub.calledOnce).to.equal(true);
      })
    );
  });

  describe('#uninstall()', () => {
    let servicePath;
    let serverlessYmlFilePath;
    let pluginUninstallStub;
    let validateStub;
    let getPluginsStub;
    let savedCwd;
    let removePluginFromServerlessFileStub;
    let uninstallPeerDependenciesStub;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      pluginUninstall.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
      validateStub = sinon
        .stub(pluginUninstall, 'validate')
        .returns(BbPromise.resolve());
      pluginUninstallStub = sinon
        .stub(pluginUninstall, 'pluginUninstall')
        .returns(BbPromise.resolve());
      removePluginFromServerlessFileStub = sinon
        .stub(pluginUninstall, 'removePluginFromServerlessFile')
        .returns(BbPromise.resolve());
      uninstallPeerDependenciesStub = sinon
        .stub(pluginUninstall, 'uninstallPeerDependencies')
        .returns(BbPromise.resolve());
      getPluginsStub = sinon
        .stub(pluginUninstall, 'getPlugins')
        .returns(BbPromise.resolve(plugins));
      // save the cwd so that we can restore it later
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      pluginUninstall.validate.restore();
      pluginUninstall.getPlugins.restore();
      pluginUninstall.pluginUninstall.restore();
      pluginUninstall.removePluginFromServerlessFile.restore();
      pluginUninstall.uninstallPeerDependencies.restore();
      process.chdir(savedCwd);
    });

    it('should uninstall the plugin if it can be found in the registry', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      pluginUninstall.options.name = 'serverless-plugin-1';

      return expect(pluginUninstall.uninstall()).to.be.fulfilled.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(pluginUninstallStub.calledOnce).to.equal(true);
        expect(consoleLogStub.called).to.equal(true);
        expect(serverlessErrorStub.calledOnce).to.equal(false);
        expect(removePluginFromServerlessFileStub.calledOnce).to.equal(true);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(true);
      });
    });

    it('should not uninstall the plugin if it can not be found in the registry', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      pluginUninstall.options.name = 'serverless-not-available-plugin';
      return expect(pluginUninstall.uninstall()).to.be.rejected.then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(getPluginsStub.calledOnce).to.equal(true);
        expect(pluginUninstallStub.calledOnce).to.equal(false);
        expect(consoleLogStub.called).to.equal(false);
        expect(serverlessErrorStub.calledOnce).to.equal(true);
        expect(removePluginFromServerlessFileStub.calledOnce).to.equal(false);
        expect(uninstallPeerDependenciesStub.calledOnce).to.equal(false);
      });
    });

    it('should drop the version if specify', () => {
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));
      pluginUninstall.options.name = 'serverless-plugin-1@1.0';
      return expect(pluginUninstall.uninstall()).to.be.fulfilled.then(() => {
        expect(pluginUninstall.options.pluginName).to.be.equal('serverless-plugin-1');
      });
    });
  });

  describe('#pluginUninstall()', () => {
    let servicePath;
    let packageJsonFilePath;
    let npmUninstallStub;
    let savedCwd;

    beforeEach(() => {
      pluginUninstall.options.pluginName = 'serverless-plugin-1';
      servicePath = testUtils.getTmpDirPath();
      pluginUninstall.serverless.config.servicePath = servicePath;
      fse.ensureDirSync(servicePath);
      packageJsonFilePath = path.join(servicePath, 'package.json');
      npmUninstallStub = sinon.stub(childProcess, 'execAsync')
      .returns(BbPromise.resolve());
      // save the cwd so that we can restore it later
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      childProcess.execAsync.restore();
      process.chdir(savedCwd);
    });

    it('should uninstall the plugin if it has not been uninstalled yet', () => {
      const packageJson = {
        name: 'test-service',
        description: '',
        version: '0.1.0',
        dependencies: {},
        devDependencies: {
          'serverless-plugin-1': '^1.0.0',
        },
      };

      serverless.utils
        .writeFileSync(packageJsonFilePath, packageJson);

      return expect(pluginUninstall.pluginUninstall()).to.be.fulfilled.then(() => {
        expect(consoleLogStub.called).to.equal(true);
        expect(npmUninstallStub.calledWithExactly(
          'npm uninstall --save-dev serverless-plugin-1',
          { stdio: 'ignore' }
        )).to.equal(true);
        expect(serverlessErrorStub.calledOnce).to.equal(false);
      });
    });
  });

  describe('#removePluginFromServerlessFile()', () => {
    let servicePath;
    let serverlessYmlFilePath;

    beforeEach(() => {
      servicePath = testUtils.getTmpDirPath();
      pluginUninstall.serverless.config.servicePath = servicePath;
      serverlessYmlFilePath = path.join(servicePath, 'serverless.yml');
    });

    it('should only remove the given plugin from the service', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-existing-plugin',
          'serverless-plugin-1',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      pluginUninstall.options.pluginName = 'serverless-plugin-1';

      return expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8').plugins)
          .to.deep.equal(['serverless-existing-plugin']);
      });
    });

    it('should remove the plugin from the service if it is the only one', () => {
      // serverless.yml
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-plugin-1',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessYmlFilePath, YAML.dump(serverlessYml));

      pluginUninstall.options.pluginName = 'serverless-plugin-1';

      return expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessYmlFilePath, 'utf8'))
          .to.not.have.property('plugins');
      });
    });

    it('should remove the plugin from serverless file path for a .yaml file', () => {
      const serverlessYamlFilePath = path.join(servicePath, 'serverless.yaml');
      const serverlessYml = {
        service: 'plugin-service',
        provider: 'aws',
        plugins: [
          'serverless-plugin-1',
        ],
      };
      serverless.utils
        .writeFileSync(serverlessYamlFilePath, YAML.dump(serverlessYml));
      pluginUninstall.options.pluginName = 'serverless-plugin-1';
      return expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessYamlFilePath, 'utf8'))
          .to.not.have.property('plugins');
      });
    });

    it('should remove the plugin from serverless file path for a .json file', () => {
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
      pluginUninstall.options.pluginName = 'serverless-plugin-1';
      return expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(() => {
        expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8').plugins)
          .to.deep.equal(['serverless-plugin-2']);
        pluginUninstall.options.pluginName = 'serverless-plugin-2';
      })
      .then(() => expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(
      () => {
        expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8'))
          .to.not.have.property('plugins');
      }))
      .then(() => expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(
      () => {
        expect(serverless.utils.readFileSync(serverlessJsonFilePath, 'utf8'))
          .to.not.have.property('plugins');
      }));
    });

    it('should not modify serverless .js file', () => {
      it('should not modify serverless .js file', () => {
        const serverlessJsFilePath = path.join(servicePath, 'serverless.js');
        const serverlessJson = {
          service: 'plugin-service',
          provider: 'aws',
          plugins: [
            'serverless-plugin-1',
            'serverless-plugin-2',
          ],
        };
        serverless.utils.writeFileSync(
          serverlessJsFilePath,
          `module.exports = ${JSON.stringify(serverlessJson)};`
        );
        pluginUninstall.options.pluginName = 'serverless-plugin-1';
        return expect(pluginUninstall.removePluginFromServerlessFile()).to.be.fulfilled.then(() => {
          // use require to load serverless.js
          // eslint-disable-next-line global-require
          expect(require(serverlessJsFilePath).plugins)
            .to.be.deep.equal(serverlessJson.plugins);
        });
      });
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
      pluginUninstall.options.pluginName = pluginName;
      servicePath = testUtils.getTmpDirPath();
      pluginUninstall.serverless.config.servicePath = servicePath;
      pluginPath = path.join(
        servicePath, 'node_modules', pluginName);
      fse.ensureDirSync(pluginPath);
      pluginPackageJsonFilePath = path.join(pluginPath, 'package.json');
      npmUninstallStub = sinon
        .stub(childProcess, 'execAsync')
        .returns(BbPromise.resolve());
      savedCwd = process.cwd();
      process.chdir(servicePath);
    });

    afterEach(() => {
      childProcess.execAsync.restore();
      process.chdir(savedCwd);
    });

    it('should uninstall peerDependencies if an installed plugin has ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {
        peerDependencies: {
          'some-plugin': '*',
        },
      });
      return expect(pluginUninstall.uninstallPeerDependencies()).to.be.fulfilled.then(() => {
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --save-dev ${pluginName}`,
          { stdio: 'ignore' }
        )).to.equal(true);
      });
    });

    it('should not uninstall peerDependencies if an installed plugin does not have ones', () => {
      fse.writeJsonSync(pluginPackageJsonFilePath, {});
      return expect(pluginUninstall.uninstallPeerDependencies()).to.be.fulfilled.then(() => {
        expect(npmUninstallStub.calledWithExactly(
          `npm uninstall --save-dev ${pluginName}`,
          { stdio: 'ignore' }
        )).to.equal(false);
      });
    });

    it('should do nothing if an uninstalled plugin does not have package.json',
      () => expect(pluginUninstall.uninstallPeerDependencies()).to.be.fulfilled.then(
        () => {
          expect(npmUninstallStub.calledWithExactly(
            `npm uninstall --save-dev ${pluginName}`,
            { stdio: 'ignore' }
          )).to.equal(false);
        })
    );
  });
});
