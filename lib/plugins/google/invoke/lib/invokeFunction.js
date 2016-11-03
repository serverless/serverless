'use strict';

module.exports = {
  invokeFunction() {
    const project = process.env.GCLOUD_PROJECT;
    const region = this.options.region;
    const func = this.options.function;

    const params = {
      name: `projects/${project}/locations/${region}/functions/${func}`,
    };

    return this.provider.request('functions', 'call', params)
      .then(() => this.provider.request('logging', 'getEntries', { filter: func }))
      .then((logs) => {
        let log = {
          textPayload: `There's no log data for function "${func}" available right now…`,
        };

        if (logs.length) log = logs[0];

        this.serverless.cli.log(JSON.stringify(log, null, 2));
      });
  },
};
