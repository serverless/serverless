'use strict';

/**
 * A command that is to be executed from within a JAWS project
 *
 * @type {ProjectCmd}
 */
var ProjectCmd = class ProjectCmd {
  constructor(JAWS) {
    this._JAWS = JAWS;
  }

  run() {
  }
};

module.exports = ProjectCmd;
