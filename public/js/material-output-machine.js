// Output Mesin Page Logic - Automated Detection per Meter Type via LAN & Samsung/Hanwha Directory Watcher

let currentFeed = [];
let autoRefreshTimer = null;
let lanInfoData = null;
let currentHistoryPage = 1;
const HISTORY_LIMIT = 10;
let currentHistorySort = 'desc';

let isSuperAdminUser = false;

document.addEventListener('DOMContentLoaded', initMachinePage);

async function initMachinePage() {
    const user = await checkAuth();
    if (!user) return;

    const role = String((user && user.role) || '').trim().toLowerCase();
    isSuperAdminUser = role === 'superadmin';

    const watcherCard = document.getElementById('machineWatcherCard');
    if (watcherCard) {
        if (isSuperAdminUser) {
            watcherCard.style.display = 'block';
            await loadWatcherStatus();
            await loadProcessedLogs();
        } else {
            watcherCard.style.display = 'none';
        }
    }

    await loadLanInfo();
    await loadMachineFeed();
    await loadDetectionHistory();

    setupFilters();

    // Auto-refresh feed & watcher every 10 seconds for real-time updates
    autoRefreshTimer = setInterval(() => {
        loadMachineFeed(true);
        loadDetectionHistory(true);
        if (isSuperAdminUser) {
            loadWatcherStatus(true);
            loadProcessedLogs(true);
        }
    }, 10000);
}

function refreshMachinePage() {
    loadMachineFeed();
    loadDetectionHistory();
    if (isSuperAdminUser) {
        loadWatcherStatus();
        loadProcessedLogs();
    }
}

// ========== LOAD LAN INFO ==========

async function loadLanInfo() {
    try {
        const response = await fetch('/api/machine-output/lan-info');
        const result = await response.json();

        if (response.ok && result.success) {
            lanInfoData = result.data;
            renderLanStatus(lanInfoData);
        }
    } catch (error) {
        console.error('Failed to load LAN info:', error);
    }
}

function renderLanStatus(lan) {
    const lanAddressEl = document.getElementById('lanServerAddress');
    const lanEndpointEl = document.getElementById('lanEndpoint');
    const lanHeaderBadge = document.getElementById('lanHeaderBadge');

    let primaryIp = '127.0.0.1';
    if (lan.ips && lan.ips.length > 0) {
        const lan192 = lan.ips.find(ip => ip.startsWith('192.168.'));
        const lan10 = lan.ips.find(ip => ip.startsWith('10.'));
        primaryIp = lan192 || lan10 || lan.ips[0];
    }
    const serverUrl = `http://${primaryIp}:${lan.port || 3000}`;

    if (lanAddressEl) lanAddressEl.textContent = serverUrl;
    if (lanEndpointEl) lanEndpointEl.textContent = lan.detectEndpoint || '/api/machine-output/detect-meter';

    if (lanHeaderBadge) {
        lanHeaderBadge.innerHTML = `
            <span class="pulse-dot"></span>
            LAN: ${primaryIp}:${lan.port || 3000}
        `;
    }
}

// ========== DIRECTORY WATCHER LOGIC (5 PC MESIN SMT) ==========

let currentWatcherData = null;

async function loadWatcherStatus(isSilent = false) {
    if (!isSuperAdminUser) return;
    try {
        const response = await fetch('/api/machine-output/watcher-status');
        const result = await response.json();

        if (response.ok && result.success) {
            currentWatcherData = result.data;
            renderWatcherStatus(result.data);
        }
    } catch (error) {
        if (!isSilent) console.error('Failed to load watcher status:', error);
    }
}

function renderWatcherStatus(data) {
    if (!data) return;

    const statusBadge = document.getElementById('watcherStatusBadge');
    const folderExistsBadge = document.getElementById('watcherFolderExistsBadge');
    const lastScanEl = document.getElementById('watcherLastScanTime');
    const intervalEl = document.getElementById('watcherIntervalSeconds');
    const machinesListEl = document.getElementById('watcherMachinesList');
    const tbody = document.getElementById('machinesConfigBody');

    if (statusBadge) {
        if (data.isRunning && data.enabled) {
            statusBadge.className = 'lan-status-pill';
            statusBadge.style.background = '#dcfce7';
            statusBadge.style.color = '#15803d';
            statusBadge.style.border = '1px solid #86efac';
            statusBadge.innerHTML = '<span class="pulse-dot"></span> Auto-Scan Aktif (Tiap ' + (data.pollIntervalSeconds || 15) + 'd)';
        } else {
            statusBadge.className = 'lan-status-pill';
            statusBadge.style.background = '#f1f5f9';
            statusBadge.style.color = '#64748b';
            statusBadge.style.border = '1px solid #cbd5e1';
            statusBadge.textContent = 'Auto-Scan Jeda';
        }
    }

    const onlineCount = data.onlineCount || 0;
    const totalCount = (data.machines && data.machines.length) || 5;

    if (folderExistsBadge) {
        if (onlineCount === totalCount) {
            folderExistsBadge.style.color = '#16a34a';
            folderExistsBadge.innerHTML = `🟢 Semua Terhubung (${onlineCount}/${totalCount} PC)`;
        } else if (onlineCount > 0) {
            folderExistsBadge.style.color = '#ca8a04';
            folderExistsBadge.innerHTML = `🟡 Sebagian Terhubung (${onlineCount}/${totalCount} PC)`;
        } else {
            folderExistsBadge.style.color = '#dc2626';
            folderExistsBadge.innerHTML = `⚠️ Belum Ada PC Terhubung (0/${totalCount})`;
        }
    }

    if (machinesListEl) {
        machinesListEl.innerHTML = `<strong>${totalCount} PC</strong> (1 Hanwha &bull; 4 Samsung)`;
    }

    if (lastScanEl) {
        lastScanEl.textContent = data.lastScanTime ? formatDateTime(data.lastScanTime) : 'Baru saja dimulai';
    }

    if (intervalEl) {
        intervalEl.textContent = `${data.pollIntervalSeconds || 15} detik`;
    }

    // Render 5 machines configuration rows
    if (tbody && data.machines && Array.isArray(data.machines)) {
        // Don't overwrite if user is actively typing in inputs
        const activeInput = document.activeElement;
        const isUserTyping = activeInput && (activeInput.classList.contains('machine-ip-input') || activeInput.classList.contains('machine-path-input'));
        if (isUserTyping) return;

        tbody.innerHTML = data.machines.map(m => {
            const isHanwha = m.brand && m.brand.toLowerCase().includes('hanwha');
            const brandBadge = isHanwha
                ? `<span style="background: #fff7ed; border: 1px solid #fdba74; color: #c2410c; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;">HANWHA</span>`
                : `<span style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;">SAMSUNG</span>`;

            const statusHtml = m.reachable
                ? `<span style="color: #16a34a; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" title="Path: ${escapeHtml(m.path)}">🟢 Terhubung</span>`
                : `<span style="color: #dc2626; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" title="Folder tidak ditemukan atau PC offline">⚠️ Offline</span>`;

            const displayPath = m.customPath || m.shareFolder || 'Pd Info';

            return `
                <tr>
                    <td style="font-weight: 700; font-size: 13px; color: #0f172a; white-space: nowrap;">
                        🖥️ ${escapeHtml(m.name || ('Line ' + m.id))}
                    </td>
                    <td>
                        ${brandBadge}
                    </td>
                    <td>
                        <input 
                            type="text" 
                            class="form-input machine-ip-input" 
                            data-id="${m.id}" 
                            value="${escapeHtml(m.ip || '')}" 
                            placeholder="Misal: 192.168.1.10${m.id === 'A1' ? '1' : (m.id === 'A2' ? '2' : (m.id === 'A3' ? '3' : (m.id === 'B1' ? '4' : '5')))}" 
                            style="height: 36px; font-family: 'Courier New', monospace; font-size: 13px; font-weight: 600; min-width: 150px;"
                        >
                    </td>
                    <td>
                        <input 
                            type="text" 
                            class="form-input machine-path-input" 
                            data-id="${m.id}" 
                            value="${escapeHtml(displayPath)}" 
                            placeholder="Pd Info (atau path lokal/UNC)" 
                            style="height: 36px; font-family: 'Courier New', monospace; font-size: 12px; min-width: 180px;"
                        >
                    </td>
                    <td>
                        ${statusHtml}
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button 
                            type="button" 
                            class="btn btn-secondary btn-sm" 
                            style="padding: 4px 10px; font-size: 12px;"
                            onclick="testSingleMachine('${m.id}')"
                            title="Uji coba akses ke folder PC ini"
                        >
                            🔍 Tes
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

async function saveAllMachinesConfig() {
    const ipInputs = document.querySelectorAll('.machine-ip-input');
    if (ipInputs.length === 0) return;

    const machines = [];
    ipInputs.forEach(ipEl => {
        const id = ipEl.dataset.id;
        const pathEl = document.querySelector(`.machine-path-input[data-id="${id}"]`);
        const ipVal = ipEl.value.trim();
        const pathVal = pathEl ? pathEl.value.trim() : 'Pd Info';

        const existing = (currentWatcherData && currentWatcherData.machines)
            ? currentWatcherData.machines.find(m => m.id === id)
            : null;

        const brand = id === 'A1' ? 'Hanwha' : 'Samsung';
        const name = existing ? existing.name : `Line ${id}`;

        let customPath = '';
        let shareFolder = 'Pd Info';

        if (pathVal.includes('\\') || pathVal.includes('/') || pathVal.includes(':')) {
            customPath = pathVal;
        } else {
            shareFolder = pathVal || 'Pd Info';
        }

        machines.push({
            id,
            name,
            brand,
            ip: ipVal,
            shareFolder,
            path: customPath,
            enabled: true
        });
    });

    try {
        const response = await fetch('/api/machine-output/watcher-machines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ machines, enabled: true })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Konfigurasi 5 PC Mesin SMT berhasil disimpan!', 'success');
            currentWatcherData = result.data;
            renderWatcherStatus(result.data);
            await loadProcessedLogs();
            await loadMachineFeed();
        } else {
            showToast(result.error || 'Gagal menyimpan konfigurasi', 'error');
        }
    } catch (err) {
        console.error('Save machines config error:', err);
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

async function testSingleMachine(machineId) {
    const ipEl = document.querySelector(`.machine-ip-input[data-id="${machineId}"]`);
    const pathEl = document.querySelector(`.machine-path-input[data-id="${machineId}"]`);
    if (!ipEl) return;

    const ip = ipEl.value.trim();
    const pathVal = pathEl ? pathEl.value.trim() : 'Pd Info';
    const isCustom = pathVal.includes('\\') || pathVal.includes('/') || pathVal.includes(':');

    showToast(`Memeriksa koneksi ke Mesin ${machineId}...`, 'info');

    try {
        const response = await fetch('/api/machine-output/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip,
                path: isCustom ? pathVal : undefined,
                shareFolder: pathVal
            })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            if (result.reachable) {
                showToast(`Mesin ${machineId}: ${result.message}`, 'success');
            } else {
                showToast(`Mesin ${machineId}: ${result.message}`, 'warning');
            }
            await loadWatcherStatus(true);
        } else {
            showToast(result.error || 'Gagal mengetes koneksi', 'error');
        }
    } catch (err) {
        console.error('Test connection error:', err);
        showToast('Gagal menghubungi server', 'error');
    }
}

async function triggerManualScan() {
    const scanBtn = document.getElementById('watcherScanBtn');
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning 5 PC...';
    }

    try {
        const response = await fetch('/api/machine-output/watcher-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showToast(`Scan selesai! Ditemukan ${result.totalFilesFound} file .log (${result.processedCount} diproses, ${result.newMaterialsTotal} komponen)`, 'success');
            await loadWatcherStatus();
            await loadProcessedLogs();
            await loadMachineFeed();
            await loadDetectionHistory();
        } else {
            showToast(result.error || 'Gagal melakukan scan', 'error');
        }
    } catch (error) {
        console.error('Trigger scan error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = '⚡ Scan Semua Mesin Sekarang';
        }
    }
}

async function loadProcessedLogs(isSilent = false) {
    if (!isSuperAdminUser) return;
    const tbody = document.getElementById('processedLogsBody');
    if (!tbody) return;

    try {
        const response = await fetch('/api/machine-output/processed-logs');
        const result = await response.json();

        if (response.ok && result.success) {
            renderProcessedLogsTable(result.data || []);
        }
    } catch (error) {
        if (!isSilent) console.error('Failed to load processed logs:', error);
    }
}

function renderProcessedLogsTable(items) {
    const tbody = document.getElementById('processedLogsBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: var(--light-text); font-style: italic;">
                    Belum ada file log mesin yang diproses
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.slice(0, 15).map((item, idx) => {
        const badgeColor = getMeterColor(item.meter_type);
        return `
            <tr>
                <td style="color: var(--light-text); font-size: 13px;">${idx + 1}</td>
                <td style="font-size: 12px; color: var(--dark-text); white-space: nowrap;">
                    ⏱️ ${formatDateTime(item.processed_at)}
                </td>
                <td>
                    <span style="font-family: 'Courier New', monospace; font-size: 12px; font-weight: 600; color: #1e3a8a;">
                        📄 ${escapeHtml(item.file_name)}
                    </span>
                </td>
                <td>
                    <span style="background: ${badgeColor.bg}; border: 1px solid ${badgeColor.border}; color: ${badgeColor.text}; font-weight: 700; font-size: 11px; padding: 2px 7px; border-radius: 4px;">
                        ${escapeHtml(item.meter_type)}
                    </span>
                </td>
                <td style="font-size: 12px; font-weight: 600; color: #475569;">
                    Mesin ${escapeHtml(item.machine_line || '-')}
                </td>
                <td style="font-weight: 700; color: #15803d; font-size: 13px;">
                    ${formatNumber(item.total_pcs_consumed)} pcs (${item.total_materials_detected} part)
                </td>
            </tr>
        `;
    }).join('');
}

// ========== LOAD MACHINE FEED ==========

async function loadMachineFeed(isSilent = false) {
    const feedBody = document.getElementById('machineFeedBody');
    if (!feedBody) return;

    if (!isSilent) {
        feedBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px;">
                    <div class="spinner"></div>
                    <p style="margin-top: 10px; color: var(--light-text); font-size: 13px;">Memuat data pemakaian material mesin...</p>
                </td>
            </tr>
        `;
    }

    try {
        const searchInput = document.getElementById('feedSearchInput');
        const meterTypeFilter = document.getElementById('feedMeterTypeFilter');
        const statusFilter = document.getElementById('feedStatusFilter');

        const params = new URLSearchParams({
            search: searchInput ? searchInput.value.trim() : '',
            meterType: meterTypeFilter ? meterTypeFilter.value : '',
            status: statusFilter ? statusFilter.value : '',
            limit: 50
        });

        const response = await fetch(`/api/machine-output/feed?${params.toString()}`);
        const result = await response.json();

        if (response.ok && result.success) {
            currentFeed = result.data || [];
            updateSummaryCards(result.stats);
            renderFeedTable(currentFeed);
        } else {
            feedBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: var(--danger-color);">
                        Gagal memuat data output mesin
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Load machine feed error:', error);
        if (!isSilent) {
            feedBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: var(--danger-color);">
                        Terjadi kesalahan koneksi server
                    </td>
                </tr>
            `;
        }
    }
}

function updateSummaryCards(stats) {
    if (!stats) return;

    const totalMasukEl = document.getElementById('statTotalPcsMasuk');
    const totalTerpakaiEl = document.getElementById('statTotalPcsTerpakai');
    const totalSisaEl = document.getElementById('statTotalPcsSisa');
    const meterTypesCountEl = document.getElementById('statMeterTypesCount');

    if (totalMasukEl) totalMasukEl.textContent = `${formatNumber(stats.totalPcsMasuk || 0)} pcs`;
    if (totalTerpakaiEl) totalTerpakaiEl.textContent = `${formatNumber(stats.totalPcsTerpakai || 0)} pcs`;
    if (totalSisaEl) totalSisaEl.textContent = `${formatNumber(stats.totalPcsSisa || 0)} pcs`;
    if (meterTypesCountEl) meterTypesCountEl.textContent = `${stats.activeMeterTypesCount || 0} Type Meter`;
}

function renderFeedTable(items) {
    const feedBody = document.getElementById('machineFeedBody');
    if (!feedBody) return;

    if (!items || items.length === 0) {
        feedBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 45px; color: var(--light-text);">
                    <div style="font-size: 36px; margin-bottom: 8px;">📦</div>
                    <strong>Belum ada material dari Output Stok</strong>
                    <p style="font-size: 13px; margin: 4px 0 0 0; opacity: 0.85;">
                        Material yang dikeluarkan di halaman <strong>Output Stok</strong> akan otomatis tampil di sini dan siap dideteksi pemakaiannya per type meter.
                    </p>
                </td>
            </tr>
        `;
        return;
    }

    feedBody.innerHTML = items.map((item, index) => {
        const breakdowns = item.meterBreakdown || [];

        // Build meter type badges
        let meterBadgesHtml = '';
        if (breakdowns.length === 0) {
            meterBadgesHtml = `
                <span style="font-size: 12px; color: #9ca3af; font-style: italic;">
                    Belum ada pemakaian (Reel Utuh)
                </span>
            `;
        } else {
            meterBadgesHtml = breakdowns.map(b => {
                const badgeColor = getMeterColor(b.meterType);
                const percent = item.totalMasukMesin > 0 
                    ? Math.round((b.usedQuantity / item.totalMasukMesin) * 100) 
                    : 0;

                return `
                    <div style="display: inline-flex; align-items: center; gap: 6px; background: ${badgeColor.bg}; border: 1px solid ${badgeColor.border}; color: ${badgeColor.text}; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; margin: 2px 4px 2px 0;">
                        <span>🏷️ ${escapeHtml(b.meterType)}:</span>
                        <strong style="color: ${badgeColor.strong};">${formatNumber(b.usedQuantity)} pcs</strong>
                        <span style="opacity: 0.7; font-size: 11px;">(${percent}%)</span>
                    </div>
                `;
            }).join('');
        }

        // Progress bar for total used vs remaining
        const percent = item.persentaseTerpakai || 0;
        let progressColor = '#10b981';
        if (percent >= 100) progressColor = '#ef4444';
        else if (percent >= 80) progressColor = '#f59e0b';

        return `
            <tr>
                <td style="color: var(--light-text); font-size: 13px;">${index + 1}</td>
                <td>
                    <span class="badge" style="background: ${item.statusColor}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap;">
                        ${item.statusLabel}
                    </span>
                </td>
                <td>
                    <div style="font-family: 'Courier New', monospace; font-weight: 700; color: #1e40af; font-size: 14px;">
                        ${escapeHtml(item.materialId)}
                    </div>
                    <div style="font-size: 13px; font-weight: 600; color: var(--dark-text); margin-top: 2px;">
                        ${escapeHtml(item.materialName)}
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 14px; color: #1e3a8a;">
                    ${formatNumber(item.totalMasukMesin)} pcs
                    <div style="font-size: 11px; font-weight: normal; color: var(--light-text); margin-top: 2px;">
                        Keluar Stok: ${formatDateTime(item.stokOutputTime)} (${escapeHtml(item.stokOperator || '-')})
                    </div>
                </td>
                <td style="min-width: 240px;">
                    <div style="margin-bottom: 6px;">
                        ${meterBadgesHtml}
                    </div>
                    <div style="background: #e2e8f0; border-radius: 6px; height: 8px; overflow: hidden; width: 100%;">
                        <div style="background: ${progressColor}; width: ${percent}%; height: 100%; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--light-text); margin-top: 3px;">
                        <span>Terpakai: ${percent}%</span>
                        <span>Sisa: ${100 - percent}%</span>
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 14px; color: #b91c1c; white-space: nowrap;">
                    ${formatNumber(item.totalTerpakaiMesin)} pcs
                </td>
                <td style="font-weight: 700; font-size: 14px; color: #15803d; white-space: nowrap;">
                    ${formatNumber(item.sisaKomponenMesin)} pcs
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <button 
                        type="button" 
                        class="btn btn-primary btn-sm" 
                        style="padding: 5px 10px; font-size: 12px; background: #0284c7;"
                        onclick="openSimulateModal('${escapeSingleQuote(item.materialId)}', '${escapeSingleQuote(item.materialName)}', ${item.sisaKomponenMesin}, ${item.transactionId})"
                        title="Simulasi Deteksi Pemakaian LAN"
                    >
                        ⚡ Input Deteksi
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getMeterColor(meterType) {
    const norm = String(meterType || '').toUpperCase();
    if (norm.includes('128')) {
        return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', strong: '#1e40af' };
    }
    if (norm.includes('12FR')) {
        return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', strong: '#166534' };
    }
    if (norm.includes('310-KP') || norm.includes('310KP')) {
        return { bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d', strong: '#9d174d' };
    }
    if (norm.includes('310')) {
        return { bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce', strong: '#6b21a8' };
    }
    return { bg: '#f8fafc', border: '#cbd5e1', text: '#334155', strong: '#0f172a' };
}

// ========== LOAD DETECTION HISTORY (LAN & AUTO LOG) ==========

async function loadDetectionHistory(isSilent = false) {
    const historyBody = document.getElementById('detectionHistoryBody');
    if (!historyBody) return;

    if (!isSilent) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 24px;">
                    <div class="spinner"></div>
                </td>
            </tr>
        `;
    }

    try {
        const sortSelect = document.getElementById('historySortSelect');
        if (sortSelect && sortSelect.value) {
            currentHistorySort = sortSelect.value;
        }

        const params = new URLSearchParams({
            page: currentHistoryPage,
            limit: HISTORY_LIMIT,
            sort: currentHistorySort
        });

        const response = await fetch(`/api/machine-output/meter-history?${params.toString()}`);
        const result = await response.json();

        if (response.ok && result.success) {
            renderHistoryTable(result.data || [], result.pagination);
            renderHistoryPagination(result.pagination);
        } else {
            historyBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px; color: var(--danger-color);">
                        Gagal memuat riwayat deteksi
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        if (!isSilent) console.error('Load detection history error:', error);
    }
}

function renderHistoryTable(items, pagination) {
    const historyBody = document.getElementById('detectionHistoryBody');
    if (!historyBody) return;

    if (!items || items.length === 0) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 24px; color: var(--light-text); font-style: italic;">
                    Belum ada riwayat deteksi pemakaian dari PC Mesin / File Log
                </td>
            </tr>
        `;
        return;
    }

    const startIndex = pagination ? (pagination.page - 1) * pagination.limit : 0;

    historyBody.innerHTML = items.map((item, index) => {
        const color = getMeterColor(item.meter_type);

        return `
            <tr>
                <td style="color: var(--light-text); font-size: 13px;">${startIndex + index + 1}</td>
                <td style="font-size: 12px; color: var(--dark-text); white-space: nowrap;">
                    ⏱️ ${formatDateTime(item.created_at)}
                </td>
                <td>
                    <span style="font-family: 'Courier New', monospace; font-weight: 700; color: #1e3a8a;">
                        ${escapeHtml(item.material_id)}
                    </span>
                    <div style="font-size: 12px; color: var(--light-text);">${escapeHtml(item.material_name)}</div>
                </td>
                <td>
                    <span style="background: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}; font-weight: 700; font-size: 12px; padding: 3px 8px; border-radius: 4px;">
                        ${escapeHtml(item.meter_type)}
                    </span>
                </td>
                <td style="font-weight: 700; color: #b91c1c; font-size: 14px;">
                    -${formatNumber(item.used_quantity)} pcs
                </td>
                <td style="font-size: 12px; color: #475569;">
                    💻 ${escapeHtml(item.source_pc || 'PC Mesin')}
                    ${item.notes ? `<div style="font-size: 11px; color: #64748b; font-style: italic;">${escapeHtml(item.notes)}</div>` : ''}
                </td>
                <td style="text-align: right;">
                    <button 
                        type="button" 
                        class="btn btn-danger btn-sm" 
                        style="padding: 2px 6px; font-size: 11px;"
                        onclick="deleteHistoryItem(${item.id})"
                        title="Hapus riwayat deteksi ini"
                    >
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderHistoryPagination(pagination) {
    const container = document.getElementById('historyPagination');
    const infoEl = document.getElementById('historyPageInfo');
    if (!container) return;

    if (!pagination || pagination.total === 0) {
        container.innerHTML = '';
        if (infoEl) infoEl.textContent = 'Menampilkan 0 data';
        return;
    }

    const { page, total, totalPages, limit } = pagination;
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    if (infoEl) {
        infoEl.innerHTML = `Menampilkan <strong>${from}-${to}</strong> dari total <strong>${formatNumber(total)}</strong> riwayat (Hal. ${page}/${totalPages})`;
    }

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    if (page > 1) {
        html += `<button type="button" class="page-btn" onclick="changeHistoryPage(${page - 1})" title="Halaman Sebelumnya">&larr; Prev</button>`;
    } else {
        html += `<button type="button" class="page-btn" disabled style="opacity: 0.4; cursor: not-allowed;">&larr; Prev</button>`;
    }

    // Page numbers with ellipses
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button type="button" class="page-btn ${i === page ? 'active' : ''}" onclick="changeHistoryPage(${i})">${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += `<span style="padding: 4px 6px; color: var(--light-text); font-weight: bold;">...</span>`;
        }
    }

    // Next button
    if (page < totalPages) {
        html += `<button type="button" class="page-btn" onclick="changeHistoryPage(${page + 1})" title="Halaman Berikutnya">Next &rarr;</button>`;
    } else {
        html += `<button type="button" class="page-btn" disabled style="opacity: 0.4; cursor: not-allowed;">Next &rarr;</button>`;
    }

    container.innerHTML = html;
}

function changeHistoryPage(page) {
    currentHistoryPage = page;
    loadDetectionHistory();
}

function onHistorySortChange(sortVal) {
    currentHistorySort = sortVal;
    currentHistoryPage = 1; // Reset to page 1 on sort change
    loadDetectionHistory();
}

async function deleteHistoryItem(id) {
    if (!confirm('Batalkan dan hapus pencatatan pemakaian ini? Komponen akan dikembalikan ke sisa feeder.')) {
        return;
    }

    try {
        const response = await fetch(`/api/machine-output/meter-history/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Pencatatan pemakaian berhasil dibatalkan', 'success');
            await loadMachineFeed();
            await loadDetectionHistory();
        } else {
            showToast(data.error || 'Gagal menghapus riwayat', 'error');
        }
    } catch (error) {
        console.error('Delete history error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

// ========== SIMULATION / TEST DETECT MODAL ==========

function openSimulateModal(materialId, materialName, remainingQty, transactionId) {
    const modal = document.getElementById('simulateModal');
    if (!modal) return;

    document.getElementById('simMaterialId').value = materialId;
    document.getElementById('simMaterialName').textContent = `${materialName} (${materialId})`;
    document.getElementById('simRemainingPcs').textContent = `${formatNumber(remainingQty)} pcs`;
    document.getElementById('simTransactionId').value = transactionId || '';

    const qtyInput = document.getElementById('simUsedQuantity');
    if (qtyInput) {
        qtyInput.value = Math.min(1000, remainingQty > 0 ? remainingQty : 500);
        qtyInput.max = remainingQty;
    }

    modal.style.display = 'flex';
}

function closeSimulateModal() {
    const modal = document.getElementById('simulateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function submitSimulateDetection(e) {
    if (e) e.preventDefault();

    const materialId = document.getElementById('simMaterialId').value;
    const transactionId = document.getElementById('simTransactionId').value;
    const meterType = document.getElementById('simMeterType').value;
    const usedQty = parseInt(document.getElementById('simUsedQuantity').value, 10);
    const sourcePc = document.getElementById('simSourcePc').value || 'PC Mesin SMT (LAN)';

    if (!materialId || !meterType || isNaN(usedQty) || usedQty <= 0) {
        showToast('Pastikan Material, Type Meter, dan Jumlah diisi dengan benar', 'warning');
        return;
    }

    const submitBtn = document.getElementById('simSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Mengirim Sinyal LAN...';
    }

    try {
        const response = await fetch('/api/machine-output/detect-meter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                materialId,
                transactionId: transactionId ? parseInt(transactionId, 10) : undefined,
                meterType,
                usedQuantity: usedQty,
                sourcePc
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(data.message || 'Deteksi pemakaian berhasil dicatat!', 'success');
            closeSimulateModal();
            await loadMachineFeed();
            await loadDetectionHistory();
        } else {
            showToast(data.error || 'Gagal mencatat pemakaian', 'error');
        }
    } catch (error) {
        console.error('Simulate detection error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Kirim Sinyal Deteksi';
        }
    }
}

// ========== FILTERS ==========

function setupFilters() {
    const searchInput = document.getElementById('feedSearchInput');
    const meterFilter = document.getElementById('feedMeterTypeFilter');
    const statusFilter = document.getElementById('feedStatusFilter');

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadMachineFeed();
            }
        });
    }

    if (meterFilter) {
        meterFilter.addEventListener('change', () => loadMachineFeed());
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadMachineFeed());
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeSingleQuote(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
