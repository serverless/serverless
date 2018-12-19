/* eslint-env node */
'use strict';

const async = require('async');
const fs = require('fs');
const path = require('path');
const git = require('simple-git');

const BASE_REPO_PATH = process.env.BASE_REPO_PATH;
const BASE_URL = 'git-codecommit.us-east-1.amazonaws.com/v1/repos/';
const SSH_KEY_FILENAME = 'codecommit_rsa';
const SSH_KEY_ID = process.env.SSH_KEY_ID;
const SSH_KEY = process.env.SSH_KEY;


exports.handler = function (event, context, callback) {
	const indexBranch = event.Records[0].codecommit.references[0].ref.lastIndexOf('/');
	const indexRepo = event.Records[0].eventSourceARN.lastIndexOf(':');
	if (indexBranch !== -1 && indexRepo !== -1) {
		const triggerRepo = event.Records[0].eventSourceARN.slice(indexRepo + 1);
		const triggerBranch = event.Records[0].codecommit.references[0].ref.slice(indexBranch + 1);
		prepareRepo({
			path: BASE_REPO_PATH,
			sshKeyFilename: SSH_KEY_FILENAME,
			sshKey: SSH_KEY,
			repo: triggerRepo,
			branch: triggerBranch,
		}, callback);
	} else callback({status: 'Unable to parse repo and/or branch', error: event.Records});
};

function prepareRepo (params, callback) {
	async.series([
		(cb) => prepareSshKey(params.path, params.sshKeyFilename, params.sshKey, cb),
		(cb) => cloneRepo(params.path, params.repo, params.branch, cb),
	], function(error, results) {
		if (error) {
			console.error(error);
			callback(null, {status: 'prepareRepo() async.series failed', error});
		}
		else {
			console.log(JSON.stringify(results, null, ' '));
			callback(null, {status: 'Repository is ready', results});
		}
	});
}

/**
 * Create a suitable ssh private key from a corresponding envirnment variable.
 */
function prepareSshKey (dir, base, sshKey, callback) {
	process.env.GIT_SSH_COMMAND = 'ssh -o UserKnownHostsFile=/tmp/known_hosts -o StrictHostKeyChecking=no -F /tmp -i /tmp/codecommit_rsa';
	var basePath = path.format({dir, base});
	fs.writeFile(basePath,
		'-----BEGIN RSA PRIVATE KEY-----\n' +
			sshKey.match(/.{1,64}/g).toString().replace(/,/g, '\n') +
			'\n-----END RSA PRIVATE KEY-----\n',
		{mode: 0o600}, function (error) {
			callback(error, {status: 'sshKey file finished'});
		});
}

function cloneRepo (basePath, repo, branch, callback) {
	const url = `ssh://${SSH_KEY_ID}@${BASE_URL}${repo}`;
	const localPath = path.join(basePath, repo);
	const cloneOptions = [`--branch=${branch}`];
	git(basePath)
		.outputHandler((command, stdout, stderr) => {
			console.log(`Command issued: ${command}`);
			stdout.pipe(process.stdout);
			stderr.pipe(process.stderr);
		})
		.clone(url, localPath, cloneOptions, (error, result) => {
			callback(error, {status: `Cloned ${branch}`, result});
		});
}
