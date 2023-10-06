<!--
title: Serverless Dashboard - Troubleshooting CI/CD
menuText: Troubleshooting
menuOrder: 10
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/troubleshooting/)

<!-- DOCS-SITE-LINK:END -->

# Troubleshooting CI/CD Settings

In the setup process the Serverless Framework will authenticate you with Github with the OAuth application flow, and install the Serverless Github application to access the repositories. If there are problems with either of these, you can reset the state of the integration.

## Reset the OAuth access

1. Go to the [Authorized GitHub Apps in Github](https://github.com/settings/apps/authorizations) and click "Revoke" next to "Serverless". This will revoke the keys used by the Serverless Framework Dashboard to access Github on your behalf.
2. Go through Steps 1-4 above to access the deployment settings. You will be prompted to "connect github repository". Authenticate with Github again.
3. You will be prompted with the install instructions. If you did not uninstall the Github application, then you do not need to update these settings. You can close the window.
4. You will need to refresh the deployment settings page.

## Configure or reset the installed application

1. Go to the [Installed Github Apps in Github](https://github.com/settings/installations) and click “Configure” for the “Serverless” app. Here you can update the access settings or uninstall the application.
2. You can update the “Repository access” settings, to make sure that Serverless has access to the repositories you want to deploy.
3. You can also Uninstall the application.
4. If you uninstall the application, then you can go to follow steps 1-4 to get to the deployment settings page. Refresh this page.
5. Below the “repository” dropdown the message “If you do not see your repository, install the Serverless application in Github” will be displayed. Follow the “install the Serverless application” link to reinstall the Serverless Github application.
