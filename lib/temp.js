'use strict';

// Require Jaws Class
const Jaws        = require('./Jaws.js'),
      RyansPlugin = require('./RyansPlugin.js');


// Create A Plugin
//var plugin = function() {
//
//  // JAWS Context is passed in
//  console.log(this);
//
//  let action = function*(next) {
//    console.log('herheehrherhehr');
//    yield next;
//  }
//  this.action('ProjectCreate', action);
//
//};

var Jaws = new Jaws();

// Register Plugins
let ryansConfig = {cool: "dude"};
Jaws.addPlugin(new RyansPlugin(Jaws, ryansConfig));

// Use it
jaws.projectCreate();