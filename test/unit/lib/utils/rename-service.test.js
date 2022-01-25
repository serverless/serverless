'use strict';

const Serverless = require('../../../../lib/serverless');
const fse = require('fs-extra');
const path = require('path');
const { expect } = require('chai');
const { getTmpDirPath } = require('../../../utils/fs');

const { renameService } = require('../../../../lib/utils/rename-service');

describe('renameService', () => {
  let serverless;
  let cwd;

  let serviceDir;

  beforeEach(() => {
    const tmpDir = getTmpDirPath();
    cwd = process.cwd();

    fse.mkdirsSync(tmpDir);
    process.chdir(tmpDir);

    serviceDir = tmpDir;

    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
    return serverless.init();
  });

  afterEach(() => {
    // change back to the old cwd
    process.chdir(cwd);
  });

  it('should set new service in serverless.yml and name in package.json and package-lock.json', () => {
    const defaultServiceYml =
      'someService: foo\notherservice: bar\nservice: service-name\n\nprovider:\n  name: aws';
    const newServiceYml =
      'someService: foo\notherservice: bar\nservice: new-service-name\n\nprovider:\n  name: aws';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(serviceDir, 'package.json');
    const packageLockFile = path.join(serviceDir, 'package-lock.json');
    const serviceFile = path.join(serviceDir, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    serverless.utils.writeFileSync(packageLockFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, serviceDir);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    const packageLockJson = serverless.utils.readFileSync(packageLockFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
    expect(packageLockJson.name).to.equal(newServiceName);
  });

  it('should set new service in serverless.ts and name in package.json and package-lock.json', () => {
    const defaultServiceTs =
      "const service = {\nservice: 'service-name',\n\nprovider: {\n  name: 'aws',\n}\n}\n";
    const newServiceTs =
      "const service = {\nservice: 'new-service-name',\n\nprovider: {\n  name: 'aws',\n}\n}\n";

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(serviceDir, 'package.json');
    const packageLockFile = path.join(serviceDir, 'package-lock.json');
    const serviceFile = path.join(serviceDir, 'serverless.ts');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    serverless.utils.writeFileSync(packageLockFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceTs);

    renameService(newServiceName, serviceDir);
    const serviceTs = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    const packageLockJson = serverless.utils.readFileSync(packageLockFile);
    expect(serviceTs).to.equal(newServiceTs);
    expect(packageJson.name).to.equal(newServiceName);
    expect(packageLockJson.name).to.equal(newServiceName);
  });

  it('should set new service in commented serverless.yml and name in package.json and package-lock.json', () => {
    const defaultServiceYml =
      '# service: service-name #comment\n\nprovider:\n  name: aws\n# comment';
    const newServiceYml = '# service: new-service-name\n\nprovider:\n  name: aws\n# comment';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(serviceDir, 'package.json');
    const packageLockFile = path.join(serviceDir, 'package-lock.json');
    const serviceFile = path.join(serviceDir, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    serverless.utils.writeFileSync(packageLockFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, serviceDir);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    const packageLockJson = serverless.utils.readFileSync(packageLockFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
    expect(packageLockJson.name).to.equal(newServiceName);
  });

  it('should set new service in commented serverless.yml without existing package.json or package-lock.json', () => {
    const defaultServiceYml =
      '# service: service-name #comment\n\nprovider:\n  name: aws\n# comment';
    const newServiceYml = '# service: new-service-name\n\nprovider:\n  name: aws\n# comment';

    const serviceFile = path.join(serviceDir, 'serverless.yml');

    serverless.utils.writeFileDir(serviceFile);
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService('new-service-name', serviceDir);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    expect(serviceYml).to.equal(newServiceYml);
  });

  it('should set new name of service in serverless.yml and name in package.json and package-lock.json', () => {
    const defaultServiceYml = 'service:\n  name: service-name\n\nprovider:\n  name: aws\n';
    const newServiceYml = 'service:\n  name: new-service-name\n\nprovider:\n  name: aws\n';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(serviceDir, 'package.json');
    const packageLockFile = path.join(serviceDir, 'package-lock.json');
    const serviceFile = path.join(serviceDir, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    serverless.utils.writeFileSync(packageLockFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, serviceDir);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    const packageLockJson = serverless.utils.readFileSync(packageLockFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
    expect(packageLockJson.name).to.equal(newServiceName);
  });

  it('should set new name of service in serverless.ts and name in package.json and package-lock.json', () => {
    const defaultServiceTs =
      "const service = {\nservice: {\n   name: 'service-name',\n},\nprovider: {\n  name: 'aws',\n}\n}\n";
    const newServiceTs =
      "const service = {\nservice: {\n   name: 'new-service-name',\n},\nprovider: {\n  name: 'aws',\n}\n}\n";

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(serviceDir, 'package.json');
    const packageLockFile = path.join(serviceDir, 'package-lock.json');
    const serviceFile = path.join(serviceDir, 'serverless.ts');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    serverless.utils.writeFileSync(packageLockFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceTs);

    renameService(newServiceName, serviceDir);
    const serviceTs = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    const packageLockJson = serverless.utils.readFileSync(packageLockFile);
    expect(serviceTs).to.equal(newServiceTs);
    expect(packageJson.name).to.equal(newServiceName);
    expect(packageLockJson.name).to.equal(newServiceName);
  });

  it('should set new name of service in commented serverless.yml and name in package.json and package-lock.json', () => {
    const defaultServiceYml =
      '# service:\n  name: service-name #comment\n\nprovider:\n  name: aws\n# comment';
    const newServiceYml =
      '# service:\n  name: new-service-name\n\nprovider:\n  name: aws\n# comment';

    const defaultServiceName = 'service-name';
    const newServiceName = 'new-service-name';

    const packageFile = path.join(serviceDir, 'package.json');
    const packageLockFile = path.join(serviceDir, 'package-lock.json');
    const serviceFile = path.join(serviceDir, 'serverless.yml');

    serverless.utils.writeFileSync(packageFile, { name: defaultServiceName });
    serverless.utils.writeFileSync(packageLockFile, { name: defaultServiceName });
    fse.writeFileSync(serviceFile, defaultServiceYml);

    renameService(newServiceName, serviceDir);
    const serviceYml = fse.readFileSync(serviceFile, 'utf-8');
    const packageJson = serverless.utils.readFileSync(packageFile);
    const packageLockJson = serverless.utils.readFileSync(packageLockFile);
    expect(serviceYml).to.equal(newServiceYml);
    expect(packageJson.name).to.equal(newServiceName);
    expect(packageLockJson.name).to.equal(newServiceName);
  });

  it('should fail to set new service name in serverless.yml', () => {
    expect(() => renameService('new-service-name', serviceDir))
      .to.throw()
      .and.have.property('code', 'MISSING_SERVICE_FILE');
  });
});
