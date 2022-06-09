// ES module to load the config file and print it to stdout
await(async () => {
  // path to serverless config should be available in process arguments
  const configPath = process.argv[2];

  if (!configPath || typeof configPath !== 'string') {
    throw new Error('No configuration path provided');
  }

  const config = (await import(configPath)).default;

  // print stringified serverless config to stdout
  console.log(JSON.stringify(config));
})();
