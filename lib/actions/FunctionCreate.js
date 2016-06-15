'use strict';

/**
 * Action: FunctionCreate
 * - takes new function name
 * - validates that function does NOT already exists in project
 * - generates function structure based on runtime
 *
 * Event Options:
 * - path:      (String) The relative path of the function from project root
 * - runtime:   (String) The function runtime. By default: `nodejs`.
 */

module.exports  = function(S) {
  const path    = require('path'),
    BbPromise   = require('bluebird'),
    fs          = BbPromise.promisifyAll(require('fs')),
    SError      = require(S.getServerlessPath('Error')),
    SCli        = require(S.getServerlessPath('utils/cli')),
    SUtils      = S.utils,
    _           = require('lodash');

  /**
   * FunctionCreate Class
   */

  class FunctionCreate extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {
      S.addAction(this.functionCreate.bind(this), {
        handler:       'functionCreate',
        description:   'Creates scaffolding for a new function. Usage: serverless function create <function>',
        context:       'function',
        contextAction: 'create',
        options:       [
          {
            option:      'runtime',
            shortcut:    'r',
            description: 'The function runtime. By default: `nodejs`.'
          },
          {
            option:      'template',
            shortcut:    't',
            description: 'The function template. One of `function`, `endpoint` or `event`'
          }
        ],
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
        .then(() => this.function.scaffold())
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

      if (!S.config.interactive) return BbPromise.resolve();

      return BbPromise
        .try(() => {
          // If path exists, skip
          if (_this.evt.options.path) return;

          let prompts = {
            properties: {
              name: {
                description: 'Enter a new function name to be created in the CWD: '.yellow,
                message: 'Function name must contain only letters, numbers, hyphens, or underscores. It should not be longer than 20 characters.',
                required: true,
                conform: function (functionName) {
                  return S.classes.Function.validateName(functionName);
                }
              }
            }
          };

          return _this.cliPromptInput(prompts, overrides)
            .then(answers => _this.functionName = answers.name)
        })


        .then(() => {
          // Prompt user with runtime
          if (this.evt.options.runtime) return;

          let choices = S.getAllRuntimes().map(name => ({
            key: '',
            value: name,
            label: name
          }));

          let nodejsChoice = _.find(choices, {value: 'nodejs'});

          if (nodejsChoice) {
            choices = _.without(choices, nodejsChoice);
            nodejsChoice.label = 'nodejs (v0.10, soon to be deprecated)';
            choices.push(nodejsChoice);
          }

          return this.cliPromptSelect(`Please, select a runtime for this new Function`, choices, false)
            .then(values => this.evt.options.runtime = values[0].value);
        })

        .then(function() {

          // Prompt user with type of function to create
          if (_this.evt.options.template) return BbPromise.resolve();

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
              value: 'function',
              label: 'Just the Function...'
            }
          ];

          return _this.cliPromptSelect(`For this new Function, would you like to create an Endpoint, Event, or just the Function?`, choices, false)
          .then(values => _this.evt.options.template = values[0].value);
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

      // Validate: check runtime
      _this.evt.options.runtime = _this.evt.options.runtime || 'nodejs';

      if (!S.getRuntime(_this.evt.options.runtime)) {
        return BbPromise.reject(new SError(`Runtime "${_this.evt.options.runtime}" is not found`));
      }

      if (_this.evt.options.path) {
        // extract function name from path regardless of how deep the path is
        let parsedPath = path.parse(_this.evt.options.path);
        _this.functionName = parsedPath.base;
      } else {

        // generate path from function name regardless of how deep we are in cwd
        if (SUtils.fileExistsSync(path.join(process.cwd(), 's-project.json'))) {
          _this.evt.options.path = _this.functionName;
        } else {
          // the following line makes sure we include all subfolders if any
          _this.evt.options.path = process.cwd().replace( S.getProject().getRootPath() + path.sep,'') + path.sep + _this.functionName;
        }
      }

      // Validate function name
      if (!S.classes.Function.validateName(_this.functionName)) {
        return BbPromise.reject(new SError(`Only letters, numbers, dashes and underscores are allowed in function names`));
      }

      // Check function name is unique
      if (S.getProject().getFunction( _this.functionName )) {
        return BbPromise.reject(new SError(`Please choose a unique function name. You already have a function named "${_this.functionName}"`));
      }

      if (_.indexOf([ 'function', 'endpoint', 'event' ], _this.evt.options.template) === -1) {
        return BbPromise.reject(new SError(`Unknown template type ${_this.evt.options.template}`));
      }
      if (_this.evt.options.template === 'endpoint') {
        _this.endpoint = true;
      }
      if (_this.evt.options.template === 'event') {
        _this.event = true;
      }

      return BbPromise.resolve();
    };

    /**
     * Create Function Skeleton
     */

    _createFunction() {
      const filePath = S.getProject().getRootPath(this.evt.options.path, 's-function.json'),
            funcData = {
              name: this.functionName,
              runtime: this.evt.options.runtime
            };

      this.function = new S.classes.Function(funcData, filePath);

      if (this.endpoint) {
        this.endpoint = new S.classes.Endpoint({}, this.function);
        this.function.setEndpoint(this.endpoint);
      }

      if (this.event) {
        this.event = new S.classes.Event({}, this.function);
        this.function.setEvent(this.endpoint);
      }

      S.getProject().setFunction(this.function);
      this.evt.data.path = this.evt.options.path;
      return this.function.save();
    };
  }

  return( FunctionCreate );
};
