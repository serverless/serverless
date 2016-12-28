#
#  build.ps1: A PowerShell script to create deployment packages for serverless 
#
#  Options:
#    Configuration: the project configuration to build (default: Release)  
#
#  This script uses the ZipFile class from .NET Framework 4.5 to create the
#  deployment package.
#
param (
 [String]$Configuration="Release"
)

$curDir = Split-Path -parent $MyInvocation.MyCommand.Definition
$deploymentDir = Join-Path $curDir "bin/$Configuration/netcoreapp1.0/publish"
$deploymentPackageName = "deploy-package.zip"
$deploymentPackagePath = Join-Path $deploymentDir $deploymentPackageName
$tempDeploymentPackagePath = [System.IO.Path]::GetTempFileName()

# Load ZipFile support from .NET 4.5
try
{
  Add-Type -AssemblyName "system.io.compression.filesystem"
}
catch 
{
  echo "Unable to load assembly 'System.IO.Compression.Filesystem' (we need .NET 4.5 to have been installed)"
  exit
}

# Move to the project folder
pushd $curDir
try
{
  #build handlers
  dotnet restore
  # As of 1.0.1, publish does not clean out the target folder, so 
  # we'll clean it to be safe.
  if (Test-Path $deploymentDir) {rm $(Join-Path $deploymentDir "*")}
  dotnet publish -c $Configuration

  # Create the deployment package. Unfortunately, the ZipFile class:
  # A) only zips up the contents of an entire folder
  # B) will attempt to include the zip file being created if it is in said folder.
  # To handle that we zip to a temp file and then move it afterwards.
  if (Test-Path $tempDeploymentPackagePath) {rm $tempDeploymentPackagePath }  
  [IO.Compression.ZipFile]::CreateFromDirectory($deploymentDir, $tempDeploymentPackagePath)
  cp $tempDeploymentPackagePath $deploymentPackagePath
}
finally
{
  popd
  # If we have a dangling zip file, nuke it.
  if (Test-Path $tempDeploymentPackagePath) {rm $tempDeploymentPackagePath}
}