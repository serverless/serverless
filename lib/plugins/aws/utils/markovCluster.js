'use strict';

/*eslint-disable */

module.exports = (graph, power, inflation) => getMarkovCluster(graph, power, inflation);

// taken from http://andreyeliseev.blogspot.de/2015/01/mcl-markov-clustering-algorithm-in.html
var normalize = function (matrix) {
  var sums = [];
  for (var col = 0; col < matrix.length; col++) {
    var sum = 0;
    for (var row = 0; row < matrix.length; row++) {
      sum += (matrix[row][col] || 0.0);
    }
    sums[col] = sum;
  }

  for (var col = 0; col < matrix.length; col++) {
    for (var row = 0; row < matrix.length; row++) {
      matrix[row][col] = Math.round((matrix[row][col] || 0.0) / sums[col] * 100.0) / 100.0;
    }
  }
};

var matrixExpand = function (matrix, pow) {
  var resultMatrix = [];
  for (var row = 0; row < matrix.length; row++) {
    resultMatrix[row] = [];
    for (var col = 0; col < matrix.length; col++) {
      var result = 0;
      for (var c = 0; c < matrix.length; c++) {
        result += matrix[row][c] * matrix[c][col];
      }
      resultMatrix[row][col] = result;
    }
  }
  return resultMatrix;
};

var matrixInflate = function (matrix, pow) {
  for (var col = 0; col < matrix.length; col++) {
    var total = 0;
    for (var row = 0; row < matrix.length; row++) {
      matrix[row][col] = Math.pow(matrix[row][col], pow);

      total += matrix[row][col];
    }

    for (var row = 0; row < matrix.length; row++) {
      matrix[row][col] = matrix[row][col] / total;
    }
  }
};


var equals = function (a, b) {
  for (var i = 0; i < a.length; i++) {
    for (var j = 0; j < a[i].length; j++) {
      if (b[i] === undefined || b[i][j] === undefined || a[i][j] != b[i][j]) {
        return false;
      }
    }
  }
  return true;
};

var getMarkovCluster = function (graph, power, inflation) {
  var lastMatrix = [];

  var currentMatrix = [];
  var index = 0;
  var indexes = {};
  var items = [];
  for (var key in graph) {
    currentMatrix[index] = [];
    currentMatrix[index][index] = 1;
    indexes[key] = index;
    items.push(key);
    index += 1;
  }

  for (var key in graph) {
    var itemIndex = indexes[key];
    var connections = graph[key];

    for (var conKey = 0; conKey < connections.length; conKey +=1) {
      var connection = connections[conKey];

      if (indexes.hasOwnProperty(connection)) {
        var conIndex = indexes[connection];
        currentMatrix[itemIndex][conIndex] = 1;
        currentMatrix[conIndex][itemIndex] = 1;
      }
    }
  }

  normalize(currentMatrix);

  currentMatrix = matrixExpand(currentMatrix, power);
  matrixInflate(currentMatrix, inflation);
  normalize(currentMatrix);

  var c = 0;
  while (!equals(currentMatrix, lastMatrix)) {
    lastMatrix = currentMatrix.slice(0);

    currentMatrix = matrixExpand(currentMatrix, power);
    matrixInflate(currentMatrix, inflation);
    normalize(currentMatrix);
  }

  var clusters = [];
  for (var row = 0; row < currentMatrix.length; row += 1) {
    var cluster = [];
    for (var col = 0; col < currentMatrix.length; col += 1) {
      var value = currentMatrix[row][col];
      if (value > 0) {
        cluster.push(items[col]);
      }
    }
    if (cluster.length > 0) {
      clusters.push(cluster);
    }
  }

  return clusters;
};

/*eslint-enable */
