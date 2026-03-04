const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Reduce file watching to avoid EMFILE errors on macOS
config.watchFolders = [];
config.resolver.blockList = [
  /.*\/__tests__\/.*/,
  /.*\/\.git\/.*/,
];

module.exports = config;
