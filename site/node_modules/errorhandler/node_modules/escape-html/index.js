/*!
 * escape-html
 * Copyright(c) 2012-2013 TJ Holowaychuk
 * MIT Licensed
 */

/**
 * Module exports.
 * @public
 */

module.exports = escapeHtml;

/**
 * Escape special characters in the given string of html.
 *
 * @param  {string} str The string to escape for inserting into HTML
 * @return {string}
 * @public
 */

function escapeHtml(html) {
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
