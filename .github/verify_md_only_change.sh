#!/usr/bin/env bash

# Copyright 2019 The Kubernetes Authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -eou pipefail


CHANGED_FILES=$(git diff --name-only origin/master HEAD)

# No changes return error/false
[[ -z $CHANGED_FILES ]] && exit 1

for CHANGED_FILE in $CHANGED_FILES; do
  if ! [[ $CHANGED_FILE =~ ^docs/ || $CHANGED_FILE =~ .md$ ]]; then
    # if there is a file changed that isn't inside docs/ or is .md
    # Return ok/true
    exit 0
  fi
done
# Return error/false if there were only docs/ or .md files
exit 1
