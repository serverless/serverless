// native promise based drop-in replacement for BlueBird Promise.mapSeries
'use strict';

module.exports = (items, func) => {
  return items.reduce(
    (promise, item) => promise.then(result => func(item).then(mapped => [...result, mapped])),
    Promise.resolve([])
  );
};
