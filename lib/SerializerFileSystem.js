'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  _            = require('lodash'),
  mkdirp       = require('mkdirp'),
  BbPromise    = require('bluebird');

// NOTE: Useful methods like "getFilePath()" were left out since we do not want the other classes to inherit this and be build reliance upon it.
// The asset classes should not have anything specific to file paths, except for a single filePath attribute in their config, which is set ONLY by the SerializerFileSystem

class SerializerFileSystem {

  constructor(S) {
    this._S           = S;
    this._projectPath = S.config.serializer.projectPath;
  }

  /**
   * Deserialize Project
   */

  deserializeProject(project) {

    let _this = this,
      projectContents;

    return BbPromise.try(function () {

        // Validate: Check project exists
        if (!SUtils.fileExistsSync(path.join(_this._projectPath, 's-project.json'))) {
          throw new SError('Project could not be loaded because it does not exist');
        }

        // Load Project
        project = _.merge(project, SUtils.readFileSync(path.join(_this._projectPath, 's-project.json')));

        // Iterate through project contents
        projectContents = fs.readdirSync(_this._projectPath);
        return projectContents;
      })
      .each(function (c, i) {

        if (c == 's-templates.json') {

          // Load Template
          let template = new _this._S.classes.Templates(_this._S, {
            filePath: path.join(_this._projectPath, c)
          });

          return template.load()
            .then(function (instance) {
              project._templates = instance;
            });

        } else if (SUtils.fileExistsSync(path.join(_this._projectPath, c, 's-component.json'))) {

          // Load Component
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

        if (SUtils.dirExistsSync(variablesRootPath)) {

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
                      });
                  }
                }
              }
            });
        }
      })
      .then(function() {

        // Load Resources
        if (SUtils.fileExistsSync(path.join(_this._projectPath, 's-resources-cf.json'))) {
          let resources = new _this._S.classes.Resources(_this._S, stage, {
            filePath: path.join(_this._projectPath, 's-resources-cf.json')
          });

          return resources.load()
            .then(function (instance) {
              project.setResources(instance);
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

    return new BbPromise.try(function () {
      // Save Components
      if (options && options.deep) {
        return BbPromise.resolve(project.getAllComponents())
          .each(function (c) {
            serialize.push(c.save(options));
          });
      }
    })
      .then(function() {
        // Save Stages
        if (options && options.deep) {
          return BbPromise.resolve(project.getStages())
            .each(function (s) {
              return s.save(options);
            });
        }
      })
      .then(function () {

        if (options && options.deep) {
          serialize.push(project.getTemplates().save());
          serialize.push(project.getVariables().save());
          serialize.push(project.getResources().save());
        }

        // Save s-project.json
        serialize.push(SUtils.writeFile(_this.getFilePath('s-project.json'),
          JSON.stringify(_this.toJson(), null, 2)));

        return BbPromise.all(serialize);
      })
      .then(function() { return _this; });
  }

  /**
   * Deserialize Component
   */

  deserializeComponent(component) {

    let _this   = this,
      reserved  = ['node_modules', 'lib', '.DS_Store'],
      componentDir;

    // Load component, then traverse component dirs to get all functions
    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.hasProject()) throw new SError('Component could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check component exists
        if (!SUtils.fileExistsSync(component._config.filePath)) {
          throw new SError('Component could not be loaded because it does not exist in your project: ' + _this._config.sPath);
        }

        componentDir = component._config.filePath.split(path.sep).slice(0, -1).join(path.sep);

        // Load Component
        component = _.merge(component, SUtils.readFileSync(component._config.filePath));
      })
      .then(function() {

        // Load Functions
        let scanFn = function(parentDir, sPathBase, level){

          if( level >= 10 ) {
            return BbPromise.resolve({});
          }

          return BbPromise.resolve(fs.readdirSync(parentDir))
            .each(function(sf) {
              let fPath = path.join(parentDir, sf);

              // Skip reserved names and files
              if (reserved.indexOf(sf.trim()) !== -1 || !fs.lstatSync(fPath).isDirectory()) return;

              let filePath = path.join(fPath, 's-function.json');
              if (SUtils.fileExistsSync(filePath)) {
                let func = new _this._S.classes.Function(_this._S, component, {
                  filePath: filePath
                });
                return func.load()
                  .then(function(instance) {
                    component.functions[instance.name] = instance;
                  });
              } else {
                return scanFn( path.join( parentDir, sf ), path.join( sPathBase, sf ), level+1 );
              }
            });
        };

        // Start scan
        return scanFn(componentDir, component.name, 0);
      })
      .then(function() {

        let templatePath = path.join(componentDir, 's-templates.json');

        if (SUtils.fileExistsSync(templatePath) {

          // Load Template
          let template = new _this._S.classes.Templates(_this._S, {
            filePath: templatePath
          });

          return template.load()
            .then(function (instance) {
              project._templates = instance;
            });
        })
        .then(function() {

          // Merge
          _this.setRuntime( componentJson.runtime );
          delete componentJson.runtime;

          _.assign(_this, componentJson);
          return _this;
        });

  }
}

module.exports = SerializerFileSystem;