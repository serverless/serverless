'use strict';

const JAWS = require('./index2.js');

JAWS.config({
  projectRootPath: ''
});


var plugin = function() {

  console.log(this);

  //let action = function*(next) {
  //  console.log('herheehrherhehr');
  //  yield next;
  //}
  //this.action('ProjectCreate', action);

};



JAWS.plugin(plugin, {});
//JAWS.projectCreate();