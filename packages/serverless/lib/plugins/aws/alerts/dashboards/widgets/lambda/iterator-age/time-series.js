const createWidget = (config) => {
  const widget = {
    type: 'metric',
    x: config.coordinates.x,
    y: config.coordinates.y,
    width: config.coordinates.width,
    height: config.coordinates.height,
    properties: {
      title: config.title,
      view: 'timeSeries',
      stacked: false,
      metrics: [],
      region: config.region,
      period: 300,
    },
  }

  widget.properties.metrics = config.functions.reduce(
    (accum, f) =>
      accum.concat([
        [
          'AWS/Lambda',
          'IteratorAge',
          'FunctionName',
          `${config.service}-${config.stage}-${f.name}`,
          {
            stat: 'p50',
            period: 900,
            region: config.region,
            label: `${f.name} p50`,
          },
        ],
        [
          'AWS/Lambda',
          'IteratorAge',
          'FunctionName',
          `${config.service}-${config.stage}-${f.name}`,
          {
            stat: 'p90',
            period: 900,
            region: config.region,
            label: `${f.name} p90`,
          },
        ],
      ]),
    [],
  )

  return widget
}

export default {
  createWidget,
}
