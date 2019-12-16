<!--
title: Serverless Dashboard - CI/CD Custom Scripts
menuText: Custom Scripts
menuOrder: 3
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/dashboard/cicd/custom-scripts/)

<!-- DOCS-SITE-LINK:END -->

# Custom scripts

Custom scripts in the pipeline are supported using the standard `scripts` in the `package.json` file.

For example, you can run scripts before/after install, and before/after a test.

```yaml
{
  'name': 'demo-serverless',
  'version': '1.0.0',
  'scripts': { 'preinstall': '', 'postinstall': '', 'pretest': '', 'posttest': '' },
}
```

Additional lifecycle hooks can be found in the `npm` documentation:

[https://docs.npmjs.com/misc/scripts](https://docs.npmjs.com/misc/scripts)
