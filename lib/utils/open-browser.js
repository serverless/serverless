import open from 'open'
import isDockerContainer from 'is-docker'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log, style } = utils

export default function openBrowser(url) {
  log.notice()
  log.notice(
    style.aside(
      `If your browser does not open automatically, please open this URL: ${url}`,
    ),
  )
  log.notice()
  let browser = process.env.BROWSER
  if (browser === 'none' || isDockerContainer()) return
  if (process.platform === 'darwin' && browser === 'open') browser = undefined
  open(url).then((subprocess) =>
    subprocess.on('error', (err) => {
      log.info(`Opening of browser window errored with ${err.stack}`)
    }),
  )
}
