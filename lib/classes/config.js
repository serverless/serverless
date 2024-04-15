import _ from 'lodash';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Config {
  constructor(serverless, config) {
    this.serverless = serverless;
    this.serverlessPath = path.join(__dirname, '..');

    if (config) this.update(config);
  }

  update(config) {
    return _.merge(this, config);
  }

  get servicePath() {
    return this.serverless.serviceDir;
  }

  set servicePath(value) {
    this.serverless.serviceDir = value;
  }
}

export default Config;
