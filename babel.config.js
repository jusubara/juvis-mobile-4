module.exports = function(api) {
  api.cache(true);
  return {
    // The hermesc binary bundled in react-native 0.81.x's npm package does not
    // support class declarations or private class fields. Force hermes-v0 profile
    // which includes plugin-transform-classes and plugin-transform-private-methods
    // so the hermesc step in `expo export` receives fully transpiled JS.
    presets: [['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }]],
  };
};
