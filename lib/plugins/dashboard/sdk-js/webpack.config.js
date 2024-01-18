'use strict';

const path = require('path');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: {
    app: [path.resolve(__dirname, './src/index.js')],
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: 'index.js',
    libraryTarget: 'umd',
  },
  externals: {
    // Module (if required) is provided by Electron
    'original-fs': 'original-fs',
    // Optional WS modules - https://github.com/websockets/ws#opt-in-for-performance
    'bufferutil': 'bufferutil',
    'utf-8-validate': 'utf-8-validate',
  },
};
