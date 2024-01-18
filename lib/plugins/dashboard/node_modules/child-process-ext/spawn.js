// Credit: Matthew Scragg
// https://github.com/nkashyap/child-process-es6-promise/blob/9c4432f07ade1d954e73ef815b3b72c76a34ece8/index.js#L162-L212

"use strict";

const ensureString = require("es5-ext/object/validate-stringifiable-value")
    , isValue      = require("es5-ext/object/is-value")
    , isObject     = require("es5-ext/object/is-object")
    , ensureObject = require("es5-ext/object/valid-object")
    , mixin        = require("es5-ext/object/mixin")
    , log          = require("log").get("child-process-ext:spawn")
    , spawn        = require("cross-spawn")
    , setupStd     = require("./lib/private/spawn/setup-std");

const stdinLog = log.get("std:in");

let processCounter = 0;

module.exports = (command, args = [], options = {}) => {
	let child;
	const initResult = {}, result = {}, resolveListeners = [], processIndex = ++processCounter;

	const promise = new Promise((resolve, reject) => {
		command = ensureString(command);
		if (isValue(args)) args = Array.from(ensureObject(args), ensureString);
		if (!isObject(options)) options = {};
		log.debug("[%d] run %s with %o", processIndex, command, args);

		child = spawn(command, args, options)
			.on("close", (code, signal) => {
				result.code = code;
				result.signal = signal;
				for (const listener of resolveListeners) listener();
				if (code) {
					log.debug("[%d] failed with %d", processIndex, code);
					reject(
						Object.assign(
							new Error(
								`\`${ command } ${ args.join(" ") }\` Exited with code ${ code }`
							),
							result
						)
					);
				} else {
					log.debug("[%d] succeeded", processIndex);
					resolve(result);
				}
			})
			.on("error", error => {
				for (const listener of resolveListeners) listener();
				log.debug("[%d] errored with %o", processIndex, error);
				reject(Object.assign(error, result));
			});

		setupStd({ processIndex, resolveListeners, child, initResult, result, options });

		if (options.shouldCloseStdin) {
			if (child.stdin) child.stdin.end();
			else stdinLog.notice("[%d] cannot close stdin, as it's not exposed on a child process");
		}
	});

	return mixin(Object.assign(promise, { child }, initResult), {
		get stdoutBuffer() { return result.stdoutBuffer; },
		get stderrBuffer() { return result.stderrBuffer; },
		get stdBuffer() { return result.stdBuffer; }
	});
};
