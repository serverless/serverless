'use strict';

/**
 * Action: FunctionCreate
 * - takes existing component name and new function name
 * - validates that component exists
 * - validates that function does NOT already exists in component
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
     * Prompt component, module & function if they're missing
     */

    _prompt() {

      let _this   = this,
        overrides = {};

      // If non-interactive or path exists, skip
      if (!_this.S.config.interactive || _this.evt.options.path) return BbPromise.resolve();

      let prompts = {
        properties: {
          name: {
            description: 'Enter a new function name: '.yellow,
            message:     'Function name must contain only letters, numbers, hyphens, or underscores. It should not be longer than 20 characters.',
            required:    true,
            conform:     function(functionName) {
              return _this.S.classes.Function.validateName(functionName);
            }
          }
        }
      };

      return _this.cliPromptInput(prompts, overrides)
        .then(function(answers) {

          _this.functionName = answers.name;

          // resolve if we're in component dir
          if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-project.json'))) {
            return BbPromise.resolve();
          }

          let choices = [];

          _this.S.getProject().getAllComponents().forEach((component)=>{
            let obj = {
              key: '',
              value: component.getName(),
              label: component.getName()
            };

            choices.push(obj);
          });


          return _this.cliPromptSelect(`In which component do you want to create this function?`, choices, false);
        })
        .then(function(values) {

          if (values) {
            // if values are not undefined, then the user manually chose a component
            _this.componentName = values[0].value;
          } else {

            // get the component name from the CWD regardless of how deep in the project we're in
            _this.componentName = process.cwd().replace( _this.S.getProject().getRootPath() + '/','').split('/')[0];
          }


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
    }
    ;

    /**
     * Validate and prepare data before creating module
     */

    _validateAndPrepare() {

      let _this = this;

      // Validate: check path
      if (!_this.evt.options.path && !(_this.functionName && _this.componentName)) {
        return BbPromise.reject(new SError('function path is required. Function path should include the component folder.'));
      }

      if (_this.evt.options.path) {

        if (_this.evt.options.path.split('/').length < 2) return BbPromise.reject(new SError('Invalid function path. Function path should include the component folder.'));

        // extract function/component names from path regardless of how deep the path is
        _this.functionName = _this.evt.options.path.split('/')[_this.evt.options.path.split('/').length - 1];
        _this.componentName = _this.evt.options.path.split('/')[0];
      } else {

        // generate path from function/component names regardless of how deep we are in cwd
        if (SUtils.fileExistsSync(path.join(process.cwd(), 's-project.json'))) {
          _this.evt.options.path = _this.componentName + '/' + _this.functionName;
        } else {
          // the following line makes sure we include all subfolders if any
          _this.evt.options.path = process.cwd().replace( _this.S.getProject().getRootPath() + '/','') + '/' + _this.functionName;
        }

      }

      if (_this.S.getProject().getFunction( _this.functionName )) {
        return BbPromise.reject(new SError(`Please choose a unique function name. You already have a function named "${_this.functionName}"`));
      }

      if (!_this.S.getProject().getComponent( _this.componentName )) {
        return BbPromise.reject(new SError(`Component "${_this.componentName}" does not exist in your project.`));
      }

      return BbPromise.resolve();
    };

    /**
     * Create Function Skeleton
     */

    _createFunction() {
      let filePath = this.S.getProject().getRootPath(this.evt.options.path, 's-function.json');

      this.component = this.S.getProject().getComponent(this.componentName);
      this.function = new this.S.classes.Function(this.S, this.component, {name: this.functionName}, filePath);

      if (this.endpoint) {
        this.endpoint = new this.S.classes.Endpoint(this.S, this.function);
        this.function.setEndpoint(this.endpoint);
      }

      if (this.event) {
        this.event = new this.S.classes.Event(this.S, this.function);
        this.function.setEvent(this.endpoint);
      }

      this.component.setFunction( this.function );
      this.evt.data.path = this.evt.options.path;
      return this.function.save();
    };

    /**
     * Generate Extra Scaffolding
     */

    _scaffold() {
      let sPath        = this.function.getRootPath().replace(this.function.getComponent().getRootPath(), ''),
        writeDeferred  = [],
        subFolderLevel = sPath.split(path.sep).length - 1,
        fnRootPath     = _.repeat('../', subFolderLevel);

      if (this.component.getRuntime().name === 'nodejs') {
        let handlerJsTmpl = fs.readFileSync(path.join(this.S.getServerlessPath(), 'templates', 'nodejs', 'handler.js'));
        let handlerJs     = _.template(handlerJsTmpl)({fnRootPath});
        writeDeferred.push(SUtils.writeFile(this.function.getRootPath('handler.js'), handlerJs));

      } else if (this.component.getRuntime().name === 'python2.7') {
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
