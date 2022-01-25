'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const untildify = require('untildify');

const ServerlessError = require('../../serverless-error');
const cliCommandsSchema = require('../../cli/commands-schema');
const createFromTemplate = require('../../utils/create-from-template');
const recommendedTemplatesList = require('../../templates/recommended-list');
const humanReadableTemplatesList = require('../../templates/recommended-list/human-readable');
const download = require('../../utils/download-template-from-repo');
const renameService = require('../../utils/rename-service').renameService;
const copyDirContentsSync = require('../../utils/fs/copy-dir-contents-sync');
const dirExistsSync = require('../../utils/fs/dir-exists-sync');
const { progress, log, style } = require('@serverless/utils/log');

const handleServiceCreationError = (error) => {
  if (error.code !== 'EACCESS') throw error;
  const errorMessage = [
    'Error unable to create a service in this directory. ',
    'Please check that you have the required permissions to write to the directory',
  ].join('');

  throw new ServerlessError(errorMessage, 'UNABLE_TO_CREATE_SERVICE');
};

const mainProgress = progress.get('main');

class Create {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      create: {
        ...cliCommandsSchema.get('create'),
      },
    };

    this.hooks = {
      'create:create': async () => BbPromise.bind(this).then(this.create),
    };
  }

  async create() {
    if ('template' in this.options) {
      return this.createFromTemplate();
    } else if ('template-url' in this.options) {
      // We only show progress in case of setup from `template-url` as setting up from local files is fast
      mainProgress.notice('Setting up new project', { isMainEvent: true });
      return download
        .downloadTemplateFromRepo(
          this.options['template-url'],
          this.options.name,
          this.options.path
        )
        .then((serviceName) => {
          log.notice();
          log.notice.success(
            `Project successfully created in "${
              this.options.path || `./${serviceName}`
            }" ${style.aside(
              `(${Math.floor(
                (Date.now() - this.serverless.pluginManager.commandRunStartTime) / 1000
              )}s)`
            )}`
          );
        })
        .catch((err) => {
          throw new ServerlessError(err, 'BOILERPLATE_GENERATION_ERROR');
        });
    } else if ('template-path' in this.options) {
      // Copying template from a local directory
      const serviceDir = this.options.path
        ? path.resolve(process.cwd(), untildify(this.options.path))
        : path.join(process.cwd(), this.options.name);
      if (dirExistsSync(serviceDir)) {
        const errorMessage = `A folder named "${serviceDir}" already exists.`;
        throw new ServerlessError(errorMessage, 'TARGET_FOLDER_ALREADY_EXISTS');
      }
      copyDirContentsSync(untildify(this.options['template-path']), serviceDir, {
        noLinks: true,
      });
      if (this.options.name) {
        renameService(this.options.name, serviceDir);
      }
      log.notice();
      log.notice.success(
        `Project sucessfully created in "${this.options.path || `./${this.options.name}`}"`
      );
    } else {
      const errorMessage = [
        'You must either pass a template name (--template), ',
        'a URL (--template-url) or a local path (--template-path).',
      ].join('');
      throw new ServerlessError(errorMessage, 'MISSING_TEMPLATE_CLI_PARAM');
    }
    return BbPromise.resolve();
  }

  async createFromTemplate() {
    const notPlugin = this.options.template !== 'plugin';

    if (!recommendedTemplatesList.includes(this.options.template)) {
      const errorMessage = [
        `Template "${this.options.template}" is not supported.`,
        ` Supported templates are: ${humanReadableTemplatesList}.`,
      ].join('');
      throw new ServerlessError(errorMessage, 'NOT_SUPPORTED_TEMPLATE');
    }

    // store the custom options for the service if given
    const boilerplatePath = this.options.path && String(this.options.path);
    const serviceName = this.options.name && String(this.options.name);
    const templateSrcDir = path.join(
      this.serverless.config.serverlessPath,
      'plugins',
      'create',
      'templates',
      this.options.template
    );

    // create (if not yet present) and chdir into the directory for the service
    if (boilerplatePath) {
      const newPath = path.resolve(process.cwd(), untildify(boilerplatePath));

      if (this.serverless.utils.dirExistsSync(newPath)) {
        const errorMessage = [
          `The directory "${newPath}" already exists, and serverless will not overwrite it. `,
          'Rename or move the directory and try again if you want serverless to create it"',
        ].join('');

        throw new ServerlessError(errorMessage, 'TARGET_FOLDER_ALREADY_EXISTS');
      }

      fse.mkdirsSync(newPath);
      process.chdir(newPath);
    } else {
      // ensure no template file already exists in cwd that we may overwrite
      const templateFullFilePaths = this.serverless.utils.walkDirSync(templateSrcDir);

      templateFullFilePaths.forEach((ffp) => {
        const filename = path.basename(ffp);
        if (this.serverless.utils.fileExistsSync(path.join(process.cwd(), filename))) {
          const errorMessage = [
            `The file "${filename}" already exists, and serverless will not overwrite it. `,
            `Move the file and try again if you want serverless to write a new "${filename}"`,
          ].join('');

          throw new ServerlessError(errorMessage, 'TEMPLATE_FILE_ALREADY_EXISTS');
        }
      });
    }

    if (!notPlugin) {
      return BbPromise.try(() => {
        try {
          fse.copySync(
            path.join(__dirname, '../../../lib/plugins/create/templates', this.options.template),
            process.cwd()
          );
        } catch (error) {
          handleServiceCreationError(error);
        }
      });
    }

    this.serverless.serviceDir = process.cwd();

    return createFromTemplate(this.options.template, process.cwd(), { name: serviceName }).then(
      () => {
        log.notice();
        log.notice.success(
          `Project sucessfully created in "${this.options.path || './'}" from "${
            this.options.template
          }" template`
        );

        if (!(boilerplatePath || serviceName) && notPlugin) {
          log.notice();
          log.notice(
            style.aside(
              'Please update the "service" property in serverless.yml with your service name'
            )
          );
        }
      },
      handleServiceCreationError
    );
  }
}

module.exports = Create;
