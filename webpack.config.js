const path = require('path');
const fs = require('fs');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')

var nodeModules = {};
fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });

module.exports = {
  entry: './lib/Serverless.js',
  target: 'node',
  output: {
    libraryTarget: 'commonjs2',
    filename: 'Serverless-dist3.js',
    path: path.resolve(__dirname, 'lib')
  },
  node: false,
  externals: nodeModules,
  plugins: [
    new UglifyJSPlugin()
  ]
};
