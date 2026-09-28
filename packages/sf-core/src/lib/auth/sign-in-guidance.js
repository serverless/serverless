/**
 * How to get past "not signed in", in one place: the `agent setup` report and
 * the authentication gate every other command hits print the same remedy, so
 * an agent that learned it from one recognizes it in the other. Kept free of
 * imports so the report can use it without loading the auth module.
 */
export const NOT_SIGNED_IN_REMEDY =
  'if the user is at the keyboard, run "serverless login" (without a terminal it prints a sign-in URL for them to open and waits up to 10 minutes); for unattended runs, set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys)'
