// The package is an allowlist: everything is left out except the files
// un-ignored below. Add a new extension file or folder here, or it won't ship.
export default {
  verbose: false,
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    '**',
    '!manifest.json',
    '!background.js',
    '!espn.js',
    '!fantrax.js',
    '!popup.js',
    '!popup.html',
    '!assets',
    '!assets/**',
    '!LICENSE',
  ],
};
