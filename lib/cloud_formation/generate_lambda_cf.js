var JawsError = require('../jaws-error'),
    JawsCLI   = require('../utils/cli'),
    Promise   = require('bluebird'),
    path      = require('path'),
    AWSUtils  = require('../utils/aws'),
    utils     = require('../utils/index'),
    extend    = require('util')._extend; //OK with @Isaacs https://github.com/joyent/node/pull/4834#issuecomment-13981250

var errorLambdasStackTemplate = function(e, options) {
  if (e && ['ValidationError', 'ResourceNotFoundException'].indexOf(e.code) == -1) {  //ValidationError if DNE
    console.error(
      'Error trying to fetch existing lambda cf stack for region', options.region, 'stage', options.stage, e
    );
    throw new JawsError(e.message, JawsError.errorCodes.UNKNOWN);
  }
}

var compileEventSourceCf = function(pkg, awsm) {
  var eventSourceCf = {};

  if (awsm.eventSource) {
    Object.keys(awsm.eventSource).forEach(function(resource) {

      var eResource = {
        Type:       "AWS::Lambda::EventSourceMapping",
        Properties: awsm.eventSource[resource].cloudFormation || {},
        DependsOn:  pkg.lambdaName
      }
      eResource.Properties.FunctionName = { "Fn::GetAtt" : [pkg.lambdaName, "Arn"] }

      if (resource.type === 'kinesis' || resource.type === 'dynamodb') {
        eventSourceCf[resource] = eResource;
      }
    })
  }

  return eventSourceCf;
}
var compileLambdaFunctionCf = function(pkg, awsm) {
  var lResource = {
    Type:       "AWS::Lambda::Function",
    Properties: awsm.lambda.cloudFormation
  }

  lResource.Properties.Code = pkg.Code;
  lResource.Properties.Role = { Ref: "aaLambdaRoleArn" };

  return lResource;
}

var generateCf = function(projName, lambdaRoleArn, taggedLambdaPkgs, lambdaCf) {
  delete lambdaCf.Resources.lTemplate;
  lambdaCf.Description = projName + " lambdas";
  lambdaCf.Parameters.aaLambdaRoleArn.Default = lambdaRoleArn;

  //Always add lambdas tagged for deployment
  taggedLambdaPkgs.forEach(function(pkg) {
    utils.jawsDebug('adding Resource ' + pkg.lambdaName + ': ');

    var awsm = utils.readAndParseJsonSync(pkg.awsmPath);

    var lResource = compileLambdaFunctionCf(pkg, awsm);
    lambdaCf.Resources[pkg.lambdaName] = lResource;

    var eResource = compileEventSourceCf(pkg, awsm);
    for (var attrname in eResource) { lambdaCf.Resources['es' + attrname] = eResource[attrname]; }
  });

  return lambdaCf;
}

var updateExistingTemplate = function(existingTemplate, generatedCf, allLambdaNames) {
  Object.keys(existingTemplate.Resources).forEach(function(resource) {
    if (!generatedCf.Resources[resource] && allLambdaNames.indexOf(resource) != -1) {
      utils.jawsDebug('Adding exsiting lambda ' + resource);
      generatedCf.Resources[resource] = existingTemplate.Resources[resource];
    }
  });

  utils.jawsDebug(generatedCf);
  return generatedCf;
}

var generateLambdaCf = function(stackTemplate, options, lambdaCfTemplate) {
  var cf = generateCf(options.projName, options.lambdaRoleArn, options.taggedLambdaPkgs, lambdaCfTemplate);
  if (!stackTemplate) { return Promise.resolve(cf) }

  utils.jawsDebug('existing stack detected');
  var existingTemplate = JSON.parse(stackTemplate);

  return utils.getAllLambdaNames(options.meta.projectRootPath)
         .then(function(allLambdaNames) {
            return updateExistingTemplate(existingTemplate, cf, allLambdaNames);
         })
};

var writeLambdaCf = function(lambdaCfTemplate, stage, region, projectRootPath) {
  var lambdasCfPath = path.join(projectRootPath, 'cloudformation', stage, region, 'lambdas-cf.json');

  utils.jawsDebug('Wrting to ' + lambdasCfPath);
  return utils.writeFile(lambdasCfPath, JSON.stringify(lambdaCfTemplate, null, 2))
}

module.exports.generateLambdaCf = generateLambdaCf;

module.exports.createLambdaCf = function(options) {
  //TODO: docs: if someone manually changes resource or action dir names and does NOT mark the changed awsm.jsons
  //for deploy they will lose a lambda
  var existingStack = true,
      templatesPath = path.join(__dirname, '..', 'templates'),
      lambdaCfTemplate = utils.readAndParseJsonSync(path.join(templatesPath, 'lambdas-cf.json'));

  return AWSUtils.cfGetLambdasStackTemplate(options.meta.profile, options.region, options.stage, options.projName)
    .error(function(error)   { existingStack = false && errorLambdasStackTemplate(error, options)             })
    .then(function(template) { return generateLambdaCf(template, options, lambdaCfTemplate)                   })
    .then(function(cf)       { writeLambdaCf(cf, options.stage, options.region, options.meta.projectRootPath) })
    .then(function()         { return existingStack                                                           });
};
