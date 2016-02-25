'use strict';

const SError   = require('./Error'),
  fs           = require('fs'),
  fse          = require('fs-extra'),
  glob         = require('glob'),
  async        = require('async'),
  path         = require('path'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

let SUtils;

class SerializerFileSystem {

  constructor(S) {
    this._S           = S;
    this._projectPath = S.config.projectPath;
    SUtils            = S.utils;
    this._class       = this.constructor.name;
  }

  serialize(asset) {
    return this['serialize' + asset.constructor.name](asset);
  }

  deserialize(asset) {
    return this['deserialize' + asset.constructor.name](asset);
  }

  /**
   * Deserialize Project
   */

  deserializeProject(project) {

    let _this = this;

    // Skip if project does not exist
    if (!_this._S.hasProject()) return BbPromise.resolve();

    // Load Project
    return SUtils.readFile(path.join(this._projectPath, 's-project.json'))
      .then((projectData) => project = _.merge(project, projectData))
      // Load Templates
      .then(function() {
        if (SUtils.fileExistsSync(path.join(_this._projectPath, 's-templates.json'))) {
          let templates = new _this._S.classes.Templates(_this._S, path.join(_this._projectPath, 's-templates.json'));
          return templates.load()
            .then(function (instance) {
              project._templates = instance;
            });
        }
      })

      // Iterate through project contents
      .then(() => fs.readdirSync(_this._projectPath))
      .map((componentName) => {
        let componentJsonPath = this._S.getProject().getFilePath(componentName, 's-component.json');

        if (!SUtils.fileExistsSync(componentJsonPath)) return;

        let componentData = SUtils.readFileSync(componentJsonPath);

        // Load Component
        let component = new _this._S.classes.Component(_this._S, project, componentData.name, componentData.runtime);
        return component.load()
          .then(function (instance) {
            project.setComponent(instance);
          });
      })
      .then(function () {

        // Load Project Variables & Stages
        let variablesRootPath = path.join(_this._projectPath, '_meta', 'variables');

        // Skip if _meta/variables does not exist
        if (!SUtils.dirExistsSync(variablesRootPath)) return;

        let variableFiles = fs.readdirSync(_this.getFilePath('_meta', 'variables'));

        return BbPromise.resolve(variableFiles)
          .each(function (variableFile) {

            // Skip unrelated and hidden files
            if (!variableFile || variableFile.charAt(0) === '.' || variableFile.indexOf('s-variables') == -1) return;

            // Parse file name to get stage/region
            let file = variableFile.replace('s-variables-', '').replace('.json', '');

            if (file === 'common') {

              // Load Variables
              let variables = new _this._S.classes.Variables(_this._S);
              let variablesPath = project.getFilePath('_meta', 'variables', 's-variables-common.json');
              variables.fromObject(SUtils.readFileSync(variablesPath));
              project.setVariables(variables);

            } else {

              file = file.split('-');

              if (file.length == 1) {

                // Load Stage
                let stage = new _this._S.classes.Stage(_this._S, project, file[0]);
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
        if (SUtils.fileExistsSync(path.join(_this._projectPath, 's-resources-cf.json'))) {
          let resources = new _this._S.classes.Resources(_this._S);
          return resources.load()
        }
      })
      .then(function () {
        return project;
      });
  }

  /**
   * Serialize Project
   */

  serializeProject(project, options) {

    let _this   = this,
      serialize = [];

    return new BbPromise.try(function() {

      // Save Components
      return BbPromise.resolve(project.getAllComponents())
        .each(function (c) {
          serialize.push(c.save(options));
        });
    })
      .then(function() {

        // Save Stages
        return BbPromise.resolve(project.getStages())
          .each(function (stageName) {
            let stage = project.getStage(stageName);
            return stage.save(options);
          });
      })
      .then(function() {

        // Save Project Variables "s-variables-common.json"
        let variables     = project.getVariables();
        let variablesPath = project.getFilePath('_meta', 'variables', 's-variables-common.json');
        SUtils.writeFileSync(variablesPath, variables.toObject());

      })
      .then(function() {

        // Save Variables, Resources & Templates
        serialize.push(project.getTemplates().save());
        serialize.push(project.getResources().save());

        // Clone and remove properties saved elsewhere
        let clone = project.toObject();
        if (clone.components) delete clone.components;
        if (clone.resources)  delete clone.resources;
        if (clone.stages)     delete clone.stages;
        if (clone.variables)  delete clone.variables;
        if (clone.templates)  delete clone.templates;

        // Save s-project.json
        serialize.push(SUtils.writeFile(_this.getFilePath('s-project.json'),
          JSON.stringify(clone, null, 2)));

        return BbPromise.all(serialize);
      })
      .then(function() { return project; });
  }

  /**
   * Deserialize Component
   */

  deserializeComponent(component) {

    let _this   = this,
      componentDir;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Component could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check component exists

        let componentJsonFilePath = component.getProject().getFilePath(component.name, 's-component.json');

        if (!SUtils.fileExistsSync(componentJsonFilePath)) {
          throw new SError(`Component with the name of ${component.name} does not exist in your project.  Ensure your component's folder name is the same as its name.`);
        }
        // Load Component
        component = _.merge(component, SUtils.readFileSync(componentJsonFilePath));
      })
      .then(() => {
        let templatesFilePath = component.getProject().getFilePath(component.name, 's-templates.json');

        if (SUtils.fileExistsSync(templatesFilePath)) {

          let template = new _this._S.classes.Templates(_this._S, templatesFilePath);

          template.setParents([component.getProject().getTemplates().toObject()])

          return template.load()
            .then(template => component.setTemplates(template));
        }
        else {
          component.setTemplates([component.getProject().getTemplates()])
        }
      })
      .then(function() {

        // Load Functions
        return globber(componentDir, 's-function.json')
          .each(function(jsonPath) {
            let rootPath = path.dirname(jsonPath);
            let funcData = SUtils.readFileSync(jsonPath)
            let func = new _this._S.classes.Function(_this._S, component, rootPath, funcData.name);

            return func.load()
              .then(function(instance) {

                // Check for function name uniqueness across project
                let components = component.getProject().getAllComponents();
                components.forEach(function(c) {
                  if (c.functions[instance.name]) {
                    throw new SError(`Function name "${instance.name}" (${rootPath}) is already taken in the project. Function names must be unique across a project as of Serverless v0.5`);
                  }
                });

                component.functions[instance.name] = instance;
              });
          });
      })
      .then(function() {

        // Reset Runtime
        component.setRuntime( component.runtime );
        return component;
      });
  }

  /**
   * Serialize Component
   */

  serializeComponent(component, options) {

    let _this   = this,
      serialize = [];

    return new BbPromise.try(function () {
      // Save Functions
      if (options && options.deep) {
        return BbPromise.resolve(component.getAllFunctions())
          .each(function (f) {
            serialize.push(f.save(options));
          });
      }
    })
      .then(function () {

        // Save s-component.json
        serialize.push(SUtils.writeFile(component._config.filePath,
          JSON.stringify(component.toObject(), null, 2)));

        return BbPromise.all(serialize);
      })
      .then(function() { return component; });
  }

  /**
   * Deserialize Function
   */

  deserializeFunction(func) {

    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check function exists

        let jsonPath = func.getFilePath('s-function.json');

        if (!SUtils.fileExistsSync(jsonPath)) {
          throw new SError(`Function "${func.getName()}" could not be loaded because it does not exist in your project`);
        }

        // Set Data

        return func.fromObject(SUtils.readFileSync(jsonPath));
      })
      .then(function() {

        // Load Templates
        let templatesFilePath = func.getFilePath('s-templates.json');

        if (SUtils.fileExistsSync(templatesFilePath)) {

          let template = new _this._S.classes.Templates(_this._S, templatesFilePath);

          let getParentTemplates = function (childPath, templates) {
            templates = templates || {};
            let parentPath = path.resolve(childPath, '..');

            if (parentPath.endsWith(func.getProject().getFilePath(func.getComponent().name))) return templates;

            let jsonPath = path.join(parentPath, 's-templates.json');

            if (SUtils.fileExistsSync(jsonPath)) {
              templates = _.defaults(templates, SUtils.readFileSync(jsonPath));
            }

            return getParentTemplates(parentPath, templates);
          }




          return template.load()
            .then(function(template) {
              let componentTemplates = func.getComponent().getTemplates().toObject()

              template.setParents([componentTemplates, getParentTemplates(func.getFilePath())]);
              func.setTemplate(template);
              return func;
            });
        }
      })
      .then(function() { return func; });
  }

  /**
   * Serialize Function
   */

  serializeFunction(func) {
    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

        return SUtils.writeFile(func.getFilePath(),
          JSON.stringify(func.toObject({ deep: true }), null, 2));
      })
      .then(function() {

        // Save Templates
        if (fse.ensureFileSync(path.join(func.getFilePath(), 's-templates.json'))) {
          let template = func.getTemplates();
          return template.save();
        }
      })
      .then(function() { return func; });
  }

  /**
   * Deserialize Resources
   */

  deserializeResources(resources) {

    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Resources could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check resources exists
        //if (!SUtils.fileExistsSync(resources.getProject().getFilePath())) return resources;

        // Set Data
        resources.fromObject(SUtils.readFileSync(resources.getProject().getFilePath('s-resources-cf.json')));


      })
      .then(function() {

        // TODO: Remove this eventually when we introduce multiple Resource stacks in a single project
        // TODO: Needs to read s-module.json as well for back compa tsupport
        // Get Partials
        return globber(resources.getProject().getFilePath(), 's-resources-cf.json')
          .each(function(partialPath) {
            resources._setPartial({ filePath: partialPath, partial: SUtils.readFileSync(partialPath)});
          });
      })
      .then(function() { return resources; });
  }

  /**
   * Serialize Resources
   */

  serializeResources(resources) {
    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Resources could not be saved because no project path has been set on Serverless instance');

        return SUtils.writeFile(resources.getProject().getFilePath('s-resources-cf.json'),
          JSON.stringify(resources.toObject(), null, 2));
      })
      .then(function() {
        return resources._partials;
      })
      .each(function(partial) {
        return SUtils.writeFile(partial.filePath,
          JSON.stringify(partial.partial, null, 2));
      })
      .then(function() { return resources; });
  }

  /**
   * Deserialize Stage
   */

  deserializeStage(stage) {

    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Stage could not be loaded because no project path has been set on Serverless instance');

        // Load Stage's Variables
        let variables     = new _this._S.classes.Variables(_this._S);
        let variablesPath = stage.getProject().getFilePath('_meta', 'variables', 's-variables-' + stage.getName().toLowerCase() + '.json');
        variables.fromObject(SUtils.readFileSync(variablesPath));
        stage.setVariables(variables);

        // Load Stage's Regions
        return fs.readdirSync(stage.getProject().getFilePath('_meta', 'variables'));
      })

      .each(function(variableFile) {

        // Load region variables for this stage
        if (variableFile.indexOf(`s-variables-${stage.name}-`) == -1) return;

        const SRegion = _this._S.classes.Region

        let regionName = SRegion.varsFilenameToRegionName(variableFile);
        let region = new SRegion(_this._S, stage, regionName);

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

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Stage could not be saved because no project path has been set on Serverless instance');

        // Save Stage's Variables
        let variablesPath = stage.getProject().getFilePath('_meta', 'variables', 's-variables-' + stage.getName().toLowerCase() + '.json');
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

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {


        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Region could not be loaded because no project path has been set on Serverless instance');

        // Load region's Variables
        let variables     = new _this._S.classes.Variables(_this._S);

        let variablesPath = region.getProject().getFilePath('_meta', 'variables', 's-variables-' + region.getStage().getName().toLowerCase() + '-' + region.getName().toLowerCase().replace(/-/g, '') + '.json');

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

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Region could not be saved because no project path has been set on Serverless instance');

        // Save region's Variables
        let variablesPath = region.getProject().getFilePath('_meta', 'variables', 's-variables-' + region.getStage().getName().toLowerCase() + '-' + region.getName().toLowerCase().replace(/-/g, '') + '.json');
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

    // Skip if template does not have filePath

    if (!templates.getFilePath()) return BbPromise.resolve();

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Templates could not be loaded because no project path has been set on Serverless instance');

        // Set Data
        templates.fromObject(SUtils.readFileSync(templates.getFilePath()));
      })
      .then(function() {

        let parentDir = path.dirname(templates.getFilePath());

        // Skip this, if we are in the project or component root,
        if (fse.ensureFileSync(path.join(parentDir, 's-project.json') ||
            fse.ensureFileSync(path.join(parentDir, 's-component.json')))) {
          return;
        }

        // People can store s-templates.json in infinite subfolders in their components.  We have to find these...
        // Loop through parent dirs and find parent templates until hitting component root
        let parents = [],
          notRoot = true;

        while (notRoot) {
          parentDir = path.join(parentDir, '..');
          notRoot = fse.ensureFileSync(path.join(parentDir, 's-component.json'));
          if (fse.ensureFileSync(path.join(parentDir, 's-templates.json'))) {
            parents.push(SUtils.readFileSync(path.join(parentDir, 's-templates.json')))
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
    if (!templates.getFilePath()) return BbPromise.resolve();

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Templates could not be saved because no project path has been set on Serverless instance');

        return SUtils.writeFile(templates.getFilePath(),
          JSON.stringify(templates.toObject(), null, 2));
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
    return glob('**/' + fileName, {root: root}, function (err, files) {
      if (err) reject(err);
      resolve(files);
    });
  });
}