'use strict';

const chai = require('chai');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const { expect } = chai;

chai.use(require('chai-as-promised'));

const { join } = require('path');
const { remove: rmDir, lstat } = require('fs-extra');
const runServerless = require('../../../../utils/run-serverless');
const inquirer = require('@serverless/utils/inquirer');

const fixturesPath = join(__dirname, 'fixtures');
const lifecycleHookNamesBlacklist = [
  'before:interactiveCli:setupAws',
  'interactiveCli:setupAws',
  'interactiveCli:autoUpdate',
  'interactiveCli:tabCompletion',
];

describe('interactiveCli: initializeService', () => {
  const existingProjectName = 'some-other-service';
  const newProjectName = 'foo-bar';
  const newProjectPath = join(fixturesPath, newProjectName);
  let backupIsTTY;

  before(() => {
    backupIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
  });
  after(() => (process.stdin.isTTY = backupIsTTY));

  afterEach(() => sinon.restore());

  it('Should be ineffective, when at service path', async () =>
    runServerless({
      cwd: join(fixturesPath, 'some-other-service'),
      command: '',
      lifecycleHookNamesBlacklist,
    }));

  it("Should abort if user doesn't want setup", async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: false },
    });
    return runServerless({
      cwd: fixturesPath,
      command: '',
      pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
      lifecycleHookNamesBlacklist,
    });
  });

  it("Should abort if user choses 'other' template", async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'other' },
    });
    return runServerless({
      cwd: fixturesPath,
      command: '',
      pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
      lifecycleHookNamesBlacklist,
    });
  });

  describe('Create new project', () => {
    after(async () => rmDir(newProjectPath));

    it('Should create project at not existing directory', async () => {
      configureInquirerStub(inquirer, {
        confirm: { shouldCreateNewProject: true },
        list: { projectType: 'aws-nodejs' },
        input: { projectName: newProjectName },
      });
      await runServerless({
        cwd: fixturesPath,
        command: '',
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesBlacklist,
      });
      const stats = await lstat(join(newProjectPath, 'serverless.yml'));
      expect(stats.isFile()).to.be.true;
    });
  });

  it('Should not allow project creation in a directory in which already service is configured', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'aws-nodejs' },
      input: { projectName: existingProjectName },
    });

    await expect(
      runServerless({
        cwd: fixturesPath,
        command: '',
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesBlacklist,
      })
    ).to.eventually.be.rejected.and.have.property('code', 'INVALID_ANSWER');
  });

  it('Should not allow project creation using an invalid project name', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldCreateNewProject: true },
      list: { projectType: 'aws-nodejs' },
      input: { projectName: 'elo grzegżółka' },
    });
    await expect(
      runServerless({
        cwd: fixturesPath,
        command: '',
        pluginPathsWhitelist: ['./lib/plugins/interactiveCli'],
        lifecycleHookNamesBlacklist,
      })
    ).to.eventually.be.rejected.and.have.property('code', 'INVALID_ANSWER');
  });
});
