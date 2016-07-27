# Invoke

This plugin invokes an OpenWhisk Action.

## How it works

`Invoke` hooks into the [`invoke:invoke`](/lib/plugins/invoke) lifecycle. It
will send the HTTP POST request to the Action endpoint to trigger the function
activation.

The output of the function is fetched and will be prompted on the console.
