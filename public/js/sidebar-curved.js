(function () {
  'use strict';

  const STORAGE_KEY = 'smt_sidebar_prev_indicator';

  const DEFAULT_MENU_DATA = {
    brand: {
      title: 'SMT Material',
      subtitle: 'Control System',
      logo: '/img/SMT.png',
      version: 'v1.0.0 • SMT Control',
      status: 'Online'
    },
    theme: {
      sidebarBg: '#091540',
      sidebarBorder: 'rgba(255, 255, 255, 0.1)',
      contentBg: '#f8fafc',
      activeText: '#091540',
      inactiveText: '#cbd5e1',
      groupLabel: '#94a3b8'
    },
    defaultActiveId: 'dashboard',
    groups: [
      {
        label: 'Menu Utama',
        items: [
          { id: 'dashboard', label: 'Dashboard', href: '/dashboard.html', icon: 'layout-dashboard' },
          { id: 'material-input-scan', label: 'Material Input (Scan)', href: '/material-input-scan.html', icon: 'scan-barcode' },
          { id: 'material-input', label: 'Manual Material Input', href: '/material-input.html', icon: 'pen-tool' }
        ]
      },
      {
        label: 'Material Output',
        items: [
          { id: 'material-output', label: 'Output Stok', href: '/material-output.html', icon: 'package-minus' },
          { id: 'material-output-machine', label: 'Output Mesin', href: '/material-output-machine.html', icon: 'cpu' }
        ]
      },
      {
        label: 'Laporan & Pengaturan',
        items: [
          { id: 'records', label: 'Records', href: '/records.html', icon: 'clipboard-list' },
          {
            id: 'master-data',
            label: 'Master Data',
            icon: 'file-spreadsheet',
            children: [
              { id: 'master', label: 'Master', href: '/master-materials.html', icon: 'box' },
              { id: 'meter-quantity', label: 'Meter Komponen Quantity', href: '/master-materials.html?category=meter_quantity', icon: 'gauge' }
            ]
          }
        ]
      }
    ]
  };

  const ICONS = {
    'layout-dashboard': '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
    'scan-barcode': '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M16 7v10"/></svg>',
    'pen-tool': '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/></svg>',
    'package-minus': '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>',
    cpu: '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
    'clipboard-list': '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
    'file-spreadsheet': '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/></svg>',
    box: '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    gauge: '<svg class="sidebar-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
    'chevron-down': '<svg class="sidebar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class CurvedSidebarController {
    constructor(options) {
      this.sidebarEl = options.sidebarEl;
      this.navEl = options.navEl;
      this.onNavigate = options.onNavigate || null;
      this.activeId = null;
      this.indicatorEl = null;
      this.menuData = null;
      this.demoMode = options.demoMode === true;
      this.lastIndicatorState = null;
    }

    init(menuData) {
      this.menuData = menuData || DEFAULT_MENU_DATA;
      this.applyTheme(this.menuData.theme);
      this.render(this.menuData);

      const initialId = this.resolveInitialActiveId(this.menuData);
      const prev = this.consumeSavedPosition();

      if (prev && !this.demoMode && this.indicatorEl && initialId) {
        this.indicatorEl.style.transition = 'none';
        this.indicatorEl.style.height = `${prev.height}px`;
        this.indicatorEl.style.transform = `translate3d(0, ${prev.top}px, 0)`;
        this.indicatorEl.classList.add('is-ready');
        void this.indicatorEl.offsetHeight;
        this.indicatorEl.style.transition = '';
        requestAnimationFrame(() => {
          this.setActive(initialId, { animate: true });
        });
      } else {
        this.setActive(initialId, { animate: false });
      }

      window.addEventListener('resize', () => this.repositionIndicator(false));
    }

    saveCurrentPosition() {
      if (!this.lastIndicatorState) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.lastIndicatorState));
      } catch {
        // ignore storage restrictions
      }
    }

    consumeSavedPosition() {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(STORAGE_KEY);
        const parsed = JSON.parse(raw);
        if (typeof parsed.top === 'number' && typeof parsed.height === 'number') {
          return parsed;
        }
      } catch {
        // ignore storage restrictions
      }
      return null;
    }

    applyTheme(theme) {
      if (!theme) return;
      const root = document.documentElement;
      if (theme.sidebarBg) root.style.setProperty('--sb-nav-bg', theme.sidebarBg);
      if (theme.contentBg) root.style.setProperty('--sb-content-bg', theme.contentBg);
      if (theme.activeText) root.style.setProperty('--sb-active-text', theme.activeText);
      if (theme.inactiveText) root.style.setProperty('--sb-inactive-text', theme.inactiveText);
      if (theme.groupLabel) root.style.setProperty('--sb-group-label', theme.groupLabel);
    }

    resolveInitialActiveId(menuData) {
      const pathname = window.location.pathname;
      if (pathname.endsWith('/profile.html')) {
        return null;
      }

      const fullPath = pathname + window.location.search;
      const allItems = [];
      for (const group of menuData.groups || []) {
        for (const item of group.items || []) {
          allItems.push(item);
          if (Array.isArray(item.children)) {
            allItems.push(...item.children);
          }
        }
      }

      for (const entry of allItems) {
        if (entry.href && fullPath.endsWith(entry.href)) return entry.id;
      }
      for (const entry of allItems) {
        if (entry.href && pathname.endsWith(entry.href)) return entry.id;
      }

      return menuData.defaultActiveId || 'dashboard';
    }

    render(menuData) {
      const groupsHtml = (menuData.groups || [])
        .map((group) => {
          const itemsHtml = (group.items || []).map((item) => this.renderItem(item)).join('');
          return `
            <div class="sidebar-group">
              <div class="sidebar-group-label">${escapeHtml(group.label)}</div>
              <div class="sidebar-group-list">${itemsHtml}</div>
            </div>
          `;
        })
        .join('');

      this.navEl.innerHTML = `
        <div id="sidebarActiveIndicator" class="sidebar-active-indicator" aria-hidden="true"></div>
        ${groupsHtml}
      `;

      this.indicatorEl = document.getElementById('sidebarActiveIndicator');
      this.bindEvents();
    }

    renderItem(item) {
      const iconSvg = ICONS[item.icon] || ICONS['layout-dashboard'];

      if (Array.isArray(item.children) && item.children.length > 0) {
        const subItemsHtml = item.children
          .map((sub) => {
            const subIcon = ICONS[sub.icon] || ICONS.box;
            return `
              <a
                href="${escapeHtml(sub.href || '#')}"
                class="sidebar-item sidebar-item--sub"
                data-nav-id="${escapeHtml(sub.id)}"
                data-parent-id="${escapeHtml(item.id)}"
                data-label="${escapeHtml(sub.label)}"
              >
                <span class="sidebar-item-main">
                  ${subIcon}
                  <span class="sidebar-item-text">${escapeHtml(sub.label)}</span>
                </span>
              </a>
            `;
          })
          .join('');

        return `
          <div class="sidebar-accordion" data-accordion="${escapeHtml(item.id)}">
            <button
              type="button"
              class="sidebar-item sidebar-accordion-trigger"
              data-nav-id="${escapeHtml(item.id)}"
              data-accordion-toggle="${escapeHtml(item.id)}"
              data-label="${escapeHtml(item.label)}"
              aria-expanded="false"
            >
              <span class="sidebar-item-main">
                ${iconSvg}
                <span class="sidebar-item-text">${escapeHtml(item.label)}</span>
              </span>
              ${ICONS['chevron-down']}
            </button>
            <div class="sidebar-submenu-wrap" data-submenu="${escapeHtml(item.id)}">
              <div class="sidebar-submenu-inner">${subItemsHtml}</div>
            </div>
          </div>
        `;
      }

      return `
        <a
          href="${escapeHtml(item.href || '#')}"
          class="sidebar-item"
          data-nav-id="${escapeHtml(item.id)}"
          data-label="${escapeHtml(item.label)}"
        >
          <span class="sidebar-item-main">
            ${iconSvg}
            <span class="sidebar-item-text">${escapeHtml(item.label)}</span>
          </span>
        </a>
      `;
    }

    bindEvents() {
      this.navEl.querySelectorAll('a.sidebar-item').forEach((link) => {
        link.addEventListener('click', (e) => {
          const id = link.dataset.navId;
          const href = link.getAttribute('href');

          if (this.demoMode) {
            e.preventDefault();
            this.setActive(id, { animate: true });
          } else {
            // Save outgoing indicator coordinates so the destination page animates smoothly from old item to new item
            this.saveCurrentPosition();
          }

          if (this.onNavigate) {
            this.onNavigate({
              id,
              label: link.dataset.label,
              href
            });
          }
        });
      });

      this.navEl.querySelectorAll('[data-accordion-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.accordionToggle;
          this.toggleAccordion(id);
        });
      });

      this.navEl.querySelectorAll('.sidebar-submenu-wrap').forEach((submenu) => {
        submenu.addEventListener('transitionend', () => {
          this.repositionIndicator(true);
        });
      });
    }

    toggleAccordion(accordionId, forceOpen) {
      const trigger = this.navEl.querySelector(`[data-accordion-toggle="${accordionId}"]`);
      const submenu = this.navEl.querySelector(`[data-submenu="${accordionId}"]`);
      if (!trigger || !submenu) return;

      const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !submenu.classList.contains('is-open');
      submenu.classList.toggle('is-open', nextOpen);
      trigger.classList.toggle('is-expanded', nextOpen);
      trigger.setAttribute('aria-expanded', String(nextOpen));

      const syncFrames = () => this.repositionIndicator(true);
      requestAnimationFrame(syncFrames);
      setTimeout(syncFrames, 140);
      setTimeout(syncFrames, 310);
    }

    setActive(navId, options = { animate: true }) {
      this.activeId = navId;

      this.navEl.querySelectorAll('.sidebar-item').forEach((el) => {
        el.classList.toggle('is-active', Boolean(navId) && el.dataset.navId === navId);
      });

      if (navId) {
        const target = this.navEl.querySelector(`.sidebar-item[data-nav-id="${navId}"]`);
        if (target && target.dataset.parentId) {
          this.toggleAccordion(target.dataset.parentId, true);
        }
      }

      this.repositionIndicator(options.animate !== false);
    }

    getIndicatorTarget() {
      if (!this.activeId) return null;
      const exact = this.navEl.querySelector(`.sidebar-item[data-nav-id="${this.activeId}"]`);
      if (!exact) return null;

      if (exact.dataset.parentId) {
        const submenu = this.navEl.querySelector(`[data-submenu="${exact.dataset.parentId}"]`);
        if (submenu && !submenu.classList.contains('is-open')) {
          return this.navEl.querySelector(`[data-accordion-toggle="${exact.dataset.parentId}"]`);
        }
      }
      return exact;
    }

    repositionIndicator(animate = true) {
      if (!this.indicatorEl) return;
      const target = this.getIndicatorTarget();
      if (!target) {
        this.indicatorEl.classList.remove('is-ready');
        this.lastIndicatorState = null;
        return;
      }

      const navRect = this.navEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topOffset = targetRect.top - navRect.top + this.navEl.scrollTop;

      this.lastIndicatorState = { top: topOffset, height: targetRect.height };

      if (!animate) {
        this.indicatorEl.style.transition = 'none';
      } else {
        this.indicatorEl.style.transition = '';
      }

      this.indicatorEl.style.height = `${targetRect.height}px`;
      this.indicatorEl.style.transform = `translate3d(0, ${topOffset}px, 0)`;
      this.indicatorEl.classList.add('is-ready');

      if (!animate) {
        void this.indicatorEl.offsetHeight;
        this.indicatorEl.style.transition = '';
      }
    }
  }

  window.CurvedSidebarController = CurvedSidebarController;

  document.addEventListener('DOMContentLoaded', async () => {
    const sidebarEl = document.getElementById('curvedSidebar');
    const navEl = document.getElementById('sidebarNav');
    if (!sidebarEl || !navEl) return;

    const controller = new CurvedSidebarController({
      sidebarEl,
      navEl,
      demoMode: false
    });

    window.smtSidebar = controller;

    // Render immediately with default menu data to prevent FOUC, then sync with /data/sidebar-menu.json if changed
    controller.init(DEFAULT_MENU_DATA);

    try {
      const res = await fetch('/data/sidebar-menu.json', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (JSON.stringify(json) !== JSON.stringify(DEFAULT_MENU_DATA)) {
          controller.init(json);
        }
      }
    } catch {
      // Keep DEFAULT_MENU_DATA on network error
    }
  });
})();
