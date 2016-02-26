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

  constructor(S, project, data) {
    super(S);
    this._S        = S;
    this._class    = 'Component';
    this._project  = project;
    this._config   = {};
    this._config.filePath = path.join(this._project.getRootPath(), data.name, 's-component.json');

    // Default Properties
    this.name = data.name || 'component' + SUtils.generateShortId(6);

    this.setRuntime(data.runtime);

    this.custom = {};
    this.functions = {};
    this.templates = {};
    // this.templates = new this._S.classes.Templates(this._S, this)
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
    let obj = _.assign(this.toObject(), {functions: this.functions});
    return SUtils.populate(this.getProject(), this.getTemplates().toObject(), obj, options.stage, options.region);
  }

  fromObject(data) {

    // Flush data
    this.functions    = {};
    this.templates    = {};

    if(data.runtime) this.setRuntime(data.runtime);

    if (data.functions) {
      for (let f of Object.keys(data.functions)) {
        let functionClass = new this._S.classes.Function(this._S, this, data.functions[f]);
        this.setFunction(functionClass.fromObject(data.functions[f]));
      }
    }
    if (data.templates) {
      // name = this.getFilePath()
      let templates = new this._S.classes.Templates(this._S);

      templates.setParents([this.getProject().getTemplates()]);

      this.setTemplates(templates.fromObject(data.templates));
    }

    // Merge
    return _.assign(this, data);
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

  setFunction( func ){
    this.functions[ func.name ] = func;
  }

  getFilePath() {
    let args = _.toArray( arguments );
    args.unshift( this.getName() );
    return path.join.apply( path, args );
  }
}

module.exports = Component;