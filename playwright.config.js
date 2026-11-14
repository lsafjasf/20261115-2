const { defineConfig } = require("playwright/test");

module.exports = defineConfig({
  timeout: 30000,
  reporter: [["list"]],
  use: {
    headless: true
  }
});
