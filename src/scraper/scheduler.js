import * as store from '../db/store.js';

/**
 * Periodically scans datasets whose settings.intervalSec is > 0 and refreshes
 * every entry when the interval elapsed. Manual refreshes reset the clock
 * (lastRunAt is used as a fallback), so auto + manual do not double-fire.
 */
export class Scheduler {
  constructor({ getConfig, refresher, logger = console }) {
    this.getConfig = getConfig;
    this.refresher = refresher;
    this.logger = logger;
    this.timer = null;
    this.ticking = false;
  }

  start() {
    if (this.timer) return;
    const tickMs = Math.max(1000, Number(this.getConfig().scheduler.tickMs) || 5000);
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error('[scheduler]', err));
    }, tickMs);
    this.timer.unref?.();
    setTimeout(() => {
      this.tick().catch((err) => this.logger.error('[scheduler]', err));
    }, 1200).unref?.();
    this.logger.log(`[scheduler] 已启动，检查间隔 ${tickMs}ms`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const config = this.getConfig();
      if (!config.scheduler.enabled) return;
      const datasets = await store.listDatasets();
      const now = Date.now();
      for (const dataset of datasets) {
        const intervalSec = Number(dataset.settings?.intervalSec || 0);
        if (!intervalSec || intervalSec < 30) continue;
        if (dataset.settings?.autoRefresh === false) continue;
        const last = Date.parse(dataset.lastAutoAt || dataset.lastRunAt || dataset.createdAt || '') || 0;
        if (now - last < intervalSec * 1000) continue;
        if (this.refresher.isDatasetBusy(dataset.id)) continue;

        // Record the attempt first so concurrent ticks cannot double-trigger.
        await store.updateDataset(dataset.id, { lastAutoAt: new Date().toISOString() });
        const entries = await store.listEntries(dataset.id);
        if (!entries.length) continue;
        this.logger.log(`[scheduler] 自动刷新「${dataset.name}」(${entries.length} 行)`);
        this.refresher
          .refreshEntries({ dataset, entries, source: 'schedule' })
          .catch((err) => this.logger.error('[scheduler] 刷新失败:', err));
      }
    } finally {
      this.ticking = false;
    }
  }
}
