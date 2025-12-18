import widgetFactory from './widgets/factory.js'
import defaultDashboard from './configs/default.js'
import verticalDashboard from './configs/vertical.js'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dashboards = {
  default: defaultDashboard,
  vertical: verticalDashboard,
}

export function createDashboard(service, stage, region, functions, name) {
  const dashboard = dashboards[name]
  if (!dashboard) {
    throw new Error(`Cannot find dashboard by name ${name}`)
  }

  const widgets = dashboard.widgets.map((w) => {
    const widget = widgetFactory.getWidget(w.service, w.metric, w.display)
    const config = {
      service,
      stage,
      region,
      coordinates: w.coordinates,
      title: w.title,
      functions,
    }

    return widget.createWidget(config)
  })

  return { widgets }
}
