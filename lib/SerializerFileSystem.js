'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  fse          = require('fs-extra'),
  glob         = require('glob'),
  async        = require('async'),
  path         = require('path'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

// NOTE: Useful methods like "getFilePath()" were left out since we do not want the other classes to inherit this and be build reliance upon it.
// The asset classes should not have anything specific to file paths, except for a single filePath attribute in their config, which is set ONLY by the SerializerFileSystem

class SerializerFileSystem {

  constructor(S) {
    this._S           = S;
    this._projectPath = S.config.projectPath;
    this._utils       = S.utils;
  }

  serialize(asset) {
    return this['serialize' + asset._class](asset);
  }

  deserialize(asset) {
    return this['deserialize' + asset._class](asset);
  }

  /**
   * Deserialize Project
   */

  deserializeProject(project) {

    let _this = this,
      projectContents;

    // Skip if project does not exist
    if (!_this._S.hasProject()) return BbPromise.resolve();

    return BbPromise.try(function () {

        // Load Project
        project = _.merge(project, _this._utils.readFileSync(path.join(
          _this._projectPath, 's-project.json')));

        // Iterate through project contents
        projectContents = fs.readdirSync(_this._projectPath);
        return projectContents;
      })
      .each(function (c, i) {

        // Load Components
        if (_this._utils.fileExistsSync(path.join(_this._projectPath, c, 's-component.json'))) {

          let component = new _this._S.classes.Component(_this._S, project, {
            filePath: path.join(_this._projectPath, c, 's-component.json')
          });

          return component.load()
            .then(function (instance) {
              project.setComponent(instance);
            });
        }
      })
      .then(function () {

        // Load Variables, Stages & Regions
        let variablesRootPath = path.join(_this._projectPath, '_meta', 'variables');

        if (_this._utils.dirExistsSync(variablesRootPath)) {

          let variableFiles = fs.readdirSync(_this.getFilePath('_meta', 'variables'));

          return BbPromise.resolve(variableFiles)
            .each(function(variableFile) {

              // Skip unrelated and hidden files
              if (!variableFile || variableFile.charAt(0) === '.' || variableFile.indexOf('s-variables') == -1) return;

              // Parse file name to get stage/region
              let file = variableFile.replace('s-variables-', '').replace('.json', '');

              if (file === 'common') {

                // Load Variables
                let variables = new _this._S.classes.Variables(_this._S, {
                  filePath: path.join(variablesRootPath, variableFile)
                });

                return variables.load()
                  .then(function (instance) {
                    project._variables = instance;
                  });

              } else {

                file = file.split('-');

                if (file.length == 1) {

                  // Load Stage
                  let stage = new _this._S.classes.Stage(_this._S, {
                    filePath: path.join(variablesRootPath, variableFile)
                  });

                  return stage.load()
                    .then(function (instance) {
                      project.setStage(instance);
                    });

                } else if (file.length == 2) {

                  // Load Region
                  let stage = project.getStage(file[0]);

                  if (stage) {
                    let region = new _this._S.classes.Region(_this._S, stage, {
                      filePath: path.join(variablesRootPath, variableFile)
                    });

                    return region.load()
                      .then(function (instance) {
                        stage.setRegion(instance);
                      })
                      .then(function() {

                        // Load Resources
                        if (_this._utils.fileExistsSync(path.join(_this._projectPath, 's-resources-cf.json'))) {

                          let resources = new _this._S.classes.Resources(_this._S, stage, {
                            filePath: path.join(_this._projectPath, 's-resources-cf.json')
                          });

                          return resources.load();
                        }
                      })
                      .then(function() {

                        // Load Templates
                        if (_this._utils.fileExistsSync(path.join(_this._projectPath, 's-templates.json'))) {

                          let templates = new _this._S.classes.Templates(_this._S, stage, {
                            filePath: path.join(_this._projectPath, 's-templates.json')
                          });

                          return templates.load()
                            .then(function (instance) {
                              project._templates = instance;
                            });
                        }
                      })
                  }
                }
              }
            });
        }
      })
      .then(function () {
        return _this;
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

        // Save Variables, Resources & Templates
        serialize.push(project.getVariables().save()); // Saves common variables
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
        serialize.push(_this._utils.writeFile(_this.getFilePath('s-project.json'),
          JSON.stringify(clone, null, 2)));

        return BbPromise.all(serialize);
      })
      .then(function() { return _this; });
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
        if (!_this._utils.fileExistsSync(component._config.filePath)) {
          throw new SError('Component could not be loaded because it does not exist in your project');
        }

        componentDir = component._config.filePath.split(path.sep).slice(0, -1).join(path.sep);

        // Load Component
        component = _.merge(component, _this._utils.readFileSync(component._config.filePath));
      })
      .then(function() {

        // Load Functions
        return globber(componentDir, 's-function.json')
          .each(function(path) {
            console.log('oooo')
            console.log(path)
            let func = new _this._S.classes.Function(_this._S, component, {
              filePath: path
            });
            return func.load()
              .then(function(instance) {

                // Check for function name uniqueness across project
                let components = component.getProject().getAllComponents();
                components.forEach(function(c) {
                  if (c.functions[instance.name]) {
                    throw new SError(`Function name is already taken in project: ${instance.name} Function names must be unique across a project as of Serverless v0.5`);
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
        serialize.push(_this._utils.writeFile(component._config.filePath,
          JSON.stringify(component.toObject(), null, 2)));

        return BbPromise.all(serialize);
      })
      .then(function() { return _this; });
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
      console.log('uuuuuuu')
      console.log(func._config.filePath)
        if (!_this._utils.fileExistsSync(func._config.filePath)) {
          throw new SError('Function could not be loaded because it does not exist in your project');
        }

        // Set Data
        func.fromObject(_this._utils.readFileSync(func._config.filePath));

      })
      .then(function() {

        let functionDir = func._config.filePath.split('/');
        functionDir.pop();
        functionDir = functionDir.join('/');

        // Load Templates
        let template;

        if (fse.ensureFileSync(path.join(functionDir, 's-templates.json'))) {
          template = new _this._S.classes.Templates(_this._S, { filePath: path.join(functionDir, 's-templates.json') });
        } else {
          template = new _this._S.classes.Templates(_this._S);
        }

        return template.load()
          .then(function(template) {
            func.setTemplate(template);
            return func;
          });
      });
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

        // Make function scaffolding, if does not exist
        if (!func._config.filePath || !_this._utils.fileExistsSync(func._config.filePath)) {

          func._config.filePath = path.join(func.getComponent()._config.filePath, func.name);
          if (_this._utils.fileExistsSync(func._config.filePath)) func._config.filePath = func._config.filePath + '-' + _this._utils.generateShortId(3);

          // Create event.json
          _this._utils.writeFile(path.join(func._config.fullPath, 'event.json'), '{}');
        }

      })
      .then(function() {
        return _this._utils.writeFile(func._config.filePath,
          JSON.stringify(func.toObject({ deep: true }), null, 2));
      });
  }

  /**
   * Deserialize Resources
   */

  deserializeResources(resources) {

    let _this   = this;
    console.log('sssss')
    console.log(resources)

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Resources could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check resources exists
        if (!_this._utils.fileExistsSync(resources._config.filePath)) {
          throw new SError('Resources could not be loaded because it does not exist in your project');
        }

        // Set Data
        resources.fromObject(_this._utils.readFileSync(resources._config.filePath));

      })
      .then(function() {

        // TODO: Remove this eventually when we introduce multiple Resource stacks in a single project
        // TODO: Needs to read s-module.json as well for back compa tsupport
        // Get Partials
        return globber(resources._config.filePath, 's-resources-cf.json')
          .each(function(partialPath) {
            resources._setPartial({ filePath: partialPath, partial: _this._utils.readFileSync(partialPath)});
          });
      });
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

        return _this._utils.writeFile(resources._config.filePath,
          JSON.stringify(resources.toObject(), null, 2));
      })
      .then(function() {
        return resources._partials;
      })
      .each(function(partial) {
        return _this._utils.writeFile(partial.filePath,
          JSON.stringify(partial.partial, null, 2));
      });
  }

  /**
   * Deserialize Variables
   */

  deserializeVariables(variables) {

    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.hasProject()) throw new SError('Variables could not be loaded because no project path has been set on Serverless instance');

      // Validate: Check exists
      if (!_this._utils.fileExistsSync(variables._config.filePath)) {
        throw new SError('Variables could not be loaded because it does not exist in your project');
      }

      // Set Data
      variables.fromObject(_this._utils.readFileSync(variables._config.filePath));
    });
  }

  /**
   * Serialize Variables
   */

  serializeVariables(variables) {
    let _this   = this;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.hasProject()) throw new SError('Variables could not be saved because no project path has been set on Serverless instance');

      return _this._utils.writeFile(variables._config.filePath,
        JSON.stringify(variables.toObject(), null, 2));
    });
  }

  /**
   * Deserialize Templates
   */

  deserializeTemplates(templates) {

    let _this   = this;

    // Skip if template does not have filePath
    if (!templates._config.filePath) return BbPromise.resolve();

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Templates could not be loaded because no project path has been set on Serverless instance');

        // Set Data
        templates.fromObject(_this._utils.readFileSync(templates._config.filePath));
      })
      .then(function() {

        let parentDir = path.dirname(templates._config.filePath);

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
            parents.push(_this._utils.readFileSync(path.join(parentDir, 's-templates.json')))
          }
        }

        templates.setParents(parents);
      });
  }

  /**
   * Serialize Templates
   * - Does not save template parents and may not need to.
   */

  serializeTemplates(templates) {
    let _this   = this;

    // Skip if template does not have filePath
    if (!templates._config.filePath) return BbPromise.resolve();

    return BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.hasProject()) throw new SError('Templates could not be saved because no project path has been set on Serverless instance');

      return _this._utils.writeFile(templates._config.filePath,
        JSON.stringify(templates.toObject(), null, 2));
    });
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