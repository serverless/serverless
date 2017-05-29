'use strict';

const tab = require('tabtab')({
  name: 'serverless',
});

const autocomplete = () => {
  tab.on('serverless', (data, done) => {
    done(null, [
      'create',
      'install',
      'pacakge',
      'deploy',
      'invoke',
      'logs',
      'login',
      'metrics',
      'info',
      'rollback',
    ]);
  });

  tab.on('create', (data, done) => {
    done(null, [
      '--template',
      '--path',
      '--name',
    ]);
  });

  tab.on('install', (data, done) => {
    done(null, [
      '--url',
      '--name',
    ]);
  });

  tab.on('package', (data, done) => {
    done(null, [
      '--stage',
      '--region',
      '--package',
    ]);
  });

  tab.on('deploy', (data, done) => {
    done(null, [
      'function',
      'list',
      '--stage',
      '--region',
      '--package',
      '--verbose',
    ]);
  });

  tab.on('invoke', (data, done) => {
    done(null, [
      'local',
      '--function',
      '--stage',
      '--region',
      '--data',
      '--path',
      '--type',
      '--log',
    ]);
  });

  tab.on('logs', (data, done) => {
    done(null, [
      '--function',
      '--stage',
      '--region',
      '--startTime',
    ]);
  });

  tab.on('metrics', (data, done) => {
    done(null, [
      '--function',
      '--stage',
      '--region',
      '--startTime',
      '--endTime',
    ]);
  });

  tab.on('info', (data, done) => {
    done(null, [
      '--stage',
      '--region',
      '--verbose',
    ]);
  });

  tab.on('info', (data, done) => {
    done(null, [
      '--timestamp',
      '--verbose',
    ]);
  });

  tab.start();
};

module.exports = autocomplete;
