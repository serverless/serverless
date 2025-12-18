const createWidget = (config) => {
  const widget = {
    type: 'metric',
    x: config.coordinates.x,
    y: config.coordinates.y,
    width: config.coordinates.width,
    height: config.coordinates.height,
    properties: {
      title: config.title,
      view: 'singleValue',
      metrics: [],
      region: config.region,
      period: 300,
    },
  }

  widget.properties.metrics = config.functions.map((f) => [
    'AWS/Lambda',
    'Throttles',
    'FunctionName',
    `${config.service}-${config.stage}-${f.name}`,
    {
      stat: 'Sum',
      period: 2592000,
      region: config.region,
      label: f.name,
    },
  ])

  return widget
}

export default {
  createWidget,
}
