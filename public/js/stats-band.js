(function () {
  'use strict';

  const ICON_SVGS = {
    boxes: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>',
    layers: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
    'arrow-down-left': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7 7 17"/><path d="M17 17H7V7"/></svg>',
    'arrow-up-right': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function createTooltip() {
    let tip = document.getElementById('statsBandTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'statsBandTooltip';
      tip.className = 'chart-tooltip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showTooltip(tip, targetEl, text) {
    const rect = targetEl.getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top}px`;
    tip.classList.add('is-visible');
  }

  function hideTooltip(tip) {
    tip.classList.remove('is-visible');
  }

  function buildTrendHtml(visual, statId) {
    const values = Array.isArray(visual.values) && visual.values.length ? visual.values : [0];
    const labels = Array.isArray(visual.labels) ? visual.labels : [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const points = values.map((val, idx) => {
      const x = values.length > 1 ? (idx / (values.length - 1)) * 100 : 100;
      const y = 35 - ((val - min) / span) * 29;
      return [x, y];
    });

    const linePath = points
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ');
    const areaPath = `${linePath} L100 40 L0 40 Z`;
    const [endX, endY] = points[points.length - 1];
    const gradId = `trendGrad-${escapeHtml(statId)}`;

    const slicesHtml = values
      .map((val, idx) => {
        const label = labels[idx] || `Hari ${idx + 1}`;
        return `<span class="trend-hit-slice" data-tip="${escapeHtml(label)}: ${Number(val).toLocaleString('en-US')} Pcs"></span>`;
      })
      .join('');

    return `
      <div class="trend-chart">
        <svg class="trend-svg" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.26" />
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.01" />
            </linearGradient>
          </defs>
          <path class="trend-area" d="${areaPath}" fill="url(#${gradId})" />
          <path class="trend-line" d="${linePath}" vector-effect="non-scaling-stroke" />
        </svg>
        <span class="trend-end-dot" style="left:${endX}%;top:${(endY / 40) * 100}%;"></span>
        <div class="trend-hit-layer" style="grid-template-columns:repeat(${values.length}, 1fr);">${slicesHtml}</div>
        <div class="chart-axis">
          <span>${escapeHtml(labels[0] || '14 hari lalu')}</span>
          <span class="chart-axis-today">${escapeHtml(labels[labels.length - 1] || 'Hari ini')}</span>
        </div>
      </div>
    `;
  }

  function buildBarsHtml(visual) {
    const days = Array.isArray(visual.days) && visual.days.length ? visual.days : [0];
    const labels = Array.isArray(visual.labels) ? visual.labels : [];
    const peak = Math.max(...days, 1);

    const barsHtml = days
      .map((count, idx) => {
        const ratio = Math.max(0.1, count / peak);
        const isToday = idx === days.length - 1;
        const isHigh = count > 0 && count >= peak * 0.65;
        const label = labels[idx] || `Hari ${idx + 1}`;
        const activeAttr = isToday || isHigh ? ' data-active=""' : '';
        const zeroAttr = count === 0 ? ' data-zero=""' : '';
        const delayFactor = (idx / days.length).toFixed(3);
        return `
          <div class="bar-slot" data-tip="${escapeHtml(label)}: ${Number(count).toLocaleString('en-US')} Pcs">
            <span class="bar-fill"${activeAttr}${zeroAttr} style="--j:${delayFactor};--h:${ratio.toFixed(3)}"></span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="bars-chart">
        <div class="bars-row">${barsHtml}</div>
        <div class="chart-axis">
          <span>${escapeHtml(labels[0] || '14 hari lalu')}</span>
          <span class="chart-axis-today">${escapeHtml(labels[labels.length - 1] || 'Hari ini')}</span>
        </div>
      </div>
    `;
  }

  function buildVisualHtml(stat) {
    if (!stat.visual) {
      return `
        <div class="stat-status-pill">
          <span class="stat-status-dot" aria-hidden="true"></span>
          <span>${escapeHtml(stat.statusTag || 'Master inventory aktif')}</span>
        </div>
      `;
    }
    if (stat.visual.kind === 'trend') {
      return buildTrendHtml(stat.visual, stat.id);
    }
    if (stat.visual.kind === 'bars') {
      return buildBarsHtml(stat.visual);
    }
    return '';
  }

  class StatsBandController {
    constructor(containerEl, options = {}) {
      this.container = containerEl;
      this.locale = options.locale || 'en-US';
      this.durationMs = (options.durationSeconds || 1.6) * 1000;
      this.tooltip = createTooltip();
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.rafHandles = [];
    }

    formatNumber(val) {
      return new Intl.NumberFormat(this.locale, {
        maximumFractionDigits: 0
      }).format(Math.round(val));
    }

    render(data) {
      if (!this.container || !data || !Array.isArray(data.stats)) return;

      this.locale = data.locale || this.locale;
      this.durationMs = (data.durationSeconds || 1.6) * 1000;
      this.cancelAnimations();
      this.container.removeAttribute('data-in-view');

      const cellsHtml = data.stats
        .map((stat, idx) => {
          const finalFormatted = this.formatNumber(stat.value);
          const iconSvg = ICON_SVGS[stat.icon] || ICON_SVGS.boxes;
          const prefixClass = `stat-prefix-${escapeHtml(stat.accent || 'navy')}`;
          const hasContext = stat.context ? ' data-has-context="" tabindex="0"' : '';
          return `
            <div class="stat-cell" data-accent="${escapeHtml(stat.accent || 'navy')}" data-stat-id="${escapeHtml(stat.id)}"${hasContext}>
              <div class="stat-top">
                <div class="stat-label-row">
                  <dt class="stat-label">${escapeHtml(stat.label)}</dt>
                  <span class="stat-icon-badge" aria-hidden="true">${iconSvg}</span>
                </div>
                <dd class="stat-figure">
                  <span class="sr-only">${finalFormatted}${stat.unit ? ` ${escapeHtml(stat.unit)}` : ''}</span>
                  <span class="stat-number" aria-hidden="true">
                    <span class="stat-sizer">${finalFormatted}</span>
                    <span class="stat-live" data-target="${Number(stat.value) || 0}" data-delay="${idx * 90}">${this.reducedMotion ? finalFormatted : '0'}</span>
                  </span>
                  ${stat.unit ? `<span class="stat-unit">${escapeHtml(stat.unit)}</span>` : ''}
                </dd>
                <dd class="stat-caption">
                  <span class="stat-detail"><span class="${prefixClass}">${escapeHtml(stat.detailPrefix || '')}</span> ${escapeHtml(stat.detail || '')}</span>
                  ${stat.context ? `<span class="stat-context">${escapeHtml(stat.context)}</span>` : ''}
                </dd>
              </div>
              <dd class="stat-visual">${buildVisualHtml(stat)}</dd>
            </div>
          `;
        })
        .join('');

      this.container.innerHTML = `<dl class="stats-band-grid">${cellsHtml}</dl>`;
      this.bindTooltips();
      this.triggerAnimation();
    }

    bindTooltips() {
      const targets = this.container.querySelectorAll('[data-tip]');
      targets.forEach((el) => {
        el.addEventListener('mouseenter', () => showTooltip(this.tooltip, el, el.dataset.tip));
        el.addEventListener('mouseleave', () => hideTooltip(this.tooltip));
      });
    }

    cancelAnimations() {
      this.rafHandles.forEach((id) => cancelAnimationFrame(id));
      this.rafHandles = [];
    }

    triggerAnimation() {
      requestAnimationFrame(() => {
        this.container.setAttribute('data-in-view', '');
      });

      const liveNodes = this.container.querySelectorAll('.stat-live');
      if (this.reducedMotion) {
        liveNodes.forEach((node) => {
          node.textContent = this.formatNumber(Number(node.dataset.target) || 0);
        });
        return;
      }

      liveNodes.forEach((node) => {
        const target = Number(node.dataset.target) || 0;
        const delay = Number(node.dataset.delay) || 0;
        const startTime = performance.now() + delay;

        const tick = (now) => {
          if (now < startTime) {
            this.rafHandles.push(requestAnimationFrame(tick));
            return;
          }
          const progress = Math.min(1, (now - startTime) / this.durationMs);
          const eased = easeOutExpo(progress);
          node.textContent = this.formatNumber(target * eased);
          if (progress < 1) {
            this.rafHandles.push(requestAnimationFrame(tick));
          } else {
            node.textContent = this.formatNumber(target);
          }
        };

        this.rafHandles.push(requestAnimationFrame(tick));
      });
    }

    /**
     * Helper untuk integrasi langsung dengan endpoint `/api/dashboard/stats` di SMT Material Control.
     */
    updateFromApi(apiPayload, baseConfig) {
      if (!apiPayload || !apiPayload.stats || !baseConfig) return;
      const s = apiPayload.stats;
      const cloned = JSON.parse(JSON.stringify(baseConfig));
      cloned.stats.forEach((item) => {
        if (item.id === 'totalMaterials' && s.totalMaterials !== undefined) {
          item.value = Number(s.totalMaterials) || 0;
        }
        if (item.id === 'totalQuantity' && s.totalQuantity !== undefined) {
          item.value = Number(s.totalQuantity) || 0;
          if (Array.isArray(s.quantityTrend14d) && s.quantityTrend14d.length && item.visual) {
            item.visual.values = s.quantityTrend14d;
          }
        }
        if (item.id === 'inputToday' && s.inputToday !== undefined) {
          item.value = Number(s.inputToday) || 0;
          if (Array.isArray(s.inputDaily14d) && s.inputDaily14d.length && item.visual) {
            item.visual.days = s.inputDaily14d;
          }
        }
        if (item.id === 'outputToday' && s.outputToday !== undefined) {
          item.value = Number(s.outputToday) || 0;
          if (Array.isArray(s.outputDaily14d) && s.outputDaily14d.length && item.visual) {
            item.visual.days = s.outputDaily14d;
          }
        }
        if (Array.isArray(s.labels14d) && s.labels14d.length && item.visual) {
          item.visual.labels = s.labels14d;
        }
      });
      this.render(cloned);
    }
  }

  window.StatsBandController = StatsBandController;

  document.addEventListener('DOMContentLoaded', async () => {
    const mount = document.getElementById('statsBand');
    if (!mount) return;

    const controller = new StatsBandController(mount);
    window.dashboardStatsBand = controller;

    if (mount.hasAttribute('data-managed')) {
      return;
    }

    async function loadStatsBand() {
      try {
        const res = await fetch('/data/stats-data.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load /data/stats-data.json');
        const data = await res.json();
        controller.render(data);
      } catch (err) {
        console.error('StatsBand load error:', err);
      }
    }

    await loadStatsBand();
  });
})();
