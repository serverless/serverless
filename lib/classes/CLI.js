'use strict';

const SError    = require('./Error'),
	    SCLI      = require('./CLI'),
	    path      = require('path'),
	    BbPromise = require('bluebird');

module.exports = function(S) {


	class CLI {


		constructor() {
			this._class = 'CLI';
		}


		promptInput(promptSchema, overrides) {
			if (S.config.interactive) { //CLI
				let Prompter = SCLI.prompt();
				Prompter.override = overrides;
				return Prompter.getAsync(promptSchema);
			} else {
				return BbPromise.resolve(); //in non interactive mode. All options must be set programatically
			}
		}


		promptSelect(message, choices, multi, doneLabel) {
			if (S.config.interactive) { //CLI
				return SCLI.select(message, choices, multi, doneLabel);
			} else {
				return BbPromise.reject(new SError('You must specify all necessary options when in a non-interactive mode', SError.errorCodes.UNKNOWN));
			}
		}


		promptSelectStage(message, stage, addLocalStage) {

			let _this = this;

			// Validate: Skip if not interactive
			if (!S.config.interactive) return BbPromise.resolve(stage);

			// Skip stage if provided
			if (stage) return BbPromise.resolve(stage);

			let stages = S.getService().getAllStages();

			// if private has 1 stage, skip prompt
			if (stages.length === 1) {
				return BbPromise.resolve(stages[0].getName());
			}

			if (addLocalStage) stages.push('local');

			// Create Choices
			let choices = [];
			for (let i = 0; i < stages.length; i++) {
				choices.push({
					key: (i + 1) + ') ',
					value: stages[i].getName(),
					label: stages[i].getName()
				});
			}

			return SCLI.select(message, choices, false)
				.then(function (results) {
					return results[0].value;
				});
		}


		promptSelectRegion(message, addAllRegions, existing, region, stage) {

			let _this = this;

			// Skip if not interactive
			if (!S.config.interactive) return BbPromise.resolve();

			// Resolve region if provided
			if (region) return BbPromise.resolve(region);

			// If stage has one region, skip prompt and return that instead
			if (stage && S.getService().getAllRegions(stage).length === 1 && existing) {
				return BbPromise.resolve(S.getService().getAllRegions(stage)[0].name);
			}

			let regionChoices = S.getProvider().validRegions;

			// if stage is provided, limit region list
			if (stage) {

				// Make sure stage exists in project
				if (!S.getService().validateStageExists(stage)) {
					return BbPromise.reject(new SError('Stage ' + stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
				}

				// if we only want the region that exist in stage
				if (existing) {

					// List only regions in stage
					regionChoices = [];
					S.getService().getAllRegions(stage).forEach(function (region) {
						regionChoices.push(region.name)
					});
				} else {

					// Make sure there are regions left in stage
					if (S.getService().getAllRegions(stage).length === S.getProvider('aws').validRegions.length) {
						return BbPromise.reject(new SError('Stage ' + stage + ' already have all possible regions.', SError.errorCodes.UNKNOWN));
					}

					// List only regions NOT in stage
					S.getService().getAllRegions(stage).forEach(function (regionInStage) {
						let index = regionChoices.indexOf(regionInStage.name);
						regionChoices.splice(index, 1);
					});
				}
			}

			let choices = [];

			if (addAllRegions) {
				choices.push(
					{
						key: '',
						value: 'all',
						label: 'all'
					}
				);
			}

			regionChoices.forEach(function (r) {
				choices.push({
					key: '',
					value: r,
					label: r
				});
			});

			return _this.promptSelect(message, choices, false)
				.then(results => {
					return results[0].value;
				});
		}


	}

	return CLI;

};

