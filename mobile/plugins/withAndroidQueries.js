const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin to add <queries> element to AndroidManifest.xml.
 * Required for Android 11+ (API 30) to query/open other apps like GCash and Maya.
 */
module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add <queries> with package names for GCash and Maya
    if (!manifest.queries) {
      manifest.queries = [];
    }

    manifest.queries.push({
      package: [
        { $: { 'android:name': 'com.globe.gcash.android' } },
        { $: { 'android:name': 'com.paymaya' } },
      ],
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          data: [{ $: { 'android:scheme': 'gcash' } }],
        },
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          data: [{ $: { 'android:scheme': 'paymaya' } }],
        },
      ],
    });

    return config;
  });
};
