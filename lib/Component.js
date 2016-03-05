'use strict';

const SError            = require('./Error'),
  SerializerFileSystem  = require('./SerializerFileSystem'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  _                     = require('lodash'),
  fs                    = require('fs');

let supportedRuntimes = {
  "nodejs": require('./RuntimeNode'),
  "python2.7": require('./RuntimePython27')
};

let SUtils;

class Component extends SerializerFileSystem {

  /**
   * Constructor
   */

  constructor(S, project, data, filePath) {

    super(S);

    SUtils = S.utils;

    this._S         = S;
    this._class     = 'Component';
    this._config    = config || {};
    this._project   = project;

    // Default Properties
    this.name      = data.name || 'component' + SUtils.generateShortId(6);
    this.setRuntime(data.runtime || 'nodejs');
    this.custom    = {};

    this.templates = new this._S.classes.Templates(this._S, this); //TODO: add filepath
    this._filePath = filePath || this.getProject().getRootPath(this.name);

    if (data) this.fromObject(data);
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

    let obj = this.toObject();

    // Populate Sub-Assets Separately
    let functions;
    if (this.functions) {
      functions = _.mapValues(this.functions, (f) => f.toObjectPopulated(options));
      delete obj.functions;
    }

    // Merge templates
    let templates = _.merge(this.getProject().getTemplates().toObject(),
      this.getTemplates().toObject());

    // Populate
    let populated = SUtils.populate(this.getProject(), templates, obj, options.stage, options.region);

    if (functions) populated.functions   = functions;

    return populated;
  }

  fromObject(data) {

    // Flush data
    this.functions    = {};

    if(data.runtime) {
      this.setRuntime(data.runtime);
    }
    if (data.functions) {
      let temp = {};
      for (let f of Object.keys(data.functions)) {
        if (this.functions[f]) {
          temp[f] = this.functions[f].fromObject(data.functions[f]);
        } else {
          temp[f] = new this._S.classes.Function(this._S, this, data.functions[f]);
        }
      }
      delete data.functions;
      this.functions = temp;
    }
    if (data.templates) {
      this.templates.fromObject(data.templates);
      delete data.templates;
    }

    _.assign(this, data);
    return this;
  }

  setTemplates(templates) {
    this.templates = templates;
  }

  getTemplates() {
    return this.templates;
  }

  getName(){
    return this.name;
  }

  getRuntime() {
    return this._runtime;
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

  getAllEndpoints() {
    return _.flatten( _.map( this.getAllFunctions(), f => f.getAllEndpoints() ) );
  }

  setFunction( func ){
    this.functions[ func.name ] = func;
  }

  getFilePath() {
    return this._filePath;
  }

  getRootPath() {
    let args = _.toArray( arguments );
    args.unshift(path.dirname(this.getFilePath()));
    return path.join.apply( path, args );
  }

  static validateName(name) {
    return /^[a-zA-Z\d]+$/.test(name);
  }
}

module.exports = Component;