$ErrorActionPreference = 'Stop'; # stop on all errors
$toolsDir   = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"

$fileLocation = Join-Path $toolsDir 'serverless.exe'

Install-BinFile -Name serverless -Path $fileLocation
Install-BinFile -Name sls -Path $fileLocation

& 'serverless' 'binary-postinstall'
