var _ = require('lodash/fp');
var fs = require('fs')
var path = require('path')
var componentsPath = path.join(__dirname, '/../docs/providers/aws/examples')
var componentsList = fs.readdirSync(componentsPath).filter(function (x) {
  return x !== '.DS_Store' && x !== 'README.MD'
})
console.log('componentsList', componentsList)


var test = path.join(__dirname, 'test.md')
var what = fs.readFileSync(test, 'utf8', function(err, contents) {
   return contents;
});

console.log('after calling readFile', what);

function injectListBetweenTags(newContent) {
  return function (previousContent) {
    var tagToLookFor = '<!-- AUTO-GENERATE-INDEX:';
    var closingTag = '-->';
    var startOfOpeningTagIndex = previousContent.indexOf(tagToLookFor + 'START');
    var endOfOpeningTagIndex = previousContent.indexOf(closingTag, startOfOpeningTagIndex);
    var startOfClosingTagIndex = previousContent.indexOf(tagToLookFor + 'END', endOfOpeningTagIndex);
    if (startOfOpeningTagIndex === -1 || endOfOpeningTagIndex === -1 || startOfClosingTagIndex === -1) {
      return previousContent;
    }
    return previousContent.slice(0, endOfOpeningTagIndex + closingTag.length) +
      newContent +
      previousContent.slice(startOfClosingTagIndex);
  };
}

function generate(fileContent, replaceWith) {
  var contributorsList = replaceWith
  return _.flow(
    injectListBetweenTags(contributorsList)
  )(fileContent);
};

var newTest = generate(what, componentsList)
console.log(newTest)