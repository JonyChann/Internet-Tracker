const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

function defineSuite(name, { before, after, tests }) {
  return { name, before, after, tests };
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const target = path.join(dir, entry);
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) removeDir(target);
    else fs.unlinkSync(target);
  }
  fs.rmdirSync(dir);
}

module.exports = { assert, defineSuite, tempDir, removeDir };
