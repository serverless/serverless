var fs = require('fs')
  , buildOpts = {
      printStdout: true
    , printStderr: true
    };

task('build', ['browserify', 'minify'], function () {
  console.log('Build completed.');
});

desc('Cleans browerified/minified files and package files');
task('clean', ['clobber'], function () {
  jake.rmRf('./ejs.js');
  jake.rmRf('./ejs.min.js');
});

task('browserify', {async: true}, function () {
  jake.exec('./node_modules/browserify/bin/cmd.js lib/ejs.js > ejs.js',
      buildOpts, function () {
    console.log('Browserification completed.');
    setTimeout(complete, 0);
  });
});

task('minify', {async: true}, function () {
  jake.exec('./node_modules/uglify-js/bin/uglifyjs ejs.js > ejs.min.js',
      buildOpts, function () {
    console.log('Minification completed.');
    setTimeout(complete, 0);
  });
});

publishTask('ejs', ['build'], function () {
  this.packageFiles.include([
    'Jakefile'
  , 'README.md'
  , 'package.json'
  , 'ejs.js'
  , 'ejs.min.js'
  , 'lib/**'
  , 'test/**'
  ]);
});


