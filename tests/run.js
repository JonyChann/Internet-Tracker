const suites = [
  require('./export.test'),
  require('./extract.test'),
  require('./store.test'),
  require('./api.test'),
];

(async () => {
  let passed = 0;
  let failed = 0;
  for (const suite of suites) {
    console.log(`\n# ${suite.name}`);
    try {
      if (suite.before) await suite.before();
      for (const entry of suite.tests) {
        const name = entry[0];
        const fn = entry[1];
        const started = Date.now();
        try {
          await fn();
          passed += 1;
          console.log(`ok ${passed + failed} - ${name} (${Date.now() - started}ms)`);
        } catch (err) {
          failed += 1;
          console.error(`not ok ${passed + failed} - ${name}`);
          console.error((err && err.stack) || err);
        }
      }
    } catch (err) {
      failed += 1;
      console.error(`not ok - suite setup failed: ${suite.name}`);
      console.error((err && err.stack) || err);
    } finally {
      if (suite.after) {
        try {
          await suite.after();
        } catch (err) {
          console.error(`after hook failed for ${suite.name}: ${(err && err.message) || err}`);
        }
      }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${suites.reduce((sum, s) => sum + s.tests.length, 0)} total`);
  if (failed) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
