'use strict';

module.exports = {
  getAllFunctions() {
    const project = process.env.GCLOUD_PROJECT;
    const region = this.options.region;

    const params = {
      location: `projects/${project}/locations/${region}`,
    };

    return this.provider.request('functions', 'list', params)
      .then((result) => {
        if (!result.functions) {
          return [];
        }
        return result.functions;
      });
  },
};
