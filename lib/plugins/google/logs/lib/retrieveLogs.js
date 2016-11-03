'use strict';

module.exports = {
  retrieveLogs() {
    const func = this.options.function;

    return this.provider.request('logging', 'getEntries', { filter: func })
      .then((logs) => {
        let log = {
          textPayload: `There's no log data for function "${func}" available right now…`,
        };

        if (logs.length) log = logs.slice(0, 4);

        this.serverless.cli.log(JSON.stringify(log, null, 2));
      });
  },
};
