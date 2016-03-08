'use strict';

const SError   = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = BbPromise.promisifyAll(require('fs')),
  glob         = require('glob'),
  async        = require('async'),
  path         = require('path'),
  _            = require('lodash');

let SUtils;

class SerializerFileSystem {

  constructor(S) {
    this._S           = S;
    this._projectPath = S.config.projectPath;
    this._class       = this.constructor.name;
    SUtils            = S.utils;
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
    if (!_this._S.hasProject()) return BbPromise.resolve();

    // Load Project
    return SUtils.readFile(project.getFilePath())
      .then((projectData) => project = _.merge(project, projectData))

      // Load Templates
      .then(function() {

        let templatesFilePath = project.getRootPath('s-templates.json');

        if (SUtils.fileExistsSync(templatesFilePath)) {
          let templates = new _this._S.classes.Templates(_this._S, {}, templatesFilePath);
          return templates.load()
            .then(function (instance) {
              project.setTemplates(instance);
            });
        }
      })
      .then(function() {

        // Load Functions
        return globber(path.join(project.getRootPath(), 'functions'), 's-function.json')
          .each(function(jsonPath) {

            let funcData = SUtils.readFileSync(jsonPath);
            let func = new _this._S.classes.Function(_this._S, funcData, jsonPath);

            return func.load()
              .then(function(instance) {

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
        if (!SUtils.dirExistsSync(variablesRootPath)) return;

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
              let variables = new _this._S.classes.Variables(_this._S, {}, variablesPath);
              variables.fromObject(SUtils.readFileSync(variablesPath));
              project.setVariables(variables);

            } else {

              file = file.split('-');

              if (file.length == 1) {

                // Load Stage
                let stage = new _this._S.classes.Stage(_this._S, project, { name: file[0] });
                return stage.load()
                  .then(function (instance) {
                    project.setStage(instance);
                  });
              }
            }
          });
      })
      .then(function() {
        // Load Resources
        if (SUtils.fileExistsSync(project.getRootPath('s-resources-cf.json'))) {
          let resources = new _this._S.classes.Resources(_this._S, {}, project.getRootPath('s-resources-cf.json'));
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
    let _this   = this,
      serialize = [];

    return BbPromise
    // Save Functions
      .map(project.getAllFunctions(), (f) => serialize.push(f.save(options)))
      // Save Stages
      .then(function() {
        return BbPromise.map(project.getAllStages(), (stage) => {
          return stage.save(options);
        });
      })
      .then(function() {
        // Save Project Variables "s-variables-common.json"
        let variables     = project.getVariables();
        let variablesPath = project.getRootPath('_meta', 'variables', 's-variables-common.json');

        SUtils.writeFileSync(variablesPath, variables.toObject());

      })
      .then(function() {

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
        serialize.push(SUtils.writeFile(_this.getRootPath('s-project.json'),
          JSON.stringify(clone, null, 2)));

        return BbPromise.all(serialize);
      })
      .then(function() { return project; });
  }


  /**
   * Deserialize Function
   */

  deserializeFunction(func) {

    let _this   = this;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check function exists
        let jsonPath = func.getRootPath('s-function.json');
        if (!SUtils.fileExistsSync(jsonPath)) {
          throw new SError(`Function "${func.getName()}" could not be loaded because it does not exist in your project`);
        }

        // Set Data
        return func.fromObject(SUtils.readFileSync(jsonPath));
      })
      .then(function() {

        // Load Templates
        let templatesFilePath = func.getRootPath('s-templates.json');

        if (SUtils.fileExistsSync(templatesFilePath)) {
          let template = new _this._S.classes.Templates(_this._S, {}, templatesFilePath);
          return template.load()
            .then(function(template) {
              func.setTemplate(template);
            });
        }
      })
      .then(function() { return func; });
  }

  /**
   * Serialize Function
   */

  serializeFunction(func) {

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!func.getProject()) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

        // Save Templates
        return func.getTemplates().save();
      })
      .then(function() {

        // Delete data saved elsewhere
        let funcData = func.toObject({deep: true});
        if (funcData.templates) delete funcData.templates;

        // Save function
        return SUtils.writeFile(func.getFilePath(), funcData);
      })
      .then(() => func);
  }

  /**
   * Deserialize Resources
   */

  deserializeResources(resources) {

    let _this   = this;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Resources could not be loaded because no project path has been set on Serverless instance');

        // Set Data
        resources.fromObject(SUtils.readFileSync(resources.getFilePath()));
      })
      .then(function() { return resources; });
  }

  /**
   * Serialize Resources
   */

  serializeResources(resources) {
    let _this   = this;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Resources could not be saved because no project path has been set on Serverless instance');

        return SUtils.writeFile(resources.getProject().getRootPath('s-resources-cf.json'),
          JSON.stringify(resources.toObject(), null, 2));
      })
      .then(function() { return resources; });
  }

  /**
   * Deserialize Stage
   */

  deserializeStage(stage) {

    let _this   = this;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Stage could not be loaded because no project path has been set on Serverless instance');

        // Load Stage's Variables
        let variablesPath = stage.getProject().getRootPath('_meta', 'variables', 's-variables-' + stage.getName().toLowerCase() + '.json');
        let variables     = new _this._S.classes.Variables(_this._S, {}, variablesPath);
        variables.fromObject(SUtils.readFileSync(variablesPath));
        stage.setVariables(variables);

        // Load Stage's Regions
        return fs.readdirSync(stage.getProject().getRootPath('_meta', 'variables'));
      })

      .each(function(variableFile) {

        // Load region variables for this stage
        if (variableFile.indexOf(`s-variables-${stage.name}-`) == -1) return;

        const SRegion = _this._S.classes.Region;

        let regionName = SRegion.varsFilenameToRegionName(variableFile);
        let region = new SRegion(_this._S, stage, {name: regionName});

        return region.load()
          .then((instance) => stage.setRegion(instance));
      })
      .then(function() { return stage; });
  }

  /**
   * Serialize Stage
   */

  serializeStage(stage) {

    let _this   = this;

    return BbPromise.try(function() {
        // Validate: Check project path is set
        if (!stage._S.hasProject()) throw new SError('Stage could not be saved because no project path has been set on Serverless instance');

        // Save Stage's Variables
        let variablesPath = stage.getProject().getRootPath('_meta', 'variables', 's-variables-' + stage.getName().toLowerCase() + '.json');

        SUtils.writeFileSync(variablesPath,
          JSON.stringify(stage.getVariables().toObject(), null, 2));

        return stage.getAllRegions();
      })
      .each(function(region) {
        // Save Stage's Regions
        return region.save();
      })
      .then(function() { return stage; });
  }

  /**
   * Deserialize Region
   */

  deserializeRegion(region) {
    let _this   = this;

    return BbPromise.try(function() {


        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Region could not be loaded because no project path has been set on Serverless instance');

        // Load region's Variables
        let variablesPath = region.getProject().getRootPath('_meta', 'variables', 's-variables-' + region.getStage().getName().toLowerCase() + '-' + region.getName().toLowerCase().replace(/-/g, '') + '.json');
        let variables     = new _this._S.classes.Variables(_this._S, {}, variablesPath);

        variables.fromObject(SUtils.readFileSync(variablesPath));
        region.setVariables(variables);
      })
      .then(function() {
        return region;
      });
  }

  /**
   * Serialize Region
   */

  serializeRegion(region) {
    let _this   = this;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!region._S.hasProject()) throw new SError('Region could not be saved because no project path has been set on Serverless instance');

        // Save region's Variables
        let variablesPath = region.getProject().getRootPath('_meta', 'variables', 's-variables-' + region.getStage().getName().toLowerCase() + '-' + region.getName().toLowerCase().replace(/-/g, '') + '.json');

        SUtils.writeFileSync(variablesPath,
          JSON.stringify(region.getVariables().toObject(), null, 2));
      })
      .then(function() { return region; });
  }

  /**
   * Deserialize Templates
   */

  deserializeTemplates(templates) {
    let _this   = this;

    if (!templates.getFilePath()) return BbPromise.resolve();

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!templates._S.hasProject()) throw new SError('Templates could not be loaded because no project path has been set on Serverless instance');

        // Set Data
        templates.fromObject(SUtils.readFileSync(templates.getFilePath()));
      })
      .then(function() {

        // Skip this, if we are in the project or component root,
        if (SUtils.fileExistsSync(templates.getRootPath('s-project.json'))) {
          return;
        }

        // People can store s-templates.json in infinite subfolders in their components.  We have to find these...
        // Loop through parent dirs and find parent templates until hitting component root
        let parents = [],
          parentDir = templates.getRootPath(),
          notRoot   = true;

        while (notRoot) {
          parentDir = path.join(parentDir, '..');
          notRoot = SUtils.fileExistsSync(path.join(parentDir, 's-project.json'));
          if (SUtils.fileExistsSync(path.join(parentDir, 's-templates.json'))) {
            parents.push(new _this._S.classes.Templates(
              _this._S,
              SUtils.readFileSync(path.join(parentDir, 's-templates.json')),
                path.join(parentDir, 's-templates.json')))
          }
        }

        templates.setParents(parents);
      })
      .then(function() { return templates; });
  }

  /**
   * Serialize Templates
   * - Does not save template parents and may not need to.
   */

  serializeTemplates(templates) {

    let _this   = this;

    // Skip if template does not have filePath
    if (!templates.getRootPath()) return BbPromise.resolve();

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Templates could not be saved because no project path has been set on Serverless instance');
        let tempaltesObj = templates.toObject()

        if (_.isEmpty(tempaltesObj)) {
          if (SUtils.fileExistsSync(templates.getFilePath())) {
            return fs.unlinkAsync(templates.getFilePath());
          }
        } else {
          return SUtils.writeFile(templates.getFilePath(), tempaltesObj);
        }

      })
      .then(function() { return templates; });
  }
}

module.exports = SerializerFileSystem;

/**
 * Globber
 * - Matches are sorted
 */

function globber(root, fileName) {
  return new BbPromise(function(resolve, reject) {
    return glob(`${root}/**/${fileName}`, function (err, files) {
      if (err) return reject(err);
      resolve(files);
    });
  });
}