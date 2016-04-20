#!/bin/bash

set -e

mkdir -p tmp

npm run lint | tee tmp/lint-output

problems=`cat tmp/lint-output | grep -oE '[0-9]* problems' | grep -o "[0-9]*"`
ratchet="8256"

echo "Problems found in current linting: $problems"

if [ "$problems" -gt "$ratchet" ]
then
  echo "Linting issues above ratchet of $ratchet"
  exit 1
else
  echo "Linting issues below ratchet of $ratchet"
fi
