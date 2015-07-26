
/*!
 * Jade - filters
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

module.exports = {
  
  /**
   * Wrap text with CDATA block.
   */
  
  cdata: function(str){
    return '<![CDATA[\\n' + str + '\\n]]>';
  },
  
  /**
   * Transform sass to css, wrapped in style tags.
   */
  
  sass: function(str){
    str = str.replace(/\\n/g, '\n');
    var sass = require('sass').render(str).replace(/\n/g, '\\n');
    return '<style type="text/css">' + sass + '</style>'; 
  },
  
  /**
   * Transform stylus to css, wrapped in style tags.
   */
  
  stylus: function(str, options){
    var ret;
    str = str.replace(/\\n/g, '\n');
    var stylus = require('stylus');
    stylus(str, options).render(function(err, css){
      if (err) throw err;
      ret = css.replace(/\n/g, '\\n');
    });
    return '<style type="text/css">' + ret + '</style>'; 
  },
  
  /**
   * Transform less to css, wrapped in style tags.
   */
  
  less: function(str){
    var ret;
    str = str.replace(/\\n/g, '\n');
    require('less').render(str, function(err, css){
      if (err) throw err;
      ret = '<style type="text/css">' + css.replace(/\n/g, '\\n') + '</style>';  
    });
    return ret;
  },
  
  /**
   * Transform markdown to html.
   */
  
  markdown: function(str){
    var md;

    // support markdown / discount
    try {
      md = require('markdown');
    } catch (err){
      try {
        md = require('discount');
      } catch (err) {
        try {
          md = require('markdown-js');
        } catch (err) {
          try {
            md = require('marked');
          } catch (err) {
            throw new
              Error('Cannot find markdown library, install markdown, discount, or marked.');
          }
        }
      }
    }

    str = str.replace(/\\n/g, '\n');
    return md.parse(str).replace(/\n/g, '\\n').replace(/'/g,'&#39;');
  },
  
  /**
   * Transform coffeescript to javascript.
   */

  coffeescript: function(str){
    str = str.replace(/\\n/g, '\n');
    var js = require('coffee-script').compile(str).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    return '<script type="text/javascript">\\n' + js + '</script>';
  }
};
