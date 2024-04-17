import memoizee from 'memoizee';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverlessPackageRoot = path.resolve(__dirname, '../../../');

// This method should be kept as sync. The reason for it is the fact that
// telemetry generation and persistence needs to be run in sync manner
// and it depends on this function, either directly or indirectly.
export default memoizee(() => {
  const npmPackagesRoot = (() => {
    try {
      return String(spawnSync('npm', ['root', '-g']).stdout).trim();
    } catch {
      return null;
    }
  })();
  if (!npmPackagesRoot) return false;
  return path.resolve(npmPackagesRoot, 'serverless') === serverlessPackageRoot;
});
