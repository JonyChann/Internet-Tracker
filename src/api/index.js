import { registerDemoRoutes } from '../demo.js';
import { registerEntryRoutes } from './entries.js';
import { registerExportRoutes } from './export.js';
import { registerFieldRoutes } from './fields.js';
import { registerSettingsRoutes } from './settings.js';
import { registerTableRoutes } from './tables.js';

export function registerApiRoutes(router, ctx) {
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
