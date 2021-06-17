'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const os = require('os');
const path = require('path');
const JsZip = require('jszip');
const globby = require('globby');
const _ = require('lodash');
const fs = require('fs');
const childProcess = require('child_process');
const sinon = require('sinon');
const Package = require('../package');
const Serverless = require('../../../Serverless');
const { getTmpDirPath } = require('../../../../test/utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('zipService', () => {
  let tmpDirPath;
  let serverless;
  let packagePlugin;
  let params;

  beforeEach(() => {
    tmpDirPath = getTmpDirPath();
    serverless = new Serverless();
    serverless.service.service = 'first-service';
    serverless.config.servicePath = tmpDirPath;
    packagePlugin = new Package(serverless, {});
    packagePlugin.serverless.cli = new serverless.classes.CLI();
    params = {
      include: ['user-defined-include-me'],
      exclude: ['user-defined-exclude-me'],
      zipFileName: 'my-service.zip',
    };
  });

  describe('#zipService()', () => {
    let excludeDevDependenciesStub;
    let zipStub;

    beforeEach(() => {
      excludeDevDependenciesStub = sinon.stub(packagePlugin, 'excludeDevDependencies').resolves();
      zipStub = sinon.stub(packagePlugin, 'zip').resolves();
    });

    afterEach(() => {
      packagePlugin.excludeDevDependencies.restore();
      packagePlugin.zip.restore();
    });

    it('should run promise chain in order', () => {
      const exclude = params.exclude;
      const include = params.include;
      const zipFileName = params.zipFileName;

      return expect(packagePlugin.zipService(exclude, include, zipFileName)).to.be.fulfilled.then(
        () => {
          expect(excludeDevDependenciesStub).to.have.been.calledOnce;
          expect(zipStub).to.have.been.calledOnce;
        }
      );
    });
  });

  describe('#getFileContentAndStat()', () => {
    let servicePath;

    beforeEach(() => {
      servicePath = serverless.config.servicePath;
      fs.mkdirSync(servicePath);
    });

    it('should keep the file content as is', () => {
      const buf = Buffer.from([10, 20, 30, 40, 50]);
      const filePath = path.join(servicePath, 'bin-file');

      fs.writeFileSync(filePath, buf);

      return expect(packagePlugin.getFileContentAndStat(filePath)).to.be.fulfilled.then(result => {
        expect(result.data).to.deep.equal(buf);
      });
    });
  });

  describe('#getFileContent()', () => {
    let servicePath;

    beforeEach(() => {
      servicePath = serverless.config.servicePath;
      fs.mkdirSync(servicePath);
    });

    it('should keep the file content as is', () => {
      const buf = Buffer.from([10, 20, 30, 40, 50]);
      const filePath = path.join(servicePath, 'bin-file');

      fs.writeFileSync(filePath, buf);

      return expect(packagePlugin.getFileContent(filePath)).to.be.fulfilled.then(result => {
        expect(result).to.deep.equal(buf);
      });
    });
  });

  describe('#excludeDevDependencies()', () => {
    it('should resolve when opted out of dev dependency exclusion', () => {
      packagePlugin.serverless.service.package.excludeDevDependencies = false;

      return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
        updatedParams => {
          expect(updatedParams).to.deep.equal(params);
        }
      );
    });

    describe('when dealing with Node.js runtimes', () => {
      let globbySyncStub;
      let execStub;
      let readFileStub;
      let servicePath;

      beforeEach(() => {
        servicePath = packagePlugin.serverless.config.servicePath;
        globbySyncStub = sinon.stub(globby, 'sync');
        execStub = sinon.stub(childProcess, 'exec');
        readFileStub = sinon.stub(fs, 'readFile');
      });

      afterEach(() => {
        globby.sync.restore();
        childProcess.exec.restore();
        fs.readFile.restore();
      });

      it('should do nothing if no packages are used', () => {
        const filePaths = [];

        globbySyncStub.returns(filePaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub).to.not.have.been.called;
            expect(readFileStub).to.not.have.been.called;
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });
            expect(updatedParams.exclude).to.deep.equal(['user-defined-exclude-me']);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should do nothing if no dependencies are found', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execStub.yields();
        const depPaths = '';
        readFileStub.yields(null, depPaths);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub).to.have.been.calledTwice;
            expect(readFileStub).to.have.been.calledTwice;
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });
            expect(execStub.args[0][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[0][1].cwd).to.match(/.+/);
            expect(execStub.args[1][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[1][1].cwd).to.match(/.+/);
            expect(updatedParams.exclude).to.deep.equal(['user-defined-exclude-me']);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should return excludes and includes if an error is thrown in the global scope', () => {
        globbySyncStub.throws();

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub).to.not.have.been.called;
            expect(readFileStub).to.not.have.been.called;
            expect(updatedParams.exclude).to.deep.equal(['user-defined-exclude-me']);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should return excludes and includes if a exec Promise is rejected', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execStub.onCall(0).yields();
        execStub.onCall(1).yields('Failure');
        readFileStub.yields();

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.been.calledOnce;
            expect(execStub).to.have.been.calledTwice;
            expect(readFileStub).to.have.been.calledTwice;
            expect(updatedParams.exclude).to.deep.equal(['user-defined-exclude-me']);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should return excludes and includes if a readFile Promise is rejected', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execStub.yields();

        readFileStub.onCall(0).yields();
        readFileStub.onCall(1).yields('Failure');

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.been.calledOnce;
            expect(execStub).to.have.been.calledTwice;
            expect(readFileStub).to.have.been.calledTwice;
            expect(updatedParams.exclude).to.deep.equal(['user-defined-exclude-me']);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should fail silently and continue if "npm ls" call throws an error', () => {
        const filePaths = [
          // root of the service
          'package.json',
          'node_modules',
          // nested-dir
          // NOTE: reading the dependencies in this directory will fail in this tests
          path.join('1st', 'package.json'),
          path.join('1st', 'node_modules'),
          // nested-dir which is nested
          path.join('1st', '2nd', 'package.json'),
          path.join('1st', '2nd', 'node_modules'),
        ];

        globbySyncStub.returns(filePaths);
        execStub.onCall(0).yields();
        execStub.onCall(1).yields();
        execStub.onCall(2).yields('Failure');
        execStub.onCall(3).yields('Failure');
        execStub.onCall(4).yields();
        execStub.onCall(5).yields();
        const depPaths = [
          path.join(servicePath, 'node_modules', 'module-1'),
          path.join(servicePath, 'node_modules', 'module-2'),
          path.join(servicePath, '1st', '2nd', 'node_modules', 'module-1'),
          path.join(servicePath, '1st', '2nd', 'node_modules', 'module-2'),
        ].join('\n');
        readFileStub.withArgs(sinon.match(/dev$/)).yields(null, depPaths);
        readFileStub.withArgs(sinon.match(/prod$/)).yields(null, []);
        readFileStub.onCall(2).yields(null, '{}');
        readFileStub.onCall(3).yields(null, '{}');
        readFileStub.onCall(4).yields(null, '{}');
        readFileStub.onCall(5).yields(null, '{}');

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub.callCount).to.equal(6);
            expect(readFileStub).to.have.callCount(6);
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'module-1', 'package.json')
            );
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'module-2', 'package.json')
            );
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, '1st', '2nd', 'node_modules', 'module-1', 'package.json')
            );
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, '1st', '2nd', 'node_modules', 'module-1', 'package.json')
            );
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });
            expect(execStub.args[0][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[0][1].cwd).to.match(/.+/);
            expect(execStub.args[1][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[1][1].cwd).to.match(/.+/);
            expect(execStub.args[2][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[2][1].cwd).to.match(/.+/);
            expect(execStub.args[3][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[3][1].cwd).to.match(/.+/);
            expect(execStub.args[4][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[4][1].cwd).to.match(/.+/);
            expect(execStub.args[5][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[5][1].cwd).to.match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              path.join('node_modules', 'module-1', '**'),
              path.join('node_modules', 'module-2', '**'),
              path.join('1st', '2nd', 'node_modules', 'module-1', '**'),
              path.join('1st', '2nd', 'node_modules', 'module-2', '**'),
            ]);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should exclude dev dependencies in the services root directory', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execStub.yields();
        const depPaths = [
          path.join(servicePath, 'node_modules', 'module-1'),
          path.join(servicePath, 'node_modules', 'module-2'),
        ].join('\n');
        readFileStub.withArgs(sinon.match(/dev$/)).yields(null, depPaths);
        readFileStub.withArgs(sinon.match(/prod$/)).yields(null, []);
        readFileStub.onCall(2).yields(null, '{}');
        readFileStub.onCall(3).yields(null, '{}');

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub).to.have.been.calledTwice;
            expect(readFileStub).to.have.callCount(4);
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'module-1', 'package.json')
            );
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'module-2', 'package.json')
            );
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });
            expect(execStub.args[0][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[0][1].cwd).to.match(/.+/);
            expect(execStub.args[1][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[1][1].cwd).to.match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              path.join('node_modules', 'module-1', '**'),
              path.join('node_modules', 'module-2', '**'),
            ]);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should exclude dev dependencies in deeply nested services directories', () => {
        const filePaths = [
          // root of the service
          'package.json',
          'node_modules',
          // nested-dir
          path.join('1st', 'package.json'),
          path.join('1st', 'node_modules'),
          // nested-dir which is nested
          path.join('1st', '2nd', 'package.json'),
          path.join('1st', '2nd', 'node_modules'),
        ];

        globbySyncStub.returns(filePaths);
        execStub.yields();
        const depPaths = [
          path.join(servicePath, 'node_modules', 'module-1'),
          path.join(servicePath, 'node_modules', 'module-2'),
          path.join(servicePath, '1st', 'node_modules', 'module-1'),
          path.join(servicePath, '1st', 'node_modules', 'module-2'),
          path.join(servicePath, '1st', '2nd', 'node_modules', 'module-1'),
          path.join(servicePath, '1st', '2nd', 'node_modules', 'module-2'),
        ].join('\n');
        readFileStub.withArgs(sinon.match(/dev$/)).yields(null, depPaths);
        readFileStub.withArgs(sinon.match(/prod$/)).yields(null, []);
        readFileStub.onCall(2).yields(null, '{}');
        readFileStub.onCall(3).yields(null, '{}');
        readFileStub.onCall(4).yields(null, '{}');
        readFileStub.onCall(5).yields(null, '{}');
        readFileStub.onCall(6).yields(null, '{}');
        readFileStub.onCall(7).yields(null, '{}');

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub.callCount).to.equal(6);
            expect(readFileStub).to.have.callCount(8);
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });
            expect(execStub.args[0][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[0][1].cwd).to.match(/.+/);
            expect(execStub.args[1][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[1][1].cwd).to.match(/.+/);
            expect(execStub.args[2][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[2][1].cwd).to.match(/.+/);
            expect(execStub.args[3][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[3][1].cwd).to.match(/.+/);
            expect(execStub.args[4][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[4][1].cwd).to.match(/.+/);
            expect(execStub.args[5][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[5][1].cwd).to.match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              path.join('node_modules', 'module-1', '**'),
              path.join('node_modules', 'module-2', '**'),
              path.join('1st', 'node_modules', 'module-1', '**'),
              path.join('1st', 'node_modules', 'module-2', '**'),
              path.join('1st', '2nd', 'node_modules', 'module-1', '**'),
              path.join('1st', '2nd', 'node_modules', 'module-2', '**'),
            ]);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should not include packages if in both dependencies and devDependencies', () => {
        const filePaths = ['package.json', 'node_modules'];

        globbySyncStub.returns(filePaths);
        execStub.yields();

        const devDepPaths = [
          path.join(servicePath, 'node_modules', 'module-1'),
          path.join(servicePath, 'node_modules', 'module-2'),
        ].join('\n');
        readFileStub.withArgs(sinon.match(/dev$/)).yields(null, devDepPaths);

        const prodDepPaths = [path.join(servicePath, 'node_modules', 'module-2')];
        readFileStub.withArgs(sinon.match(/prod$/)).yields(null, prodDepPaths);
        readFileStub.onCall(2).yields(null, '{}');

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub).to.have.been.calledTwice;
            expect(readFileStub).to.have.been.calledThrice;
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'module-1', 'package.json')
            );
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });
            expect(execStub.args[0][0]).to.match(
              /npm ls --dev=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[0][1].cwd).to.match(/.+/);
            expect(execStub.args[1][0]).to.match(
              /npm ls --prod=true --parseable=true --long=false --silent >> .+/
            );
            expect(execStub.args[1][1].cwd).to.match(/.+/);
            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              path.join('node_modules', 'module-1', '**'),
            ]);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should exclude dev dependency executables in node_modules/.bin', () => {
        const devPaths = [
          'node_modules/bro-module',
          'node_modules/node-dude',
          'node_modules/lumo-clj',
          'node_modules/meowmix',
        ];

        const prodPaths = ['node_modules/node-dude'];

        const filePaths = ['node_modules/', 'package.json'].concat(devPaths).concat(prodPaths);

        globbySyncStub.returns(filePaths);
        execStub.yields();

        const mapper = depPath => path.join(`${servicePath}`, depPath);

        const devDepPaths = devPaths.map(mapper).join('\n');
        readFileStub.withArgs(sinon.match(/dev$/)).yields(null, devDepPaths);

        const prodDepPaths = prodPaths.map(mapper).join('\n');
        readFileStub.withArgs(sinon.match(/prod$/)).yields(null, prodDepPaths);

        readFileStub.onCall(2).yields(null, '{"name": "bro-module", "bin": "main.js"}');
        readFileStub
          .onCall(3)
          .yields(null, '{"name": "lumo-clj", "bin": {"lumo": "./bin/lumo.js"}}');
        readFileStub
          .onCall(4)
          // need to handle possibility of multiple executables provided by the lib
          .yields(
            null,
            '{"name": "meowmix", "bin": {"meow": "./bin/meow.js", "mix": "./bin/mix.js"}}'
          );

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.been.calledOnce;
            expect(execStub).to.have.been.calledTwice;

            expect(readFileStub).to.have.callCount(5);
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'bro-module', 'package.json')
            );
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'lumo-clj', 'package.json')
            );
            expect(readFileStub).to.have.been.calledWith(
              path.join(servicePath, 'node_modules', 'meowmix', 'package.json')
            );

            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              path.join('node_modules', 'bro-module', '**'),
              path.join('node_modules', '.bin', 'bro-module'),
              path.join('node_modules', 'lumo-clj', '**'),
              path.join('node_modules', '.bin', 'lumo'),
              path.join('node_modules', 'meowmix', '**'),
              path.join('node_modules', '.bin', 'meow'),
              path.join('node_modules', '.bin', 'mix'),
            ]);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });

      it('should exclude .bin executables in deeply nested folders', () => {
        const filePaths = [
          'package.json',
          'node_modules',
          path.join('1st', 'package.json'),
          path.join('1st', 'node_modules'),
          path.join('1st', '2nd', 'package.json'),
          path.join('1st', '2nd', 'node_modules'),
        ];

        globbySyncStub.returns(filePaths);
        execStub.yields();
        const deps = [
          'node_modules/module-1',
          'node_modules/module-2',
          '1st/node_modules/module-1',
          '1st/node_modules/module-2',
          '1st/2nd/node_modules/module-1',
          '1st/2nd/node_modules/module-2',
        ];
        const depPaths = deps.map(depPath => path.join(`${servicePath}`, depPath));
        readFileStub.withArgs(sinon.match(/dev$/)).yields(null, depPaths.join('\n'));
        readFileStub.withArgs(sinon.match(/prod$/)).yields(null, []);

        const module1PackageJson = JSON.stringify({
          name: 'module-1',
          bin: {
            'cool-module': './index.js',
          },
        });
        const module2PackageJson = JSON.stringify({
          name: 'module-2',
          bin: './main.js',
        });

        readFileStub.onCall(2).yields(null, module1PackageJson);
        readFileStub.onCall(3).yields(null, module2PackageJson);
        readFileStub.onCall(4).yields(null, module1PackageJson);
        readFileStub.onCall(5).yields(null, module2PackageJson);
        readFileStub.onCall(6).yields(null, module1PackageJson);
        readFileStub.onCall(7).yields(null, module2PackageJson);

        return expect(packagePlugin.excludeDevDependencies(params)).to.be.fulfilled.then(
          updatedParams => {
            expect(globbySyncStub).to.have.been.calledOnce;
            expect(execStub.callCount).to.equal(6);
            expect(readFileStub).to.have.callCount(8);
            for (const depPath of deps) {
              expect(readFileStub).to.have.been.calledWith(
                path.join(servicePath, depPath, 'package.json')
              );
            }
            expect(globbySyncStub).to.have.been.calledWithExactly(['**/package.json'], {
              cwd: packagePlugin.serverless.config.servicePath,
              dot: true,
              silent: true,
              follow: true,
              nosort: true,
            });

            expect(updatedParams.exclude).to.deep.equal([
              'user-defined-exclude-me',
              path.join('node_modules', 'module-1', '**'),
              path.join('node_modules', '.bin', 'cool-module'),
              path.join('node_modules', 'module-2', '**'),
              path.join('node_modules', '.bin/module-2'),
              path.join('1st', 'node_modules', 'module-1', '**'),
              path.join('1st', 'node_modules', '.bin', 'cool-module'),
              path.join('1st', 'node_modules', 'module-2', '**'),
              path.join('1st', 'node_modules', '.bin', 'module-2'),
              path.join('1st', '2nd', 'node_modules', 'module-1', '**'),
              path.join('1st', '2nd', 'node_modules', '.bin', 'cool-module'),
              path.join('1st', '2nd', 'node_modules', 'module-2', '**'),
              path.join('1st', '2nd', 'node_modules', '.bin', 'module-2'),
            ]);
            expect(updatedParams.include).to.deep.equal(['user-defined-include-me']);
            expect(updatedParams.zipFileName).to.equal(params.zipFileName);
          }
        );
      });
    });
  });

  describe('#zip()', () => {
    let zip;

    const testDirectory = {
      // root
      '.': {
        'event.json': 'some content',
        'handler.js': 'some content',
        'file-1': 'some content',
        'file-2': 'some content',
      },
      // bin
      'bin': {
        'binary-777': {
          content: 'some content',
          permissions: 0o777,
        },
        'binary-444': {
          content: 'some content',
          permissions: 0o444,
        },
      },
      // lib
      'lib': {
        'file-1.js': 'some content',
      },
      'lib/directory-1': {
        'file-1.js': 'some content',
      },
      // node_modules
      'node_modules/directory-1': {
        'file-1': 'some content',
        'file-2': 'some content',
      },
      'node_modules/directory-2': {
        'file-1': 'some content',
        'file-2': 'some content',
      },
    };

    function getTestArtifactFileName(testName) {
      return `test-${testName}-${new Date().getTime().toString()}.zip`;
    }

    beforeEach(() => {
      zip = new JsZip();

      Object.keys(testDirectory).forEach(dirName => {
        const dirPath = path.join(tmpDirPath, dirName);
        const files = testDirectory[dirName];

        Object.keys(files).forEach(fileName => {
          const filePath = path.join(dirPath, fileName);
          const fileValue = files[fileName];
          const file = _.isObject(fileValue) ? fileValue : { content: fileValue };

          if (!file.content) {
            throw new Error('File content is required');
          }

          serverless.utils.writeFileSync(filePath, file.content);

          if (file.permissions) {
            fs.chmodSync(filePath, file.permissions);
          }
        });
      });
    });

    it('should zip a whole service (without include / exclude usage)', () => {
      params.zipFileName = getTestArtifactFileName('whole-service');

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;

          expect(
            Object.keys(unzippedFileData).filter(file => !unzippedFileData[file].dir)
          ).to.be.lengthOf(12);

          // root directory
          expect(unzippedFileData['event.json'].name).to.equal('event.json');
          expect(unzippedFileData['handler.js'].name).to.equal('handler.js');
          expect(unzippedFileData['file-1'].name).to.equal('file-1');
          expect(unzippedFileData['file-2'].name).to.equal('file-2');

          // bin directory
          expect(unzippedFileData['bin/binary-777'].name).to.equal('bin/binary-777');
          expect(unzippedFileData['bin/binary-444'].name).to.equal('bin/binary-444');

          // lib directory
          expect(unzippedFileData['lib/file-1.js'].name).to.equal('lib/file-1.js');
          expect(unzippedFileData['lib/directory-1/file-1.js'].name).to.equal(
            'lib/directory-1/file-1.js'
          );

          // node_modules directory
          expect(unzippedFileData['node_modules/directory-1/file-1'].name).to.equal(
            'node_modules/directory-1/file-1'
          );
          expect(unzippedFileData['node_modules/directory-1/file-2'].name).to.equal(
            'node_modules/directory-1/file-2'
          );
          expect(unzippedFileData['node_modules/directory-2/file-1'].name).to.equal(
            'node_modules/directory-2/file-1'
          );
          expect(unzippedFileData['node_modules/directory-2/file-2'].name).to.equal(
            'node_modules/directory-2/file-2'
          );
        });
    });

    it('should keep file permissions', () => {
      params.zipFileName = getTestArtifactFileName('file-permissions');

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;

          if (os.platform() !== 'win32') {
            // chmod does not work right on windows
            // binary file is set with chmod of 777
            expect(unzippedFileData['bin/binary-777'].unixPermissions).to.equal(
              Math.pow(2, 15) + 0o755
            );
          }

          // read only file is set with chmod of 444
          expect(unzippedFileData['bin/binary-444'].unixPermissions).to.equal(
            Math.pow(2, 15) + 0o644
          );
        });
    });

    it('should exclude with globs', () => {
      params.zipFileName = getTestArtifactFileName('exclude-with-globs');
      params.exclude = ['event.json', 'lib/**', 'node_modules/directory-1/**'];

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;

          expect(
            Object.keys(unzippedFileData).filter(file => !unzippedFileData[file].dir)
          ).to.be.lengthOf(7);

          // root directory
          expect(unzippedFileData['handler.js'].name).to.equal('handler.js');
          expect(unzippedFileData['file-1'].name).to.equal('file-1');
          expect(unzippedFileData['file-2'].name).to.equal('file-2');

          // bin directory
          expect(unzippedFileData['bin/binary-777'].name).to.equal('bin/binary-777');
          expect(unzippedFileData['bin/binary-444'].name).to.equal('bin/binary-444');

          // node_modules directory
          expect(unzippedFileData['node_modules/directory-2/file-1'].name).to.equal(
            'node_modules/directory-2/file-1'
          );
          expect(unzippedFileData['node_modules/directory-2/file-2'].name).to.equal(
            'node_modules/directory-2/file-2'
          );
        });
    });

    it('should re-include files using ! glob pattern', () => {
      params.zipFileName = getTestArtifactFileName('re-include-with-globs');
      params.exclude = [
        'event.json',
        'lib/**',
        'node_modules/directory-1/**',

        '!event.json', // re-include
        '!lib/**', // re-include
      ];

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;

          expect(
            Object.keys(unzippedFileData).filter(file => !unzippedFileData[file].dir)
          ).to.be.lengthOf(10);

          // root directory
          expect(unzippedFileData['event.json'].name).to.equal('event.json');
          expect(unzippedFileData['handler.js'].name).to.equal('handler.js');
          expect(unzippedFileData['file-1'].name).to.equal('file-1');
          expect(unzippedFileData['file-2'].name).to.equal('file-2');

          // bin directory
          expect(unzippedFileData['bin/binary-777'].name).to.equal('bin/binary-777');
          expect(unzippedFileData['bin/binary-444'].name).to.equal('bin/binary-444');

          // lib directory
          expect(unzippedFileData['lib/file-1.js'].name).to.equal('lib/file-1.js');
          expect(unzippedFileData['lib/directory-1/file-1.js'].name).to.equal(
            'lib/directory-1/file-1.js'
          );

          // node_modules directory
          expect(unzippedFileData['node_modules/directory-2/file-1'].name).to.equal(
            'node_modules/directory-2/file-1'
          );
          expect(unzippedFileData['node_modules/directory-2/file-2'].name).to.equal(
            'node_modules/directory-2/file-2'
          );
        });
    });

    it('should re-include files using include config', () => {
      params.zipFileName = getTestArtifactFileName('re-include-with-include');
      params.exclude = ['event.json', 'lib/**', 'node_modules/directory-1/**'];
      params.include = ['event.json', 'lib/**'];

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;

          expect(
            Object.keys(unzippedFileData).filter(file => !unzippedFileData[file].dir)
          ).to.be.lengthOf(10);

          // root directory
          expect(unzippedFileData['event.json'].name).to.equal('event.json');
          expect(unzippedFileData['handler.js'].name).to.equal('handler.js');
          expect(unzippedFileData['file-1'].name).to.equal('file-1');
          expect(unzippedFileData['file-2'].name).to.equal('file-2');

          // bin directory
          expect(unzippedFileData['bin/binary-777'].name).to.equal('bin/binary-777');
          expect(unzippedFileData['bin/binary-444'].name).to.equal('bin/binary-444');

          // lib directory
          expect(unzippedFileData['lib/file-1.js'].name).to.equal('lib/file-1.js');
          expect(unzippedFileData['lib/directory-1/file-1.js'].name).to.equal(
            'lib/directory-1/file-1.js'
          );

          // node_modules directory
          expect(unzippedFileData['node_modules/directory-2/file-1'].name).to.equal(
            'node_modules/directory-2/file-1'
          );
          expect(unzippedFileData['node_modules/directory-2/file-2'].name).to.equal(
            'node_modules/directory-2/file-2'
          );
        });
    });

    it('should include files even if outside working dir', () => {
      params.zipFileName = getTestArtifactFileName('include-outside-working-dir');
      serverless.config.servicePath = path.join(serverless.config.servicePath, 'lib');
      params.exclude = ['./**'];
      params.include = ['../bin/binary-**'];

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;
          expect(Object.keys(unzippedFileData).sort()).to.deep.equal([
            'bin/binary-444',
            'bin/binary-777',
          ]);
        });
    });

    it('should include files only once', () => {
      params.zipFileName = getTestArtifactFileName('include-outside-working-dir');
      serverless.config.servicePath = path.join(serverless.config.servicePath, 'lib');
      params.exclude = ['./**'];
      params.include = ['.././bin/**'];

      return expect(packagePlugin.zip(params))
        .to.eventually.be.equal(
          path.join(serverless.config.servicePath, '.serverless', params.zipFileName)
        )
        .then(artifact => {
          const data = fs.readFileSync(artifact);
          return expect(zip.loadAsync(data)).to.be.fulfilled;
        })
        .then(unzippedData => {
          const unzippedFileData = unzippedData.files;
          expect(Object.keys(unzippedFileData).sort()).to.deep.equal([
            'bin/binary-444',
            'bin/binary-777',
          ]);
        });
    });

    it('should throw an error if no files are matched', () => {
      params.exclude = ['**/**'];
      params.include = [];
      params.zipFileName = getTestArtifactFileName('empty');

      return expect(packagePlugin.zip(params)).to.be.rejectedWith(
        Error,
        'file matches include / exclude'
      );
    });
  });

  describe('#zipFiles()', () => {
    it('should throw an error if no files are provided', () =>
      expect(packagePlugin.zipFiles([], path.resolve(__dirname, 'tmp.zip'))).to.be.rejectedWith(
        Error,
        'No files to package'
      ));
  });
});
