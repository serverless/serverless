'use strict';

/**
 * Action: FunctionCreate
 * - takes new function name
 * - validates that function does NOT already exists in project
 * - generates function structure based on runtime
 *
 * Event Options:
 * - sPath:      (String) The relative path of the function from project root
 */

module.exports = function(SPlugin, serverlessPath) {
  const path   = require('path'),
    fs         = require('fs'),
    SError     = require(path.join(serverlessPath, 'Error')),
    SCli       = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise  = require('bluebird'),
    _          = require('lodash');

  let SUtils;

  BbPromise.promisifyAll(fs);

  /**
   * FunctionCreate Class
   */

  class FunctionCreate extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + FunctionCreate.name;
    }

    registerActions() {
      this.S.addAction(this.functionCreate.bind(this), {
        handler:       'functionCreate',
        description:   `Creates scaffolding for a new function.
usage: serverless function create <function>`,
        context:       'function',
        contextAction: 'create',
        options:       [],
        parameters: [
          {
            parameter: 'path',
            description: 'One path to your function relative to the project root',
            position: '0'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    functionCreate(evt) {

      let _this   = this;
      _this.evt   = evt;

      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._createFunction)
        .then(_this._scaffold)
        .then(function() {

          SCli.log('Successfully created function: "'  + _this.evt.options.path + '"');

          /**
           * Return Event
           */

          return _this.evt;

        });
    }

    /**
     * Prompt function if they're missing
     */

    _prompt() {

      let _this   = this,
        overrides = {};

      if (!_this.S.config.interactive) return BbPromise.resolve();

      return BbPromise.try(function() {

          // If path exists, skip
          if (_this.evt.options.path) return BbPromise.resolve();

          let prompts = {
            properties: {
              name: {
                description: 'Enter a new function name: '.yellow,
                message: 'Function name must contain only letters, numbers, hyphens, or underscores. It should not be longer than 20 characters.',
                required: true,
                conform: function (functionName) {
                  return _this.S.classes.Function.validateName(functionName);
                }
              }
            }
          };

          return _this.cliPromptInput(prompts, overrides)
            .then(answers => _this.functionName = answers.name)
        })
        .then(function() {

        // Prompt user with type of function to create
        let choices = [
          {
            key: '',
            value: 'endpoint',
            label: 'Create Endpoint'
          },
          {
            key: '',
            value: 'event',
            label: 'Create Event'
          },
          {
            key: '',
            value: null,
            label: 'Just the Function...'
          }
        ];

        return _this.cliPromptSelect(`For this new Function, would you like to create an Endpoint, Event, or just the Function?`, choices, false);
      })
      .then(function(values) {
        if (values[0].value === 'endpoint') _this.endpoint = true;
        if (values[0].value === 'event') _this.event = true;
      });
    };

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      let _this = this;

      // Validate: check path
      if (!_this.evt.options.path && !_this.functionName) {
        return BbPromise.reject(new SError('function path is required'));
      }

      if (_this.evt.options.path) {
        // extract function name from path regardless of how deep the path is
        _this.functionName = _.last(_this.evt.options.path.split(path.sep));
      } else {

        // generate path from function name regardless of how deep we are in cwd
        if (SUtils.fileExistsSync(path.join(process.cwd(), 's-project.json'))) {
          _this.evt.options.path = _this.functionName;
        } else {
          // the following line makes sure we include all subfolders if any
          _this.evt.options.path = process.cwd().replace( _this.S.getProject().getRootPath() + '/','') + '/' + _this.functionName;
        }

      }

      if (_this.S.getProject().getFunction( _this.functionName )) {
        return BbPromise.reject(new SError(`Please choose a unique function name. You already have a function named "${_this.functionName}"`));
      }

      return BbPromise.resolve();
    };

    /**
     * Create Function Skeleton
     */

    _createFunction() {
      let filePath = this.S.getProject().getRootPath(this.evt.options.path, 's-function.json');

      this.function = new this.S.classes.Function(this.S, {name: this.functionName}, filePath);

      let pathArray = this.evt.options.path.split('/');

      this.function.fromObject({
        handler: `${pathArray.join('/')}/handler.handler`


      if (this.endpoint) {
        this.endpoint = new this.S.classes.Endpoint(this.S, this.function);
        this.function.setEndpoint(this.endpoint);
      }

      if (this.event) {
        this.event = new this.S.classes.Event(this.S, this.function);
        this.function.setEvent(this.endpoint);
      }

      this.S.getProject().setFunction(this.function);
      this.evt.data.path = this.evt.options.path;
      return this.function.save();
    };

    /**
     * Generate Extra Scaffolding
     */

    _scaffold() {
      let fnPath        = this.function.getRootPath().replace(this.S.getProject().getRootPath(), ''),
        writeDeferred  = [],
        subFolderLevel = fnPath.split(path.sep).length - 1,
        fnRootPath     = _.repeat('../', subFolderLevel);

      if (this.function.getRuntime().name === 'nodejs') {
        let handlerJsTmpl = fs.readFileSync(path.join(this.S.getServerlessPath(), 'templates', 'nodejs', 'handler.js'));
        let handlerJs     = _.template(handlerJsTmpl)({fnRootPath});
        writeDeferred.push(SUtils.writeFile(this.function.getRootPath('handler.js'), handlerJs));

      } else if (this.function.getRuntime().name === 'python2.7') {
        let handlerPyTmpl = fs.readFileSync(path.join(this.S.getServerlessPath(), 'templates', 'python2.7', 'handler.py'));
        let handlerPy     = _.template(handlerPyTmpl)({fnRootPath});
        writeDeferred.push(SUtils.writeFile(this.function.getRootPath('handler.py'), handlerPy));
      }

      writeDeferred.push(SUtils.writeFile(this.function.getRootPath('event.json'), {}));

      return BbPromise.all(writeDeferred);
    };
  }

  return( FunctionCreate );
};
