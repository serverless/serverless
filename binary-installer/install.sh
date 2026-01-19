#!/usr/bin/env bash
#
# Download and install standalone binary.

set -e

reset="\033[0m"
red="\033[31m"
white="\033[37m"

# shellcheck disable=SC2059
printf "\n\nInstalling Serverless Framework...\n\n"

# Detect platform
if [[ $OSTYPE == "linux"* ]]; then
  PLATFORM="linux"
elif [[ $OSTYPE == "darwin"* ]]; then
  PLATFORM="darwin"
else
  echo "${red}Sorry, there's no serverless binary installer available for this platform. Please open request for it at https://github.com/takuhii/serverless-node-next/issues.$reset"
  exit 1
fi

# Detect architecture
MACHINE_TYPE=$(uname -m)

if [[ $MACHINE_TYPE == "x86_64" ]]; then
  ARCH='amd64'
elif [[ $MACHINE_TYPE == "arm64" || $MACHINE_TYPE == "aarch64" ]]; then
  ARCH='arm64'
else
  echo "${red}Sorry, there's no serverless binary installer available for $MACHINE_TYPE architecture. Please open request for it at https://github.com/takuhii/serverless-node-next/issues.$reset"
  exit 1
fi
# Download binary
BINARIES_DIR_PATH=$HOME/.serverless/bin
BINARY_PATH=$BINARIES_DIR_PATH/serverless
BINARY_URL="https://install.serverless.com/installer-builds/serverless-${PLATFORM}-${ARCH}"
mkdir -p "$BINARIES_DIR_PATH"
# shellcheck disable=SC2059

curl --fail -L -o "$BINARY_PATH.tmp" $BINARY_URL > /dev/null 2>&1
mv "$BINARY_PATH.tmp" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

## Ensure aliases
ln -sf serverless "$BINARIES_DIR_PATH/sls"

## Add to $PATH
SOURCE_STR="# Added by serverless binary installer\nexport PATH=\"\$HOME/.serverless/bin:\$PATH\"\n"
add_to_path () {
  command printf "\n$SOURCE_STR" >> "$1"
  # shellcheck disable=SC2059
  printf "\n${yellow}Added the following to $1:\n\n$SOURCE_STR$reset"
}

SHELLTYPE="$(basename "/$SHELL")"
if [[ $SHELLTYPE = "fish" ]]; then
  command fish -c 'set -U fish_user_paths $fish_user_paths ~/.serverless/bin'
  printf "\n${yellow}Added ~/.serverless/bin to fish_user_paths universal variable$reset."
elif [[ $SHELLTYPE = "zsh" ]]; then
  SHELL_CONFIG=$HOME/.zshrc
  if [ ! -r $SHELL_CONFIG ] || (! `grep -q '.serverless/bin' $SHELL_CONFIG`); then
    add_to_path $SHELL_CONFIG
  fi
else
  SHELL_CONFIG=$HOME/.bashrc
  if [ ! -r $SHELL_CONFIG ] || (! `grep -q '.serverless/bin' $SHELL_CONFIG`); then
    add_to_path $SHELL_CONFIG
  fi
  SHELL_CONFIG=$HOME/.bash_profile
  if [[ -r $SHELL_CONFIG ]]; then  if [[ -r $SHELL_CONFIG ]]; then

    if [[ ! $(grep -q '.serverless/bin' $SHELL_CONFIG) ]]; then
      add_to_path $SHELL_CONFIG
    fi
  else
    SHELL_CONFIG=$HOME/.bash_login
    if [[ -r $SHELL_CONFIG ]]; then
      if [[ ! $(grep -q '.serverless/bin' $SHELL_CONFIG) ]]; then
        add_to_path $SHELL_CONFIG
      fi
    else
      SHELL_CONFIG=$HOME/.profile
      if [ ! -r $SHELL_CONFIG ] || (! `grep -q '.serverless/bin' $SHELL_CONFIG`); then
        add_to_path $SHELL_CONFIG
      fi
    fi
  fi
fi
fi


codespace_env_check=$(env | grep -o GITHUB_CODESPACE* | wc -l)

if [ "$codespace_env_check" -gt "0" ]; then
  printf "\n\nTo use \"serverless\" either restart your shell or add \"$HOME/.serverless/bin\" in your current shell.\n\n"
else
  printf "\n\nRun \"serverless\" to get started.\n\n"
fi
exec $SHELL
