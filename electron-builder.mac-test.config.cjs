const base = require("./electron-builder.config.cjs");

module.exports = {
  ...base,
  mac: {
    ...base.mac,
    identity: null,
    hardenedRuntime: false,
    notarize: false
  }
};
