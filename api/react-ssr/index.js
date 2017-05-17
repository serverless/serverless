/**
 * API: react-ssr
 */

var React = require('react');

var RootComponent = React.createClass({
  render: function () {
    return (
      React.createElement("html", null,
        React.createElement("head", null,
          React.createElement("title", null, this.props.title)
        ),
        React.createElement("body", null,
          React.createElement("img", {src: this.props.imgSrc})
        )
      )
    )
  }
});

RootFactory = React.createFactory(RootComponent);

exports.handler = function(event, context) {
  var root = RootFactory({
    title: 'test-title',
    imgSrc: 'https://raw.githubusercontent.com/jaws-stack/JAWS-graphics/master/jaws_logo_javascript_aws.png'
  });
  context.succeed(React.renderToStaticMarkup(root));
};
