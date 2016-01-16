'use strict';

/**
 * Serverless Meta Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  BbPromise        = require('bluebird'),
  path             = require('path'),
  fs               = require('fs'),
  _                = require('lodash');

class ServerlessMeta
{

  /**
   * Constructor
   * - options.projectPath: absolute path to project
   */

  constructor(Serverless) {
    this._S       = Serverless;

    // Default properties
    this.stages    = {};
    this.variables = {};

  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    return BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Meta could not be loaded because no project path has been set on Serverless instance');

      // Validate: Check variables exist
      if (!SUtils.dirExistsSync(path.join(_this._S.config.projectPath, '_meta', 'variables'))) {
        throw new SError('Meta could not be loaded because no _meta/variables folder exists');
      }

      let variableFiles = fs.readdirSync(path.join(_this._S.config.projectPath, '_meta', 'variables'));
      for (let i = 0; i < variableFiles.length; i++) {

        let variableFile = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, '_meta', 'variables', variableFiles[i]));

        // Parse file name to get stage/region
        let file = variableFiles[i].replace('s-variables-', '').replace('.json', '');

        if (file === 'common') {

          // Set Common variables
          _this.variables = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, '_meta', 'variables', variableFiles[i]));

        } else {

          // Set Stage/Region variables
          file = file.split('-');
          if (!_this.stages[file[0]]) _this.stages[file[0]] = {
            regions: {},
            variables: {}
          };

          if (file.length === 1) {

            // Set Stage Variables
            _this.stages[file[0]].variables = SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, '_meta', 'variables', variableFiles[i]));

          } else if (file.length === 2) {

            // Set Stage-Region Variables
            let region;
            if (file[1] === 'useast1')      region = 'us-east-1';
            if (file[1] === 'uswest2')      region = 'us-west-2';
            if (file[1] === 'euwest1')      region = 'eu-west-1';
            if (file[1] === 'apnortheast1') region = 'ap-northeast-1';
            if (!_this.stages[file[0]].regions[region]) _this.stages[file[0]].regions[region] = {
              variables: SUtils.readAndParseJsonSync(path.join(_this._S.config.projectPath, '_meta', 'variables', variableFiles[i]))
            };
          }
        }
      }

      return _this;

    });
  }

  /**
   * Set
   * - Returns clone of data
   */

  set(data) {
    this.stages    = _.extend(this.stages, data.stages);
    this.variables = _.extend(this.variables, data.variables);
    return this;
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return {
      stages:    _.cloneDeep(this.stages),
      variables: _.cloneDeep(this.variables)
    }
  }

  /**
   * Get Stages
   * - Returns array of stages in project
   */

  getStages() {
    return Object.keys(this.stages);
  }

  /**
   * Get Regions (in stage)
   * - Returns array of regions in a stage
   */

  getRegions(stage) {

    // Validate: Check stage
    if (!stage) throw new SError('Stage is required to get regions');
    return Object.keys(this.stages[stage].regions);
  }

  /**
   * Save
   * - persist data
   */

  save() {

    let _this = this,
      clone   = this.get();

    return BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Meta could not be saved because no project path has been set on Serverless instance');

      // Save Common Variables
      fs.writeFileSync(path.join(_this._S.config.projectPath, '_meta', 'variables', 's-variables-common.json'),
        JSON.stringify(clone.variables, null, 2));

      for (let i = 0; i < Object.keys(clone.stages).length; i++) {

        let stage = clone.stages[Object.keys(clone.stages)[i]];

        // Save Stage Variables
        fs.writeFileSync(path.join(_this._S.config.projectPath, '_meta', 'variables', 's-variables-' + Object.keys(clone.stages)[i] + '.json'),
          JSON.stringify(stage.variables, null, 2));

        // Save Stage Region Variables
        for (let j = 0; j < Object.keys(stage.regions).length; j++) {
          fs.writeFileSync(path.join(_this._S.config.projectPath, '_meta', 'variables', 's-variables-' + Object.keys(clone.stages)[i] + '-' + Object.keys(stage.regions)[j].replace(/-/g, '') + '.json'),
            JSON.stringify(stage.regions[Object.keys(stage.regions)[j]].variables, null, 2));
        }
      }
    });
  }

  /**
   * Validate Stage Exists
   * - Checks to see if a stage exists in your project
   */

  validateStageExists(stage) {
    return this.getStages().indexOf(stage) !== -1;
  }

  /**
   * Validate Region Exists
   * - Checks to see if a stage exists in your project
   */

  validateRegionExists(stage, region) {
    return this.getRegions(stage).indexOf(region) !== -1;
  }
}

module.exports = ServerlessMeta;