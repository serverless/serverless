'use strict';

const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const step = require('../../../../../lib/cli/interactive-setup/service');

const templatesPath = path.resolve(__dirname, '../../../../../lib/plugins/create/templates');

const { expect } = chai;

chai.use(require('chai-as-promised'));

const fsp = require('fs').promises;
const inquirer = require('@serverless/utils/inquirer');

const confirmEmptyWorkingDir = async () =>
  expect(await fsp.readdir(process.cwd())).to.deep.equal([]);

describe('test/unit/lib/cli/interactive-setup/service.test.js', () => {
  afterEach(() => sinon.restore());

  it('Should be not applied, when at service path', () =>
    expect(step.isApplicable({ serviceDir: '/foo' })).to.equal(false));
  it('Should be applied, when not at service path', () =>
    expect(step.isApplicable({})).to.equal(true));

  it("Should abort if user doesn't want setup", async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: false },
    });
    await step.run({});
    return confirmEmptyWorkingDir();
  });

  it("Should abort if user choses 'other' template", async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'other' },
    });
    await step.run({});
    return confirmEmptyWorkingDir();
  });

  describe('Create new project', () => {
    it('Should create project at not existing directory', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: 'test-project' },
      });
      await step.run({});
      const stats = await fsp.lstat('test-project/serverless.yml');
      expect(stats.isFile()).to.be.true;
    });

    it('Should create project at not existing directory from a provided `template-path`', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        input: { projectName: 'test-project-from-local-template' },
      });
      await step.run({ options: { 'template-path': path.join(templatesPath, 'aws-nodejs') } });
      const stats = await fsp.lstat('test-project-from-local-template/serverless.yml');
      expect(stats.isFile()).to.be.true;
    });
  });

  it('Should not allow project creation in a directory in which already service is configured', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'aws-nodejs' },
      input: { projectName: 'existing' },
    });

    await fsp.mkdir('existing');

    await expect(step.run({})).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_ANSWER'
    );
  });

  it('Should not allow project creation using an invalid project name', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'aws-nodejs' },
      input: { projectName: 'elo grzegżółka' },
    });
    await expect(step.run({})).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_ANSWER'
    );
  });
});
