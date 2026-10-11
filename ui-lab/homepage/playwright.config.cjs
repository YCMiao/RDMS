module.exports = {
  testDir: './tests',
  outputDir: './test-results/artifacts',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://preview', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
};
