const register = require(`@babel/register`).default;

const registerJsParser = jsFilePath =>
  register({
    cwd: __dirname,
    extensions: ['.ts', '.js'],
    only: [jsFilePath],
    presets: [
      [
        '@babel/preset-env',
        {
          targets: {
            node: true,
          },
        },
      ],
      '@babel/preset-typescript',
    ],
  });

module.exports = { registerJsParser };
