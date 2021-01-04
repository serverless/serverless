const fdk = require('@fnproject/fdk');

fdk.handle((input) => {
  let name = 'World';
  if (input.name) {
    name = input.name;
  }
  const response = { message: `Hello ${name}` };
  console.error(`I show up in the logs name was: ${name}`);
  return response;
});
