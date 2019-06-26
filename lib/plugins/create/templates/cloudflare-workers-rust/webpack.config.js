const path = require('path');
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin');

const wasmDir = 'rust-wasm';

module.exports = {
  entry: {
    helloWorld: [
      path.join(__dirname, `./${wasmDir}/pkg/rust_wasm.js`),
      path.join(__dirname, './helloWorld.js'),
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, 'dist'),
  },
  plugins: [
    new WasmPackPlugin({
      crateDirectory: path.resolve(__dirname, wasmDir),
      extraArgs: '--no-typescript --target no-modules',
    }),
  ],

  //devtool: 'inline-source-map',

  target: 'web',

  mode: process.env.NODE_ENV || 'production',
};
