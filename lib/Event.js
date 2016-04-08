'use strict';

const SError            = require('./Error'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  fs                    = require('fs'),
  _                     = require('lodash');

module.exports = function(S) {

  class Event extends S.classes.Serializer {

    constructor(data, func) {

      super();

      // Validate required attributes
      if (!func)  throw new SError('Missing required function');

      // Private properties
      let _this = this;
      _this._class = 'Error';
      _this._function = func;

      // Default properties
      _this.name = 'mySchedule';
      _this.type = 'schedule';
      _this.config = {};
      _this.config.schedule = 'rate(5 minutes)';

      if (data) _this.fromObject(data);
    }

    toObject() {
      let clone = _.cloneDeep(this);
      return S.utils.exportObject(clone);
    }

    toObjectPopulated(options) {
      options = options || {};

      // Validate: Check Stage & Region
      if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

      // Validate: Check project path is set
      if (!S.hasProject()) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

      // Merge templates
      let templates = _.merge(
        this.getProject().getTemplates().toObject(),
        this.getTemplates().toObject());

      // Clone
      let clone = this.toObject();
      clone.eventName = this.getName(); // add reserved variables
      //clone.name = this.getFunction().getName(); // TODO Remove, legacy tight coupling of functions with endpoints.  Make supplying this contingent on coupling?

      // Populate
      return S.utils.populate(this.getProject(), templates, clone, options.stage, options.region);
    }

    fromObject(data) {
      return _.assign(this, data);
    }

    getName() {
      return this.name;
    }

    getProject() {
      return S.getProject();
    }

    getFunction() {
      return this._function;
    }

    getTemplates() {
      return this.getFunction().getTemplates();
    }

  }

  return Event;

};
