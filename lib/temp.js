'use strict';

// Require Jaws Class
const Jaws        = require('./Jaws.js'),
      RyansPlugin = require('./RyansPlugin.js');

var JAWS = new Jaws();

// Register Plugins
let ryansConfig = {cool: "dude"};
JAWS.addPlugin(new RyansPlugin(JAWS, ryansConfig));

// Use it
JAWS.projectCreate();
