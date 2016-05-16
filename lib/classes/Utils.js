'use strict';

const SError     = require('./Error'),
			SCLI       = require('./CLI'),
			path       = require('path'),
			traverse   = require('traverse'),
			replaceall = require('replaceall'),
      resolve    = require('json-refs').resolveRefs,
			YAML       = require('js-yaml'),
			dotenv     = require('dotenv'),
			rawDebug   = require('debug'),
			_          = require('lodash'),
			os         = require('os'),
			BbPromise  = require('bluebird'),
			fse        = BbPromise.promisifyAll(require('fs-extra'));


class Utils {


	constructor() {
		this._class = 'Utils';
	}


	dirExistsSync(path) {
		try {
			let stats = fse.statSync(path);
			return stats.isDirectory();
		}
		catch (e) {
			return false;
		}
	}


	fileExistsSync(path) {
		try {
			let stats = fse.lstatSync(path);
			return stats.isFile();
		}
		catch (e) {
			return false;
		}
	}


	writeFileSync(filePath, contents) {

		// TODO: Reference the CLI class
		//this.sDebug(`Writing file: ${filePath}...`);

		if (contents === undefined) {
			contents = '';
		}

		try {
			fse.mkdirsSync(path.dirname(filePath));
		} catch (e) {
			throw new SError(`Error creating parent folders when writing this file: ${filePath}
		${e.message}`);
		}

		if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
			contents = JSON.stringify(contents, null, 2)
		}

		if (filePath.indexOf('.yaml') !== -1 && typeof contents !== 'string') {
			contents = YAML.dump(contents)
		}

		return fse.writeFileSync(filePath, contents);
	}


	writeFile(filePath, contents) {
		let _this = this;
		return new BbPromise(function(resolve, reject) {
			try {
				_this.writeFileSync(filePath, contents);
			} catch (e) {
				reject(e);
			}
			resolve();
		});
	}


	readFileSync(filePath) {

		let contents;

		// TODO: Reference the CLI class
		//this.sDebug(`Reading file: ${filePath}...`);

		// Read file
		try {
			contents = fse.readFileSync(filePath);
		} catch (e) {
			throw new SError(`Error reading file ${filePath}
		${e.message}`);
		}

		// Auto-parse JSON
		if (filePath.endsWith('.json')) {
			try {
				contents = JSON.parse(contents);
			} catch (e) {
				throw new SError(`Could not parse JSON in file: ${filePath}`);
			}
		}

		return contents;
	}


	readFile(filePath) {
		let _this = this, contents;
		return new BbPromise(function(resolve, reject) {
			try {
				contents = _this.readFileSync(filePath);
			} catch (e) {
				reject(e);
			}
			resolve(contents);
		});
	}


	exportObject(data) {

		let convert = function(instance) {
			let obj = {};
			for (let i = 0; i < Object.keys(instance).length; i++) {
				let key = Object.keys(instance)[i];
				if (instance.hasOwnProperty(key) && !key.startsWith('_') &&
					typeof instance[key] !== 'function') {
					obj[key] = instance[key];
				}
			}
			return obj;
		};

		data = {data: data};

		traverse(data).forEach(function(val) {
			if (val && val._class) {
				let newVal = convert(val);
				return this.update(newVal);
			}
		});

		return data.data;
	}


	generateShortId(maxLen) {
		return (Math.round((Math.random() * Math.pow(36, maxLen)))).toString(36);
	}


	populate(project, templates, data, stage, region) {

		// Validate required params
		if (!project || !templates || !data) throw new SError(`Missing required params: project, templates, data`);

		// Validate: Check stage exists
		if (stage) {
			if (!project.validateStageExists(stage)) throw new SError(`Stage doesn't exist`);
		}

		// Validate: Check region exists in stage
		if (stage && region) {
			if (!project.validateRegionExists(stage, region)) throw new SError(`Region "${region}" doesn't exist in provided stage "${stage}"`);
		}

		let varTemplateSyntax = /\${([\s\S]+?)}/g,
			templateTemplateSyntax = /\$\${([\s\S]+?)}/g;

		if (project.variableSyntax) {
			varTemplateSyntax = RegExp(project.variableSyntax, 'g');
		}

		if (project.templateSyntax) {
			templateTemplateSyntax = RegExp(project.templateSyntax, 'g');
		}

		// Populate templates
		traverse(data).forEach(function(val) {

			let t = this;

			// check if the current string is a template
			if (typeof val === 'string' && val.match(templateTemplateSyntax) != null) {

				let template = val.replace(templateTemplateSyntax, (match, varName) => varName.trim());

				// Module name syntax deprecated notice.
				if (template.indexOf('.') !== -1) {
					SCLI.log('DEPRECATED: Including the module name $${moduleName.template} is no longer supported.  ' +
						'Instead, all templates are use only the template name $${template} whether they are located in s-templates.json files in the project root or module root.  ' +
						'Module level templates extend project level templates if there are duplicates.  You will need to change: ' + template);
				}

				// Replace
				if (template in templates) {
					t.update(templates[template]);
				} else {
					SCLI.log('WARNING: the following template is requested but not defined: ' + template + (data.name ? ' in ' + data.name : ''));
				}
			}
		});

		// Populate variables
		let variablesObject = project.getVariablesObject(stage, region);

		traverse(data).forEach(function(val) {

			let t = this;

			// check if the current string is a variable
			if (typeof(val) === 'string' && !val.match(templateTemplateSyntax) && val.match(varTemplateSyntax)) {

				// get all ${variable} in the string
				val.match(varTemplateSyntax).forEach(function(variableSyntax) {

					let variableName = variableSyntax.replace(varTemplateSyntax, (match, varName) => varName.trim());
					let value;

					if (variableName in variablesObject) {
						value = variablesObject[variableName];
					}

					// Reserved Variables
					if (variableName === 'name' && data.name)         value = data.name;  // TODO Remove legacy variable that is semantically the functionName?
					if (variableName === 'functionName' && data.functionName) value = data.functionName;
					if (variableName === 'endpointName' && data.endpointName) value = data.endpointName;
					if (variableName === 'eventName' && data.eventName)    value = data.eventName;

					// Populate
					if (!value && !value !== "") {
						SCLI.log('WARNING: This variable is not defined: ' + variableName);
					} else if (typeof value === 'string') {

						// for string variables, we use replaceall in case the user
						// includes the variable as a substring (ie. "hello ${name}")
						val = replaceall(variableSyntax, value, val);
					} else {
						val = value;
					}
				});

				// Replace
				t.update(val);
			}
		});


		return data;
	}


	npmInstall(dir) {
		process.chdir(dir);

		if (exec('npm install ', {silent: false}).code !== 0) {
			throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
		}

		process.chdir(process.cwd());
	}


	findServicePath(startDir) {

		let _this = this;

		// Helper function
		let isServiceDir = function(dir) {
			let yamlName = 'serverless.yml';
			let yamlFilePath = path.join(dir, yamlName);

			if (_this.fileExistsSync(yamlFilePath)) {
				let serviceYaml = _this.readFileSync(yamlFilePath);
				if (typeof serviceYaml.service !== 'undefined') {
					return true;
				}
			}
			return false;
		};

		// Check up to 10 parent levels
		let previous = '.',
			servicePath = undefined,
			i = 10;

		while (i >= 0) {
			let fullPath = path.resolve(startDir, previous);

			if (isServiceDir(fullPath)) {
				servicePath = fullPath;
				break;
			}

			previous = path.join(previous, '..');
			i--;
		}

		return servicePath;
	}


	getFunctionsByCwd(allFunctions) {
		// we add a trailing slash to notate that it's the end of the folder name
		// this is just to avoid matching sub folder names that are substrings of other subfolder names
		let cwd = process.cwd() + path.sep,
			functions = [];

		allFunctions.forEach(function(func) {
			if (func.getFilePath().indexOf(cwd) != -1) functions.push(func);
		});

		// if no functions in cwd, add all functions
		if (functions.length === 0) functions = allFunctions;

		return functions;
	}


	/*
	 * - Reads and parses a yaml file:
	 * - resolves json-ref for json files
	 * - resolves json-ref for yaml files
	 * - resolves json-ref recursively
	 *
	 * @param yamlFilePath {string} - path to the yaml file
	 * @returns {object} - JS object literal representing the resolved yml
	 */
	parseYaml(yamlFilePath) {
		let parentDir = yamlFilePath.split(path.sep);
		parentDir.pop();
		parentDir = parentDir.join('/');
		process.chdir(parentDir);
		var root = YAML.load(this.readFileSync(yamlFilePath).toString());
		var options = {
			filter : ['relative', 'remote'],
			loaderOptions: {
				processContent: function (res, callback) {
					callback(null, YAML.load(res.text));
				}
			}
		};
		return resolve(root, options).then(function (res) {
			return BbPromise.resolve(res.resolved)
		})
	}


	getLifeCycleEvents(command, availableCommands, prefix) {
		prefix = prefix || '';
		const commandPart = command[0];
		if (_.has(availableCommands, commandPart)) {
			const commandDetails = availableCommands[commandPart];
			if (command.length === 1) {
				const events = [];
				commandDetails.lifeCycleEvents.forEach((event) => {
					events.push(`${prefix}${commandPart}:${event}Pre`);
					events.push(`${prefix}${commandPart}:${event}`);
					events.push(`${prefix}${commandPart}:${event}Post`);
				});
				return events;
			}
			if (_.has(commandDetails, 'commands')) {
				return getEvents(command.slice(1, command.length), commandDetails.commands, `${commandPart}:`);
			}
		}

		return [];
	}

}


module.exports = Utils;