const { registerDemoRoutes } = require('../demo');
const { registerEntryRoutes } = require('./entries');
const { registerExportRoutes } = require('./export');
const { registerFieldRoutes } = require('./fields');
const { registerSettingsRoutes } = require('./settings');
const { registerTableRoutes } = require('./tables');
function registerApiRoutes(router, ctx) {
  registerTableRoutes(router, ctx);
  registerFieldRoutes(router, ctx);
  registerEntryRoutes(router, ctx);
  registerExportRoutes(router, ctx);
  registerSettingsRoutes(router, ctx);
  if (ctx.demo !== false) {
    registerDemoRoutes(router);
  }
  return router;
}

module.exports = {
  registerApiRoutes,
};
