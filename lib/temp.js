'use strict';

// Require Jaws Class
const Jaws        = require('./Jaws.js'),
      RyansPlugin = require('./RyansPlugin.js');

var JAWS = new Jaws({
  awsAdminKeyId: '123',
  awsAdminSecretKey: '123',
  interactive: false,
});

// Register Plugins
//let ryansConfig = {cool: "dude"};
//JAWS.addPlugin(new RyansPlugin(JAWS, ryansConfig));

// Use it
JAWS.projectCreate({
  noCf: true,
  name: 'test',
  domain: 'test.com',
  stage: 'test',
  notificationEmail: 'i@test.com',
  region: 'us-east-1',
  awsAdminKeyId: '12313123',
  awsAdminSecretKey: '13123123'
});
