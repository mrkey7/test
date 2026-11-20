const path = require('path');

const root = path.resolve(__dirname, '../../..');

module.exports = {
  server: {
    baseDir: root
  },
  files: [
    path.join(root, 'index.html'),
    path.join(root, 'app/android/**/*'),
    path.join(root, 'app/pc/**/*'),
    path.join(root, 'sw.js'),
    path.join(root, 'app/global/aset/**/*')
  ],
  watchEvents: ['change', 'add', 'unlink'],
  port: 3000,
  open: false,
  notify: false,
  ui: false,
  logPrefix: 'Istighosah',
  logFileChanges: true
};