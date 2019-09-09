'use strict';

const Serverless = require('../Serverless');
const fse = require('fs-extra');
const path = require('path');
const { expect } = require('chai');
const { getTmpDirPath } = require('../../tests/utils/fs');

const { renameService } = require('./renameService');

describe('renameService', () => {
  let serverless;
  let cwd;

  let servicePath;

  beforeEach(() => {
    const tmpDir = getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    servicePath = tmpDir;

    serverless = new Serverless();
    return serverless.init();
  });

  afterEach(() => {
    // change back to the old cwd
    process.chdir(cwd);
  });

  it('should set new service in serverless.yml and name in package.json', () => {
    const defaultServiceYml = 'service: service-name\n\nprovider:\n  name: aws\n';
    const newServiceYml = 'service: new-service-name\n\nprovider:\n  name: aws\n';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(servicePath, 'package.json');
    const serviceFile = path.join(servicePath, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, servicePath);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
  });

  it('should set new service in commented serverless.yml and name in package.json', () => {
    const defaultServiceYml =
      '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';
    const newServiceYml =
      '# comment\nservice: new-service-name\n\nprovider:\n  name: aws\n# comment';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(servicePath, 'package.json');
    const serviceFile = path.join(servicePath, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, servicePath);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
  });

  it('should set new service in commented serverless.yml without existing package.json', () => {
    const defaultServiceYml =
      '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';
    const newServiceYml =
      '# comment\nservice: new-service-name\n\nprovider:\n  name: aws\n# comment';

    const serviceFile = path.join(servicePath, 'serverless.yml');

    serverless.utils.writeFileDir(serviceFile);
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService('new-service-name', servicePath);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    expect(serviceYml).to.equal(newServiceYml);
  });

  it('should set new name of service in serverless.yml and name in package.json', () => {
    const defaultServiceYml = 'service:\n  name: service-name\n\nprovider:\n  name: aws\n';
    const newServiceYml = 'service:\n  name: new-service-name\n\nprovider:\n  name: aws\n';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(servicePath, 'package.json');
    const serviceFile = path.join(servicePath, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, servicePath);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
  });

  it('should set new name of service in commented serverless.yml and name in package.json', () => {
    const defaultServiceYml =
      '# comment\nservice:\n  name: service-name #comment\n\nprovider:\n  name: aws\n# comment';
    const newServiceYml =
      '# comment\nservice:\n  name: new-service-name\n\nprovider:\n  name: aws\n# comment';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(servicePath, 'package.json');
    const serviceFile = path.join(servicePath, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, servicePath);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
  });

  it('should fail to set new service name in serverless.yml', () => {
    const defaultServiceYml =
      '# comment\nservice: service-name #comment\n\nprovider:\n  name: aws\n# comment';

    const serviceFile = path.join(servicePath, 'serverledss.yml');

    serverless.utils.writeFileDir(serviceFile);
    fse.writeFileSync(serviceFile, defaultServiceYml);

    expect(() => renameService('new-service-name', servicePath)).to.throw(Error);
  });
});
