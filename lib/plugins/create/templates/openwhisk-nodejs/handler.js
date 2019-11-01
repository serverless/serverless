'use strict';

function hello(params) {
  const name = params.name || 'World';
  console.log('log', { payload: `Hello, ${name}` });
  return { payload: `Hello, ${name}!` };
}

exports.hello = hello;
