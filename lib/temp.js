'use strict';

// Require Base Class
const JAWS = require('./base.js');

// Create A Plugin
var plugin = function() {

  // JAWS Context is passed in
  console.log(this);

  let action = function*(next) {
    console.log('herheehrherhehr');
    yield next;
  }
  this.action('ProjectCreate', action);

};

// Register Plugins
JAWS.plugin(plugin, {});

// Create Instance of modified JAWS
var jaws = new JAWS();

// Use it
jaws.projectCreate();