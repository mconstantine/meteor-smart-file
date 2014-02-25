Package.describe({
  summary: "File handling for Meteor"
});

Package.on_use(function (api) {
  api.use(["underscore", "ejson"], ["client", "server"]);
  api.add_files("smart-file.js", ["client", "server"]);
  api.add_files("mimer.js", "server");
  api.export("SmartFile");
});