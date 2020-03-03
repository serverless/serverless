'use strict';
function printAnalysis() {
  if (this.analysis) {
    this.serverless.cli.log(this.analysis);
  }
}

module.exports = {
  printAnalysis
};