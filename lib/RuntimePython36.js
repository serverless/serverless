'use strict';

module.exports = function(S) {

  return class RuntimePython36 extends S.classes.RuntimePython27 {

    static getName() {
        return 'python3.6';
    }

  }

};
