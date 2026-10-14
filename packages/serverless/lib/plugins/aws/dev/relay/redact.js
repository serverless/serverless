/**
 * Error text without URLs or presigned query parameters: they are credentials until they expire.
 * Every part of the relay on this machine redacts with this one function.
 */

// Any URL, and any SigV4 query parameter with its value wherever it appears: in a path without a
// scheme, loose key=value text, URL-encoded (once or twice), a header-style "key: value", or JSON,
// a quoted key or value replaced with its quotes. After "key:" an unquoted value is taken only when
// it holds a digit or one of / + = % (as every credential, signature and date does), so a header
// named in prose keeps the words after it. The bridge removes the same.
const URL_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g
const SIGNED_QUERY_PATTERN =
  /["']?X-Amz-[A-Za-z0-9-]+["']?(?:[ \t]*(?:=|%3D|%253D)[ \t]*(?:"[^"]*"|'[^']*'|[^&\s"'<>]*)|[ \t]*:[ \t]*(?:"[^"]*"|'[^']*'|[A-Za-z0-9/+=%._-]*[0-9/+=%][A-Za-z0-9/+=%._-]*))/gi

export const withoutSecrets = (text) =>
  String(text ?? '')
    .replace(URL_PATTERN, '<url>')
    .replace(SIGNED_QUERY_PATTERN, '<redacted>')
