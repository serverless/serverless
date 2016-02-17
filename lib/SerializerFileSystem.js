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
      .then(function () {
        return _this;
      });
  }

  /**
   * Serialize Project
   */

  serializeProject(project, options) {

    let _this = this;

    return new BbPromise.try(function () {
      // Save Components
      if (options && options.deep) {
        return BbPromise.resolve(project.getAllComponents())
          .each(function (c) {
            return c.save(options);
          });
      }
    })
      .then(function() {
        // Save Templates
        if (options && options.deep) {
          let templates = project.getTemplates();
          return templates.save();
        }
      })
      .then(function() {
        // Save Variables
        if (options && options.deep) {
          let variables = project.getVariables();
          return variables.save();
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

        // Save s-project.json
        SUtils.writeFileSync(_this.getFilePath('s-project.json'),
          JSON.stringify(_this.toJson(), null, 2));

        return _this;
      });
  }

  /**
   * Deserialize Components
   */

  deserializeComponents() {

  }
}

module.exports = SerializerFileSystem;