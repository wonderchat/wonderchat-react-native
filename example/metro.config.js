// Loads @wonderchat/react-native from the parent folder's source, so edits to
// the SDK show up without publishing. React, React Native and the web view
// always resolve from this app, never from the SDK's dev dependencies.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const sdkRoot = path.resolve(__dirname, "..");
const appModules = path.resolve(__dirname, "node_modules");
const config = getDefaultConfig(__dirname);

const escape = (p) => p.replace(/[/\\^$.*+?()[\]{}|]/g, "\\$&");

config.watchFolders = [sdkRoot];
config.resolver.nodeModulesPaths = [appModules];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  "@wonderchat/react-native": path.join(sdkRoot, "src"),
};
config.resolver.blockList = [
  new RegExp(`^${escape(path.join(sdkRoot, "node_modules"))}\\/.*$`),
  new RegExp(`^${escape(path.join(sdkRoot, "lib"))}\\/.*$`),
];

module.exports = config;
