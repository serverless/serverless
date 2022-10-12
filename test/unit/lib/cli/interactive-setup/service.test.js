'use strict';

const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const step = require('../../../../../lib/cli/interactive-setup/service');
const proxyquire = require('proxyquire');
const ServerlessError = require('../../../../../lib/serverless-error');
const { StepHistory } = require('@serverless/utils/telemetry');

const fixturesPath = path.resolve(__dirname, '../../../../fixtures/programmatic');

const { expect } = chai;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const fsp = require('fs').promises;
const inquirer = require('@serverless/utils/inquirer');

const confirmEmptyWorkingDir = async () =>
  expect(await fsp.readdir(process.cwd())).to.deep.equal([]);

describe('test/unit/lib/cli/interactive-setup/service.test.js', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('Should be not applied, when at service path', () => {
    const context = {
      serviceDir: '/foo',
      options: {},
    };
    expect(step.isApplicable(context)).to.equal(false);
    expect(context.inapplicabilityReasonCode).to.equal('IN_SERVICE_DIRECTORY');
  });

  it('Should be applied, when not at service path', () => {
    const context = { options: {} };
    expect(step.isApplicable(context)).to.equal(true);
    expect(context.inapplicabilityReasonCode).to.be.undefined;
  });

  it('Should result in an error when at service path with `template-path` options provided', () => {
    expect(() =>
      step.isApplicable({ serviceDir: '/foo', options: { 'template-path': 'path/to/template' } })
    )
      .to.throw()
      .and.have.property('code', 'NOT_APPLICABLE_SERVICE_OPTIONS');
  });

  it('Should result in an error when at service path with `template` option provided', () => {
    expect(() => step.isApplicable({ serviceDir: '/foo', options: { template: 'test-template' } }))
      .to.throw()
      .and.have.property('code', 'NOT_APPLICABLE_SERVICE_OPTIONS');
  });

  it('Should result in an error when at service path with `template-url` option provided', () => {
    expect(() =>
      step.isApplicable({ serviceDir: '/foo', options: { 'template-url': 'test-template' } })
    )
      .to.throw()
      .and.have.property('code', 'NOT_APPLICABLE_SERVICE_OPTIONS');
  });

  it("Should abort if user choses 'other' template", async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'other' },
    });
    const context = { options: {}, stepHistory: new StepHistory() };
    await step.run(context);
    expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['projectType', 'other']]));
    return confirmEmptyWorkingDir();
  });

  describe('Create new project', () => {
    it('Should create project at not existing directory', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
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
        list: { projectType: 'aws-node' },
        input: { projectName: 'test-project' },
      });
      const context = { options: {}, stepHistory: new StepHistory() };
      await mockedStep.run(context);
      const stats = await fsp.lstat('test-project/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        'https://github.com/serverless/examples/tree/v3/aws-node',
        'aws-node',
        'test-project'
      );
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['projectType', 'aws-node'],
          ['projectName', '_user_input_'],
        ])
      );
    });

    it('Should remove `serverless.template.yml` if its a part of the template', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              await fsp.mkdir(projectName);
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
              await fsp.writeFile(path.join(projectName, 'serverless.template.yml'), '');
            }
          ),
        },
      });

      configureInquirerStub(inquirer, {
        list: { projectType: 'aws-node' },
        input: { projectName: 'test-project-template' },
      });
      const context = { options: {}, stepHistory: new StepHistory() };
      await mockedStep.run(context);
      const stats = await fsp.lstat('test-project-template/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        'https://github.com/serverless/examples/tree/v3/aws-node',
        'aws-node',
        'test-project-template'
      );
      await expect(
        fsp.lstat('test-proejct-template/serverless.template.yml')
      ).to.eventually.be.rejected.and.have.property('code', 'ENOENT');

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['projectType', 'aws-node'],
          ['projectName', '_user_input_'],
        ])
      );
    });

    it('Should run `npm install` if `package.json` present', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const spawnStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        'child-process-ext/spawn': spawnStub,
        '../../utils/download-template-from-repo': {
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
        list: { projectType: 'aws-node' },
        input: { projectName: 'test-project-package-json' },
      });
      const context = { options: {}, stepHistory: new StepHistory() };
      await mockedStep.run(context);
      const stats = await fsp.lstat('test-project-package-json/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        'https://github.com/serverless/examples/tree/v3/aws-node',
        'aws-node',
        'test-project-package-json'
      );
      expect(spawnStub).to.have.been.calledWith('npm', ['install'], {
        cwd: path.join(process.cwd(), 'test-project-package-json'),
      });

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['projectType', 'aws-node'],
          ['projectName', '_user_input_'],
        ])
      );
    });

    it('Should emit warning if npm installation not found', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        'child-process-ext/spawn': sinon.stub().rejects({ message: 'Error message' }),
        '../../utils/download-template-from-repo': {
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
        list: { projectType: 'aws-node' },
        input: { projectName: 'test-project-failed-install' },
      });

      const context = { options: {}, stepHistory: new StepHistory() };
      await expect(mockedStep.run(context)).to.be.eventually.rejected.and.have.property(
        'code',
        'DEPENDENCIES_INSTALL_FAILED'
      );

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['projectType', 'aws-node'],
          ['projectName', '_user_input_'],
        ])
      );
    });

    it('Should create project at not existing directory from a provided `template-path`', async () => {
      configureInquirerStub(inquirer, {
        input: { projectName: 'test-project-from-local-template' },
      });
      const context = {
        options: { 'template-path': path.join(fixturesPath, 'aws') },
        stepHistory: new StepHistory(),
      };
      await step.run(context);
      const stats = await fsp.lstat('test-project-from-local-template/serverless.yml');
      expect(stats.isFile()).to.be.true;

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['projectName', '_user_input_']])
      );
    });

    it('Should create project at not existing directory with provided `name`', async () => {
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
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
        list: { projectType: 'aws-node' },
      });
      const context = {
        options: { name: 'test-project-from-cli-option' },
        stepHistory: new StepHistory(),
      };
      await mockedStep.run(context);
      const stats = await fsp.lstat('test-project-from-cli-option/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['projectType', 'aws-node']]));
    });

    it('Should create project at not existing directory with provided template', async () => {
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.mkdir(projectName);
              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
            }
          ),
        },
      });
      configureInquirerStub(inquirer, {
        input: { projectName: 'test-project-from-provided-template' },
      });
      const context = { options: { template: 'test-template' }, stepHistory: new StepHistory() };
      await mockedStep.run(context);
      const stats = await fsp.lstat('test-project-from-provided-template/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        'https://github.com/serverless/examples/tree/v3/test-template',
        'test-template',
        'test-project-from-provided-template'
      );

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['projectName', '_user_input_']])
      );
    });

    it('Should create project at not existing directory with provided `template-url`', async () => {
      const providedTemplateUrl = 'https://github.com/serverless/examples/tree/v3/test-template';
      const downloadTemplateFromRepoStub = sinon.stub();
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
          downloadTemplateFromRepo: downloadTemplateFromRepoStub.callsFake(
            async (templateUrl, projectType, projectName) => {
              const serverlessYmlContent = `
            service: service
            provider:
              name: aws
           `;

              await fsp.mkdir(projectName);
              await fsp.writeFile(path.join(projectName, 'serverless.yml'), serverlessYmlContent);
            }
          ),
        },
      });
      configureInquirerStub(inquirer, {
        input: { projectName: 'test-project-from-provided-template-url' },
      });
      const context = {
        options: { 'template-url': providedTemplateUrl },
        stepHistory: new StepHistory(),
      };
      await mockedStep.run(context);
      const stats = await fsp.lstat('test-project-from-provided-template-url/serverless.yml');
      expect(stats.isFile()).to.be.true;
      expect(downloadTemplateFromRepoStub).to.have.been.calledWith(
        providedTemplateUrl,
        null,
        'test-project-from-provided-template-url'
      );

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['projectName', '_user_input_']])
      );
    });

    it('Should throw an error when template cannot be downloaded', async () => {
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
          downloadTemplateFromRepo: sinon.stub().callsFake(async () => {
            throw new ServerlessError();
          }),
        },
      });
      configureInquirerStub(inquirer, {
        list: { projectType: 'aws-node' },
        input: { projectName: 'test-error-during-download' },
      });
      const context = { options: {}, stepHistory: new StepHistory() };
      await expect(mockedStep.run(context)).to.be.eventually.rejected.and.have.property(
        'code',
        'TEMPLATE_DOWNLOAD_FAILED'
      );

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([
          ['projectType', 'aws-node'],
          ['projectName', '_user_input_'],
        ])
      );
    });

    it('Should throw an error when provided template cannot be found', async () => {
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
          downloadTemplateFromRepo: sinon.stub().rejects({ code: 'ENOENT' }),
        },
      });
      configureInquirerStub(inquirer, {
        input: { projectName: 'test-error-during-download' },
      });
      const context = { options: { template: 'test-template' }, stepHistory: new StepHistory() };
      await expect(mockedStep.run(context)).to.be.eventually.rejected.and.have.property(
        'code',
        'INVALID_TEMPLATE'
      );
      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['projectName', '_user_input_']])
      );
    });

    it('Should throw an error when template provided with url cannot be found', async () => {
      const mockedStep = proxyquire('../../../../../lib/cli/interactive-setup/service', {
        '../../utils/download-template-from-repo': {
          downloadTemplateFromRepo: sinon.stub().callsFake(async () => {
            throw new ServerlessError();
          }),
        },
      });
      configureInquirerStub(inquirer, {
        input: { projectName: 'test-error-during-download-custom-template' },
      });
      const context = {
        options: { 'template-url': 'test-template-url' },
        stepHistory: new StepHistory(),
      };
      await expect(mockedStep.run(context)).to.be.eventually.rejected.and.have.property(
        'code',
        'INVALID_TEMPLATE_URL'
      );

      expect(context.stepHistory.valuesMap()).to.deep.equal(
        new Map([['projectName', '_user_input_']])
      );
    });
  });

  it('Should not allow project creation in a directory in which already service is configured', async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'aws-node' },
      input: { projectName: 'existing' },
    });

    await fsp.mkdir('existing');

    const context = { options: {}, stepHistory: new StepHistory() };
    await expect(step.run(context)).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_ANSWER'
    );

    expect(context.stepHistory.valuesMap()).to.deep.equal(
      new Map([
        ['projectType', 'aws-node'],
        ['projectName', undefined],
      ])
    );
  });

  it('Should not allow project creation in a directory in which already service is configured when `name` flag provided', async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'aws-node' },
    });

    await fsp.mkdir('anotherexisting');

    const context = { options: { name: 'anotherexisting' }, stepHistory: new StepHistory() };
    await expect(step.run(context)).to.eventually.be.rejected.and.have.property(
      'code',
      'TARGET_FOLDER_ALREADY_EXISTS'
    );

    expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['projectType', 'aws-node']]));
  });

  it('Should not allow project creation using an invalid project name', async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'aws-node' },
      input: { projectName: 'elo grzegżółka' },
    });
    const context = { options: {}, stepHistory: new StepHistory() };
    await expect(step.run(context)).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_ANSWER'
    );

    expect(context.stepHistory.valuesMap()).to.deep.equal(
      new Map([
        ['projectType', 'aws-node'],
        ['projectName', undefined],
      ])
    );
  });

  it('Should not allow project creation using an invalid project name when `name` flag provided', async () => {
    configureInquirerStub(inquirer, {
      list: { projectType: 'aws-node' },
    });
    const context = { options: { name: 'elo grzegżółka' }, stepHistory: new StepHistory() };
    await expect(step.run(context)).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_PROJECT_NAME'
    );

    expect(context.stepHistory.valuesMap()).to.deep.equal(new Map([['projectType', 'aws-node']]));
  });

  it('Should not allow project creation if multiple template-related options are provided', async () => {
    await expect(
      step.run({ options: { 'template': 'some-template', 'template-url': 'https://template.com' } })
    ).to.eventually.be.rejected.and.have.property('code', 'MULTIPLE_TEMPLATE_OPTIONS_PROVIDED');
  });
});
