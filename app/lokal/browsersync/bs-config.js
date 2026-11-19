module.exports = {
  server: {
    baseDir: '../../..'
  },
  files: [
    'index.html',
    'app/global/android/**/*',
    'app/global/pc/**/*',
    '../sw.js',
    'aset/**/*'
  ],
  watchEvents: ['change', 'add', 'unlink'],
  port: 3000,
  open: false,
  notify: false,
  ui: false,
  logPrefix: 'Istighosah',
  logFileChanges: true
};
