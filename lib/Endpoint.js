'use strict';

const SError            = require('./Error'),
  BbPromise             = require('bluebird'),
  path                  = require('path'),
  fs                    = require('fs'),
  _                     = require('lodash');


// Universal velocity template
// provides `{body, method, path, querystring, header, context, stageVariables} = event` as js objects
const DEFAULT_JSON_REQUEST_TEMPLATE = `
#macro( loop $map )
  #set( $i = 0 ) ## manual counter because $foreach.hasNext is broken for nested loops
  #foreach($key in $map.keySet())
      #set( $i = $i + 1 )
      #set( $value = $map.get($key) )
      "$key": 
        #if( $value[0] ) ## test for a string
          "$util.escapeJavaScript($value)"
        #else ## value is a map
          {
            #set( $ii = $i ) ## saving counter
            #loop( $value )  ## because recursive macro breaks it
            #set( $i = $ii )
          }
        #end
        
        #if( $i < $map.keySet().size() ) , #end
  #end
#end
{
  "body": $input.json("$"),
  "method": "$context.httpMethod",
  #loop( $input.params() ),
  "context": { #loop( $context ) },
  "stageVariables": { #loop( $stageVariables ) }
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
