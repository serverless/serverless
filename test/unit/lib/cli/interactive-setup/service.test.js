'use strict';

const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const step = require('../../../../../lib/cli/interactive-setup/service');
const proxyquire = require('proxyquire');
const overrideStdoutWrite = require('process-utils/override-stdout-write');

const templatesPath = path.resolve(__dirname, '../../../../../lib/plugins/create/templates');

const { expect } = chai;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const fsp = require('fs').promises;
const inquirer = require('@serverless/utils/inquirer');

const confirmEmptyWorkingDir = async () =>
  expect(await fsp.readdir(process.cwd())).to.deep.equal([]);

describe('test/unit/lib/cli/interactive-setup/service.test.js', () => {
  afterEach(() => sinon.restore());

  it('Should be not applied, when at service path', () =>
    expect(step.isApplicable({ serviceDir: '/foo', options: {} })).to.equal(false));
  it('Should be applied, when not at service path', () =>
    expect(step.isApplicable({ options: {} })).to.equal(true));

  it('Should result in an error when at service path with `template-path` options provided', () => {
    expect(() =>
      step.isApplicable({ serviceDir: '/foo', options: { 'template-path': 'path/to/template' } })
    )
      .to.throw()
      .and.have.property('code', 'NOT_APPLICABLE_SERVICE_OPTIONS');
  });

  it("Should abort if user doesn't want setup", async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: false },
    });
    await step.run({ options: {} });
    return confirmEmptyWorkingDir();
  });

  it("Should abort if user choses 'other' template", async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'other' },
    });
    await step.run({ options: {} });
    return confirmEmptyWorkingDir();
  });

  describe('Create new project', () => {
    it('Should create project at not existing directory', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/downloadTemplateFromRepo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              await fsp.mkdir(projectName);
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
            }
          ),
        },
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: 'test-project' },
      });
      await mockedStep.run({ options: {} });
      const stats = await fsp.lstat('test-project/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        'https://github.com/serverless/examples/tree/master/aws-nodejs',
        'aws-nodejs',
        'test-project'
      );
    });

    it('Should run `npm install` if `package.json` present', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const spawnStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        'child-process-ext/spawn': spawnStub,
        '../../utils/downloadTemplateFromRepo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              await fsp.mkdir(projectName);
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
              await fsp.writeFile(path.join(projectName, 'package.json'), '{}');
            }
          ),
        },
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: 'test-project-package-json' },
      });
      await mockedStep.run({ options: {} });
      const stats = await fsp.lstat('test-project-package-json/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        'https://github.com/serverless/examples/tree/master/aws-nodejs',
        'aws-nodejs',
        'test-project-package-json'
      );
      expect(spawnStub).to.have.been.calledWith('npm', ['install'], {
        cwd: path.join(process.cwd(), 'test-project-package-json'),
      });
    });

    it('Should emit warning if npm installation not found', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        'child-process-ext/spawn': sinon.stub().rejects({ code: 'ENOENT' }),
        '../../utils/downloadTemplateFromRepo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              await fsp.mkdir(projectName);
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
              await fsp.writeFile(path.join(projectName, 'package.json'), '{}');
            }
          ),
        },
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: 'test-project-missing-npm' },
      });

      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        async () => mockedStep.run({ options: {} })
      );

      const stats = await fsp.lstat('test-project-missing-npm/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(stdoutData).to.include('Cannot install dependencies');
    });

    it('Should emit warning if npm installation not found', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        'child-process-ext/spawn': sinon.stub().rejects({ message: 'Error message' }),
        '../../utils/downloadTemplateFromRepo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              await fsp.mkdir(projectName);
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
              await fsp.writeFile(path.join(projectName, 'package.json'), '{}');
            }
          ),
        },
      });

      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: 'test-project-failed-install' },
      });

      await expect(mockedStep.run({ options: {} })).to.be.eventually.rejected.and.have.property('code', 'DEPENDENCIES_INSTALL_FAILED')
    });

    it('Should create project at not existing directory from a provided `template-path`', async () => {
      configureInquirerStub(inquirer, {
        input: { projectName: 'test-project-from-local-template' },
      });
      await step.run({ options: { 'template-path': path.join(templatesPath, 'aws-nodejs') } });
      const stats = await fsp.lstat('test-project-from-local-template/serverless.yml');
      expect(stats.isFile()).to.be.true;
    });

    it('Should create project at not existing directory with provided `name`', async () => {
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/downloadTemplateFromRepo': {
          downloadTemplateFromRepo: sinon
            .stub()
            .callsFake(async (templateUrl, projectType, projectName) => {
              await fsp.mkdir(projectName);
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
            }),
        },
      });
      configureInquirerStub(inquirer, {
        list: { projectType: 'aws-nodejs' },
      });
      await mockedStep.run({ options: { name: 'test-project-from-cli-option' } });
      const stats = await fsp.lstat('test-project-from-cli-option/serverless.yml');
      expect(stats.isFile()).to.be.true;
    });

    it('Should throw an error when template cannot be downloaded', async () => {
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/downloadTemplateFromRepo': {
          downloadTemplateFromRepo: sinon.stub().rejects(),
        },
      });
      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: 'test-error-during-download' },
      });
      await expect(mockedStep.run({ options: {} })).to.be.eventually.rejected.and.have.property(
        'code',
        'TEMPLATE_DOWNLOAD_FAILED'
      );
    });
  });

  it('Should not allow project creation in a directory in which already service is configured', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'aws-nodejs' },
      input: { projectName: 'existing' },
    });

    await fsp.mkdir('existing');

    await expect(step.run({ options: {} })).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_ANSWER'
    );
  });

  it('Should not allow project creation in a directory in which already service is configured when `name` flag provided', async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'aws-nodejs' },
    });

    await fsp.mkdir('anotherexisting');

    await expect(
      step.run({ options: { name: 'anotherexisting' } })
    ).to.eventually.be.rejected.and.have.property('code', 'TARGET_FOLDER_ALREADY_EXISTS');
  });

  it('Should not allow project creation using an invalid project name', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'aws-nodejs' },
      input: { projectName: 'elo grzegżółka' },
    });
    await expect(step.run({ options: {} })).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_ANSWER'
    );
  });

  it('Should not allow project creation using an invalid project name when `name` flag provided', async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'aws-nodejs' },
    });
    await expect(
      step.run({ options: { name: 'elo grzegżółka' } })
    ).to.eventually.be.rejected.and.have.property('code', 'INVALID_PROJECT_NAME');
  });
});
