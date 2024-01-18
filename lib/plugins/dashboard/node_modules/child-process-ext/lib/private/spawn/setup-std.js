"use strict";

const { PassThrough } = require("stream")
    , split           = require("split2")
    , streamPromise   = require("stream-promise")
    , log             = require("log").get("child-process-ext:spawn");

const stdOutLog = log.get("std:out"), stdErrLog = log.get("std:err");

module.exports = ({ processIndex, resolveListeners, child, initResult, result, options }) => {
	if (child.stdout) {
		initResult.stdout = child.stdout;
		if (options.split) initResult.stdout = initResult.stdout.pipe(split());
		result.stdoutBuffer = Buffer.alloc(0);
		initResult.std = child.stdout.pipe(new PassThrough());
		result.stdBuffer = Buffer.alloc(0);
		child.stdout.on("data", data => {
			stdOutLog.debug("[%d] %s", processIndex, data);
			result.stdoutBuffer = Buffer.concat([result.stdoutBuffer, data]);
			result.stdBuffer = Buffer.concat([result.stdBuffer, data]);
		});
		streamPromise(
			initResult.stdout,
			new Promise(stdoutResolve => {
				resolveListeners.push(() => stdoutResolve(result.stdoutBuffer));
			})
		);
		streamPromise(
			initResult.std,
			new Promise(stdResolve => {
				resolveListeners.push(() => stdResolve(result.stdBuffer));
			})
		);
	} else if (stdOutLog.debug.isEnabled) {
		stdOutLog.warn(
			"[%d] cannot expose %s output, as it's not exposed on a spawned process", processIndex,
			"stdout"
		);
	}

	if (child.stderr) {
		initResult.stderr = child.stderr;
		if (options.split) initResult.stderr = initResult.stderr.pipe(split());
		result.stderrBuffer = Buffer.alloc(0);
		if (initResult.std) {
			child.stderr.pipe(initResult.std);
		} else {
			initResult.std = child.stderr;
			result.stdBuffer = Buffer.alloc(0);
		}
		child.stderr.on("data", data => {
			stdErrLog.debug("[%d] %s", processIndex, data);
			result.stderrBuffer = Buffer.concat([result.stderrBuffer, data]);
			result.stdBuffer = Buffer.concat([result.stdBuffer, data]);
		});
		streamPromise(
			initResult.stderr,
			new Promise(stderrResolve => {
				resolveListeners.push(() => stderrResolve(result.stderrBuffer));
			})
		);
	} else if (stdErrLog.debug.isEnabled) {
		stdErrLog.warn(
			"[%d] cannot expose %s output, as it's not exposed on a spawned process", processIndex,
			"stderr"
		);
	}
};
