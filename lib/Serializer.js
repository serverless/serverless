'use strict';

const SError   = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = BbPromise.promisifyAll(require('fs')),
  glob         = require('glob'),
  async        = require('async'),
  path         = require('path'),
  yaml         = require('js-yaml'),
  _            = require('lodash');

// TODO: Add Variables de/serialization methods

module.exports = function(S) {

  class Serializer {

    constructor() {
      this._class = this.constructor.name;
    }

    serialize() {
      return this['serialize' + this.constructor.name](this);
    }

    deserialize() {
      return this['deserialize' + this.constructor.name](this);
    }

    /**
     * Deserialize Project
     */

    deserializeProject(project) {

      let _this = this;

      // Skip if project does not exist
      if (!S.hasProject()) return BbPromise.resolve();

      // Load Project
      return S.utils.readFile(project.getFilePath())
        .then((projectData) => project = _.merge(project, projectData))

        // Load Templates
        .then(function () {

          return BbPromise.mapSeries([ 's-templates.json', 's-templates.yaml' ], (filename) => {
            // Load Templates
            let templatesFilePath = project.getRootPath(filename);

            if (S.utils.fileExistsSync(templatesFilePath)) {
              let template = new S.classes.Templates({}, templatesFilePath);
              return template.load();
            }
            return null;
          })
          .filter((template) => { return template != null })
          .then(function (templates) {
            if (templates.length > 0) {
              project.setTemplates(templates[0]);
            }
          });
        })
        .then(function () {
          S.utils.sDebug(`deserializeProject: Load functions`);
          // Load Functions
          return globber(project.getRootPath(), 's-function.json')
            .each(function (jsonPath) {
              S.utils.sDebug(`deserializeProject: Load function: ${jsonPath}`);

              let funcData = S.utils.readFileSync(jsonPath);

              // Check function has a runtime property
              if (!funcData.runtime) {
                throw new SError(`Functions must have a runtime property as of Serverless v0.5`);
              }

              let func = new S.classes.Function(funcData, jsonPath);

              return func.load()
                .then(function (instance) {
                  // Check for function name uniqueness across project
                  if (project.getFunction(instance.name)) {
                    throw new SError(`Function name "${instance.name}" is already taken in the project. Function names must be unique across a project as of Serverless v0.5`);
                  }

                  project.setFunction(instance);
                });
            });
        })
        .then(function () {

          // Load Project Variables & Stages
          let variablesRootPath = project.getRootPath('_meta', 'variables');

          // Skip if _meta/variables does not exist
          if (!S.utils.dirExistsSync(variablesRootPath)) return;

          let variableFiles = fs.readdirSync(variablesRootPath);

          return BbPromise.resolve(variableFiles)
            .each(function (variableFile) {

              // Skip unrelated and hidden files
              if (!variableFile || variableFile.charAt(0) === '.' || variableFile.indexOf('s-variables') == -1) return;

              // Parse file name to get stage/region
              let file = variableFile.replace('s-variables-', '').replace('.json', '');

              if (file === 'common') {

                // Load Variables
                let variablesPath = path.join(variablesRootPath, 's-variables-common.json');
                let variables = new S.classes.Variables({}, variablesPath);
                variables.fromObject(S.utils.readFileSync(variablesPath));
                project.setVariables(variables);

              } else {

                file = file.split('-');

                if (file.length == 1) {

                  // Load Stage
                  let stage = new S.classes.Stage({name: file[0]});
                  return stage.load()
                    .then(function (instance) {
                      project.setStage(instance);
                    });
                }
              }
            });
        })
        .then(function () {
          // Load Resources
          if (S.utils.fileExistsSync(project.getRootPath('s-resources-cf.json'))) {
            let resources = new S.classes.Resources({}, project.getRootPath('s-resources-cf.json'));
            return resources.load();
          }
        })
        .then(function (resources) {
          project.setResources(resources);
          return project;
        });
    }

    /**
     * Serialize Project
     */

    serializeProject(project, options) {
      let _this = this,
        serialize = [];

      return BbPromise
      // Save Functions
        .map(project.getAllFunctions(), (f) => serialize.push(f.save(options)))
        // Save Stages
        .then(function () {
          return BbPromise.map(project.getAllStages(), (stage) => {
            return stage.save(options);
          });
        })
        .then(function () {
          // Save Project Variables "s-variables-common.json"
          let variables = project.getVariables();
          let variablesPath = project.getRootPath('_meta', 'variables', 's-variables-common.json');

          S.utils.writeFileSync(variablesPath, variables.toObject());

        })
        .then(function () {

          // Save Variables, Resources & Templates
          serialize.push(project.getTemplates().save());
          serialize.push(project.getAllResources().save());

          // Clone and remove properties saved elsewhere
          let clone = project.toObject();
          if (clone.functions) delete clone.functions;
          if (clone.resources)  delete clone.resources;
          if (clone.stages)     delete clone.stages;
          if (clone.variables)  delete clone.variables;
          if (clone.templates)  delete clone.templates;

          // Save s-project.json
          serialize.push(S.utils.writeFile(_this.getRootPath('s-project.json'),
            JSON.stringify(clone, null, 2)));

          return BbPromise.all(serialize);
        })
        .then(function () {
          return project;
        });
    }


    /**
     * Deserialize Function
     */

    deserializeFunction(func) {

      let _this = this;

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

          // Validate: Check function exists
          let jsonPath = func.getRootPath('s-function.json');
          if (!S.utils.fileExistsSync(jsonPath)) {
            throw new SError(`Function "${func.getName()}" could not be loaded because it does not exist in your project`);
          }

          // Set Data
          return func.fromObject(S.utils.readFileSync(jsonPath));
        })
        .then(function () {

          return BbPromise.mapSeries([ 's-templates.json', 's-templates.yaml' ], (filename) => {
            // Load Templates
            let templatesFilePath = func.getRootPath(filename);

            if (S.utils.fileExistsSync(templatesFilePath)) {
              let template = new S.classes.Templates({}, templatesFilePath);
              return template.load();
            }
            return null;
          })
          .filter(template => { return template != null })
          .then(function (templates) {
            if (templates.length > 0) {
              func.setTemplate(templates[0]);
            }
          });
        })
        .then(function () {
          return func;
        });
    }

    /**
     * Serialize Function
     */

    serializeFunction(func) {

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!func.getProject()) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

          // Save Templates
          return func.getTemplates().save();
        })
        .then(function () {

          // Delete data saved elsewhere
          let funcData = func.toObject({deep: true});
          if (funcData.templates) delete funcData.templates;

          // Save function
          return S.utils.writeFile(func.getFilePath(), funcData);
        })
        .then(() => func);
    }

    /**
     * Deserialize Resources
     */

    deserializeResources(resources) {

      let _this = this;

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Resources could not be loaded because no project path has been set on Serverless instance');

          // Set Data
          resources.fromObject(S.utils.readFileSync(resources.getFilePath()));
        })
        .then(function () {
          return resources;
        });
    }

    /**
     * Serialize Resources
     */

    serializeResources(resources) {
      let _this = this;

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Resources could not be saved because no project path has been set on Serverless instance');

          return S.utils.writeFile(resources.getProject().getRootPath('s-resources-cf.json'),
            JSON.stringify(resources.toObject(), null, 2));
        })
        .then(function () {
          return resources;
        });
    }

    /**
     * Deserialize Stage
     */

    deserializeStage(stage) {

      let _this = this;

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Stage could not be loaded because no project path has been set on Serverless instance');

          // Load Stage's Variables
          let variablesPath = stage.getProject().getRootPath('_meta', 'variables', 's-variables-' + stage.getName().toLowerCase() + '.json');
          let variables = new S.classes.Variables({}, variablesPath);
          variables.fromObject(S.utils.readFileSync(variablesPath));
          stage.setVariables(variables);

          // Load Stage's Regions
          return fs.readdirSync(stage.getProject().getRootPath('_meta', 'variables'));
        })

        .each(function (variableFile) {

          // Load region variables for this stage
          if (variableFile.indexOf(`s-variables-${stage.name}-`) == -1) return;

          const SRegion = S.classes.Region;

          let regionName = SRegion.varsFilenameToRegionName(variableFile);
          let region     = new SRegion({ name: regionName }, stage);

          return region.load()
            .then((instance) => stage.setRegion(instance));
        })
        .then(function () {
          return stage;
        });
    }

    /**
     * Serialize Stage
     */

    serializeStage(stage) {

      let _this = this;

      return BbPromise.try(function () {
          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Stage could not be saved because no project path has been set on Serverless instance');

          // Save Stage's Variables
          let variablesPath = stage.getProject().getRootPath('_meta', 'variables', 's-variables-' + stage.getName().toLowerCase() + '.json');

          S.utils.writeFileSync(variablesPath,
            JSON.stringify(stage.getVariables().toObject(), null, 2));

          return stage.getAllRegions();
        })
        .each(function (region) {
          // Save Stage's Regions
          return region.save();
        })
        .then(function () {
          return stage;
        });
    }

    /**
     * Deserialize Region
     */

    deserializeRegion(region) {
      let _this = this;

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Region could not be loaded because no project path has been set on Serverless instance');

          // Load region's Variables
          let variablesPath = region.getProject().getRootPath('_meta', 'variables', 's-variables-' + region.getStage().getName().toLowerCase() + '-' + region.getName().toLowerCase().replace(/-/g, '') + '.json');
          let variables = new S.classes.Variables({}, variablesPath);

          variables.fromObject(S.utils.readFileSync(variablesPath));
          region.setVariables(variables);
        })
        .then(function () {
          return region;
        });
    }

    /**
     * Serialize Region
     */

    serializeRegion(region) {
      let _this = this;

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Region could not be saved because no project path has been set on Serverless instance');

          // Save region's Variables
          let variablesPath = region.getProject().getRootPath('_meta', 'variables', 's-variables-' + region.getStage().getName().toLowerCase() + '-' + region.getName().toLowerCase().replace(/-/g, '') + '.json');

          S.utils.writeFileSync(variablesPath,
            JSON.stringify(region.getVariables().toObject(), null, 2));
        })
        .then(function () {
          return region;
        });
    }

    /**
     * Deserialize Templates
     */

    deserializeTemplates(templates) {
      let _this = this;

      if (!templates.getFilePath()) return BbPromise.resolve();

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Templates could not be loaded because no project path has been set on Serverless instance');

          // Set Data
          let filePath = templates.getFilePath();
          if (_.endsWith(filePath, '.yaml')) {
            templates.fromObject(yaml.safeLoad(S.utils.readFileSync(filePath)));
          } else {
            templates.fromObject(S.utils.readFileSync(filePath));
          }
        })
        .then(function () {

          // Skip this, if we are in the project or component root,
          if (S.utils.fileExistsSync(templates.getRootPath('s-project.json'))) {
            return;
          }

          // People can store s-templates.json in infinite subfolders in their components.  We have to find these...
          // Loop through parent dirs and find parent templates until hitting component root
          let parents = [],
            parentDir = templates.getRootPath(),
            notRoot = true;

          while (notRoot) {
            parentDir = path.dirname(parentDir);
            notRoot = !S.utils.fileExistsSync(path.join(parentDir, 's-project.json'));
            if (notRoot) {
              if (S.utils.fileExistsSync(path.join(parentDir, 's-templates.json'))) {
                parents.push(new S.classes.Templates(
                    S.utils.readFileSync(path.join(parentDir, 's-templates.json')),
                    path.join(parentDir, 's-templates.json')))
              } else if (S.utils.fileExistsSync(path.join(parentDir, 's-templates.yaml'))) {
                parents.push(new S.classes.Templates(
                    yaml.safeLoad(S.utils.readFileSync(path.join(parentDir, 's-templates.yaml'))),
                    path.join(parentDir, 's-templates.yaml')))
              }
            }
          }
          templates.setParents(parents);
        })
        .then(function () {
          return templates;
        });
    }

    /**
     * Serialize Templates
     * - Does not save template parents and may not need to.
     */

    serializeTemplates(templates) {

      let _this = this;

      // Skip if template does not have filePath
      if (!templates.getRootPath()) return BbPromise.resolve();

      return BbPromise.try(function () {

          // Validate: Check project path is set
          if (!S.hasProject()) throw new SError('Templates could not be saved because no project path has been set on Serverless instance');
          let templatesObj = templates.toObject()

          if (_.isEmpty(templatesObj)) {
            if (S.utils.fileExistsSync(templates.getFilePath())) {
              return fs.unlinkAsync(templates.getFilePath());
            }
          } else {
            if (_.endsWith(templates.getFilePath(), '.yaml')) {
              return S.utils.writeFile(templates.getFilePath(), yaml.safeDump(templatesObj));
            }
            return S.utils.writeFile(templates.getFilePath(), templatesObj);
          }

        })
        .then(function () {
          return templates;
        });
    }
  }

  return Serializer;

};

/**
 * Globber
 * - Matches are sorted
 */

function globber(root, fileName) {

  return new BbPromise(function(resolve, reject) {

    const opts = { ignore: [
      `${root}/_meta/**`,
      `**/node_modules/**`
    ]};

    return glob(`${root}/**/${fileName}`, opts, function (err, files) {
      if (err) return reject(err);
      resolve(files);
    });
  });
}