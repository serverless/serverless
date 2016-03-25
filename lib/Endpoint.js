'use strict';

const SError            = require('./Error'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  fs                    = require('fs'),
  _                     = require('lodash');


// Universal velocity template from http://kennbrodhagen.net/2015/12/06/how-to-create-a-request-object-for-your-lambda-event-from-api-gateway/
// provides `{body, headers, method, params, query} = event` as js objects
const DEFAULT_JSON_REQUEST_TEMPLATE = `{
  "body": $input.path("$"),
  "headers": {
    #foreach($header in $input.params().header.keySet())
      "$header": "$util.escapeJavaScript($input.params().header.get($header))" #if($foreach.hasNext),#end
    #end
  },
  "method": "$context.httpMethod",
  "params": {
    #foreach($param in $input.params().path.keySet())
      "$param": "$util.escapeJavaScript($input.params().path.get($param))" #if($foreach.hasNext),#end
    #end
  },
  "query": {
    #foreach($queryParam in $input.params().querystring.keySet())
      "$queryParam": "$util.escapeJavaScript($input.params().querystring.get($queryParam))" #if($foreach.hasNext),#end
    #end
  }  
}`;


module.exports = function(S) {

  class Endpoint extends S.classes.Serializer {

    constructor(data, func) {

      super();

      // Private properties
      let _this       = this;
      _this._class    = 'Endpoint';
      _this._function = func;

      // Default properties
      _this.path = _this.getFunction().getName();
      _this.method = 'GET';
      _this.type = 'AWS';
      _this.authorizationType = 'none';
      _this.authorizerFunction = false;
      _this.apiKeyRequired = false;
      _this.requestParameters = {};
      _this.requestTemplates = {};
      _this.requestTemplates['application/json'] = DEFAULT_JSON_REQUEST_TEMPLATE;
      _this.responses = {};
      _this.responses['default'] = {
        statusCode: '200',
        responseParameters: {},
        responseModels: {},
        responseTemplates: {}
      };
      _this.responses['default']['responseTemplates']['application/json'] = '';
      _this.responses['400'] = {
        statusCode: '400'
      };

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
      clone.endpointName = this.getName(); // add reserved variables
      clone.name = this.getFunction().getName(); // TODO Remove, legacy tight coupling of functions with endpoints.  Make supplying this contingent on coupling?

      // Populate
      return S.utils.populate(this.getProject(), templates, clone, options.stage, options.region);
    }

    fromObject(data) {
      return _.assign(this, data);
    }

    getName() {
      return this.path + '~' + this.method;
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

  return Endpoint;

};
