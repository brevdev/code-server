<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# npm Install Requirements

- [npm Install Requirements](#npm-install-requirements)
  - [Node.js version](#nodejs-version)
  - [Ubuntu, Debian](#ubuntu-debian)
  - [Fedora, CentOS, RHEL](#fedora-centos-rhel)
  - [Alpine](#alpine)
  - [macOS](#macos)
  - [FreeBSD](#freebsd)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

If you're installing code-server via `npm`, you'll need to install additional
dependencies required to build the native modules used by VS Code. This article
includes installing instructions based on your operating system.

## Node.js version

We use the same major version of Node.js shipped with VSCode's Electron,
which is currently `14.x`. VS Code also [lists Node.js
requirements](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites).

Using other versions of Node.js [may lead to unexpected
behavior](https://github.com/cdr/code-server/issues/1633).

## Ubuntu, Debian

```bash
sudo apt-get install -y \
  build-essential \
  pkg-config \
  python3
npm config set python python3
```

## Fedora, CentOS, RHEL

```bash
sudo yum groupinstall -y 'Development Tools'
sudo yum config-manager --set-enabled PowerTools # unnecessary on CentOS 7
sudo yum install -y python2
npm config set python python2
```

## Alpine

```bash
apk add alpine-sdk bash libstdc++ libc6-compat
npm config set python python3
```

## macOS

```bash
xcode-select --install
```

## FreeBSD

```sh
pkg install -y git python npm-node14 yarn-node14 pkgconf
pkg install -y libinotify
```
