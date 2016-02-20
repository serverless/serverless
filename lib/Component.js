'use strict';

const SError            = require('./Error'),
  SUtils                = require('./utils/index'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs');

let supportedRuntimes = {
  "nodejs": require('./RuntimeNode'),
  "python2.7": require('./RuntimePython27')
};

class Component extends SerializerFileSystem {

  /**
   * Constructor
   */

  constructor(S, project, config) {

    super(S);

    let _this       = this;
    _this._S        = S;
    _this._class    = 'Component';
    _this._config   = {};
    _this._project  = project;
    _this._runtime  = new _this._S.classes.RuntimeNode(_this._S);
    _this.updateConfig(config);

    // Default Properties
    _this.name           = 'component' + SUtils.generateShortId(6);
    _this.custom         = {};
    _this.runtime        = 'nodejs';
    _this.functions      = {};
    _this.templates      = new this._S.classes.Templates(this._S, this);

    _this.setRuntime( config.runtime || 'nodejs' );
  }

  static getSupportedRuntimes() {
    return supportedRuntimes;
  }

  updateConfig(config) {
    if (config) this._config = _.merge(this._config, config);
  }

  load() {
    return this.deserialize(this);
  }

  save(options) {
    return this.serialize(this, options);
  }

  toObject() {
    return SUtils.exportObject(_.cloneDeep(this));
  }

  toObjectPopulated(options) {
    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate
    return SUtils.populate(this.getVariables(), this.getTemplates(), this.toObject(), options.stage, options.region);
  }

  fromObject(data) {

    let _this = this;

    // Flush data
    _this.functions    = {};
    _this.templates    = {};

    if (data.functions) {
      for (let f of Object.keys(data.functions)) {
        let functionClass = new _this._S.classes.Function(_this._S, _this);
        this.setFunction(functionClass.fromObject(data.functions[f]));
      }
    }
    if (data.templates) {
      let templatesClass = _this._S.classes.Templates(_this._S);
      this.setTemplates(templatesClass.fromObject(data.templates[t]));
    }

    // Merge
    _.assign(_this, data);
    return _this;
  }

  getName(){
    return this.name;
  }

  getRuntime() {
    return this.runtime;
  }

  setRuntime( runtimeName ) {
    let runtime = supportedRuntimes[ runtimeName ];

    if (runtime) {
      this.runtime = runtimeName;
      this._runtime = new runtime( this._S );
    } else {
      throw new SError( `Runtime ${runtimeName} is not supported!` );
    }
  }

  getProject() {
    return this._project;
  }

  getAllFunctions() {
    return _.values( this.functions );
  }

  setFunction( func ){
    this.functions[ func.name ] = func;
  }
}

module.exports = Component;