# Remove

This plugin removes the Action from OpenWhisk.

## How it works

`Remove` hooks into the [`remove:remove`](/lib/plugins/remove) lifecycle. It
will send the HTTP DELETE request to the Action endpoint to trigger the function
removal.
