const chalk = require('chalk');
const log = require('./log');

module.exports = msg => {
  const parsedMsg = JSON.parse(msg);
  const prettifiedData = JSON.stringify(parsedMsg.data, null, 2).replace(
    new RegExp('\\n', 'g'),
    '\n                |  '
  );

  log(
    chalk.blue(
      ` Event Gateway  |  ${parsedMsg.message.trim()}\n                |  ${prettifiedData}`
    )
  );
};
