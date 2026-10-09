// Output Mesin Page Logic - Automated Detection per Meter Type via LAN & Samsung/Hanwha Directory Watcher

let currentFeed = [];
let currentStats = null;
let autoRefreshTimer = null;
let lanInfoData = null;
let currentHistoryPage = 1;
const HISTORY_LIMIT = 10;
let currentHistorySort = 'desc';

let isSuperAdminUser = false;
let currentViewMode = 'grouped'; // 'grouped' or 'flat'
let selectedMachineFilter = 'ALL'; // 'ALL', 'A1', 'A2', 'A3', 'B1', 'B2', 'UNASSIGNED'

// 5 Mesin Mounting SMT: Line A (3 mesin) & Line B (2 mesin)
const SMT_MACHINE_DEFINITIONS = [
    {
        id: 'A1',
        line: 'Line A',
        machineNumber: 1,
        brand: 'Hanwha',
        folder: 'Pd Info/a1',
        name: 'Line A - Mesin A1 (Hanwha)',
        color: '#ea580c',
        badgeBg: '#fff7ed',
        badgeBorder: '#fdba74',
        badgeText: '#c2410c'
    },
    {
        id: 'A2',
        line: 'Line A',
        machineNumber: 2,
        brand: 'Samsung',
        folder: 'Pd Info/a2',
        name: 'Line A - Mesin A2 (Samsung)',
        color: '#2563eb',
        badgeBg: '#eff6ff',
        badgeBorder: '#bfdbfe',
        badgeText: '#1d4ed8'
    },
    {
        id: 'A3',
        line: 'Line A',
        machineNumber: 3,
        brand: 'Samsung',
        folder: 'Pd Info/a3',
        name: 'Line A - Mesin A3 (Samsung)',
        color: '#2563eb',
        badgeBg: '#eff6ff',
        badgeBorder: '#bfdbfe',
        badgeText: '#1d4ed8'
    },
    {
        id: 'B1',
        line: 'Line B',
        machineNumber: 1,
        brand: 'Samsung',
        folder: 'Pd Info/b1',
        name: 'Line B - Mesin B1 (Samsung)',
        color: '#4f46e5',
        badgeBg: '#eef2ff',
        badgeBorder: '#c7d2fe',
        badgeText: '#4338ca'
    },
    {
        id: 'B2',
        line: 'Line B',
        machineNumber: 2,
        brand: 'Samsung',
        folder: 'Pd Info/b2',
        name: 'Line B - Mesin B2 (Samsung)',
        color: '#4f46e5',
        badgeBg: '#eef2ff',
        badgeBorder: '#c7d2fe',
        badgeText: '#4338ca'
    }
];

function getMachineDef(machineId) {
    return SMT_MACHINE_DEFINITIONS.find(m => m.id === String(machineId).toUpperCase()) || null;
}

function switchViewMode(mode) {
    // Retained for backward compatibility
}

function filterByMachine(machineId) {
    selectedMachineFilter = machineId;

    const pills = document.querySelectorAll('#machineNavPills .machine-filter-pill');
    pills.forEach(pill => {
        const pMachine = pill.dataset.machine;
        if (pMachine === machineId) {
            pill.className = 'machine-filter-pill active shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer bg-[#091540] text-white border-[#091540]';
            const counter = pill.querySelector('span:last-child');
            if (counter) {
                counter.className = 'ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono';
            }
        } else {
            pill.className = 'machine-filter-pill shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer';
            const counter = pill.querySelector('span:last-child');
            if (counter) {
                counter.className = 'ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono';
            }
        }
    });

    renderFeedTable(currentFeed, currentStats);
    if (window.lucide) lucide.createIcons();
}

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
    const feedContainer = document.getElementById('machineFeedContainer');

    if (!isSilent && feedContainer) {
        feedContainer.innerHTML = `
            <div class="text-center py-10 bg-white rounded-xl border border-slate-200 shadow-xs">
                <div class="spinner"></div>
                <p class="mt-2 text-xs text-slate-400">Memuat data komponen mesin...</p>
            </div>
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
            limit: 100
        });

        const response = await fetch(`/api/machine-output/feed?${params.toString()}`);
        const result = await response.json();

        if (response.ok && result.success) {
            currentFeed = result.data || [];
            currentStats = result.stats || {};
            updateSummaryCards(currentStats);
            updatePillCounts(currentStats, currentFeed);
            renderFeedTable(currentFeed, currentStats);
        } else {
            if (feedContainer) {
                feedContainer.innerHTML = `
                    <div class="text-center py-8 bg-white rounded-xl border border-red-200 text-red-600 text-xs shadow-xs">
                        Gagal memuat data output mesin
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Load machine feed error:', error);
        if (!isSilent && feedContainer) {
            feedContainer.innerHTML = `
                <div class="text-center py-8 bg-white rounded-xl border border-red-200 text-red-600 text-xs shadow-xs">
                    Terjadi kesalahan koneksi server
                </div>
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

function updatePillCounts(stats, items) {
    const total = items ? items.length : 0;
    const counts = (stats && stats.machineCounts) || {};

    const elAll = document.getElementById('pillCountAll');
    const elA1 = document.getElementById('pillCountA1');
    const elA2 = document.getElementById('pillCountA2');
    const elA3 = document.getElementById('pillCountA3');
    const elB1 = document.getElementById('pillCountB1');
    const elB2 = document.getElementById('pillCountB2');
    const elUnassigned = document.getElementById('pillCountUnassigned');

    if (elAll) elAll.textContent = total;
    if (elA1) elA1.textContent = counts.A1 || 0;
    if (elA2) elA2.textContent = counts.A2 || 0;
    if (elA3) elA3.textContent = counts.A3 || 0;
    if (elB1) elB1.textContent = counts.B1 || 0;
    if (elB2) elB2.textContent = counts.B2 || 0;
    if (elUnassigned) elUnassigned.textContent = counts.UNASSIGNED || 0;
}

// ========== RENDER FEED TABLE ==========

function renderFeedTable(items, stats) {
    const container = document.getElementById('machineFeedContainer');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-xs">
                <div class="text-4xl mb-2">📦</div>
                <h3 class="text-sm font-bold text-slate-800">Belum ada material dari Output Stok</h3>
                <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Material yang dikeluarkan di halaman <strong>Output Stok</strong> akan otomatis tampil di sini dan dikelompokkan sesuai mesin mounting Samsung &amp; Hanwha.
                </p>
            </div>
        `;
        return;
    }

    // 1. JIKA TAB 'SEMUA MESIN': CUKUP 1 CARD AJA DENGAN KOLOM 'LINI / MESIN'
    if (selectedMachineFilter === 'ALL') {
        renderAllMachinesSingleCard(container, items, stats);
        return;
    }

    // 2. JIKA TAB 'ANTRIAN STOK' (BELUM MASUK MESIN)
    if (selectedMachineFilter === 'UNASSIGNED') {
        renderUnassignedCard(container, items);
        return;
    }

    // 3. JIKA TAB MESIN TERTENTU (A1, A2, A3, B1, B2)
    renderSingleMachineCard(container, items, selectedMachineFilter);
}

// 1 CARD TUNGGAL UNTUK TAB 'SEMUA MESIN' (DENGAN KOLOM 'LINI / MESIN')
function renderAllMachinesSingleCard(container, items, stats) {
    const totalMasuk = items.reduce((acc, it) => acc + (Number(it.totalMasukMesin) || 0), 0);
    const totalTerpakai = items.reduce((acc, it) => acc + (Number(it.totalTerpakaiMesin) || 0), 0);
    const totalSisa = items.reduce((acc, it) => acc + (Number(it.sisaKomponenMesin) || 0), 0);

    container.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <!-- Header Banner 1 Card Semua Mesin -->
            <div class="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <span class="w-3.5 h-3.5 rounded-full bg-blue-700 shrink-0 shadow-xs"></span>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-sm sm:text-base font-bold text-slate-900">Semua Mesin SMT (Line A &amp; Line B)</h3>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                5 MESIN + ANTRIAN
                            </span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">
                            Menampilkan seluruh komponen pada 5 mesin mounting (Line A1 Hanwha, A2-A3 Samsung, B1-B2 Samsung)
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap text-xs shrink-0">
                    <span class="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-semibold text-slate-700 shadow-2xs">
                        ${items.length} Komponen
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                        Masuk: ${formatNumber(totalMasuk)} pcs
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-red-50 text-red-700 font-bold border border-red-100">
                        Terpakai: ${formatNumber(totalTerpakai)} pcs
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                        Sisa: ${formatNumber(totalSisa)} pcs
                    </span>
                </div>
            </div>

            <!-- Tabel 1 Card dengan Kolom 'Lini / Mesin' -->
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50/60 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                        <tr>
                            <th class="py-2.5 px-3 w-9">#</th>
                            <th class="py-2.5 px-3 w-[160px]">Lini / Mesin</th>
                            <th class="py-2.5 px-3 w-[120px]">Status Feeder</th>
                            <th class="py-2.5 px-3">Material ID &amp; Spesifikasi</th>
                            <th class="py-2.5 px-3">Total Masuk (Stok)</th>
                            <th class="py-2.5 px-3 min-w-[200px]">Rincian Pemakaian per Type Meter</th>
                            <th class="py-2.5 px-3">Total Terpakai</th>
                            <th class="py-2.5 px-3">Sisa Feeder</th>
                            <th class="py-2.5 px-3 text-right w-[150px]">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${renderAllMachinesTableRows(items)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

// Render baris untuk tabel 1 card 'Semua Mesin'
function renderAllMachinesTableRows(items) {
    return items.map((item, index) => {
        const breakdowns = item.meterBreakdown || [];

        let meterBadgesHtml = '';
        if (breakdowns.length === 0) {
            meterBadgesHtml = `
                <span style="font-size: 11px; color: #9ca3af; font-style: italic;">
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
                    <div style="display: inline-flex; align-items: center; gap: 4px; background: ${badgeColor.bg}; border: 1px solid ${badgeColor.border}; color: ${badgeColor.text}; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-weight: 600; margin: 2px 4px 2px 0;">
                        <span>🏷️ ${escapeHtml(b.meterType)}:</span>
                        <strong style="color: ${badgeColor.strong};">${formatNumber(b.usedQuantity)} pcs</strong>
                        <span style="opacity: 0.7; font-size: 10px;">(${percent}%)</span>
                    </div>
                `;
            }).join('');
        }

        const percent = item.persentaseTerpakai || 0;
        let progressColor = '#10b981';
        if (percent >= 100) progressColor = '#ef4444';
        else if (percent >= 80) progressColor = '#f59e0b';

        // Kolom Lini / Mesin (menampilkan mesin mananya dengan jelas)
        const machineMeta = getMachineDef(item.machineId);
        let machineCellHtml = '';
        if (machineMeta) {
            machineCellHtml = `
                <div>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold" style="background: ${machineMeta.badgeBg}; border: 1px solid ${machineMeta.badgeBorder}; color: ${machineMeta.badgeText}; white-space: nowrap;">
                        <span class="w-2 h-2 rounded-full" style="background: ${machineMeta.color};"></span>
                        <span>${escapeHtml(machineMeta.line)} • ${machineMeta.id}</span>
                        <span class="text-[10px] opacity-80">(${machineMeta.brand})</span>
                    </span>
                    <div class="text-[10px] text-slate-400 font-mono mt-0.5" title="Folder log: ${escapeHtml(machineMeta.folder)}">
                        📁 ${escapeHtml(machineMeta.folder)}
                    </div>
                </div>
            `;
        } else {
            machineCellHtml = `
                <div>
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                        <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                        <span>Antrian Stok</span>
                    </span>
                    <div class="text-[10px] text-amber-600 font-medium mt-0.5">Belum di mesin</div>
                </div>
            `;
        }

        const itemTitleEscaped = escapeSingleQuote(item.specification || item.materialName || item.materialId);

        return `
            <tr class="hover:bg-slate-50/70 transition-colors">
                <td style="color: var(--light-text); font-size: 12px; font-weight: 500;">${index + 1}</td>
                <td>${machineCellHtml}</td>
                <td>
                    <span class="badge" style="background: ${item.statusColor}; color: white; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap;">
                        ${item.statusLabel}
                    </span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-family: 'Courier New', monospace; font-weight: 700; color: #1e40af; font-size: 13px;">
                            ${escapeHtml(item.materialId)}
                        </span>
                        ${item.rid ? `<span class="badge" style="background-color: #dbeafe; color: #1e40af; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-weight: 600;">RID: ${escapeHtml(item.rid)}</span>` : ''}
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: var(--dark-text); margin-top: 2px;">
                        ${escapeHtml(item.specification || item.materialName)}
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 13px; color: #1e3a8a;">
                    ${formatNumber(item.totalMasukMesin)} pcs
                    <div style="font-size: 10px; font-weight: normal; color: var(--light-text); margin-top: 2px;">
                        Stok: ${formatDateTime(item.stokOutputTime)} (${escapeHtml(item.stokOperator || '-')})
                    </div>
                </td>
                <td>
                    <div style="margin-bottom: 5px;">
                        ${meterBadgesHtml}
                    </div>
                    <div style="background: #e2e8f0; border-radius: 6px; height: 6px; overflow: hidden; width: 100%;">
                        <div style="background: ${progressColor}; width: ${percent}%; height: 100%; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--light-text); margin-top: 2px;">
                        <span>Terpakai: ${percent}%</span>
                        <span>Sisa: ${100 - percent}%</span>
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 13px; color: #b91c1c; white-space: nowrap;">
                    ${formatNumber(item.totalTerpakaiMesin)} pcs
                </td>
                <td style="font-weight: 700; font-size: 13px; color: #15803d; white-space: nowrap;">
                    ${formatNumber(item.sisaKomponenMesin)} pcs
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                        <button 
                            type="button" 
                            class="btn btn-primary btn-sm" 
                            style="padding: 4px 8px; font-size: 11px; background: #0284c7;"
                            onclick="openTestFolderModal('${item.machineId || ''}')"
                            title="Uji koneksi ke folder Pd Info mesin ini"
                        >
                            🔍 Tes Pd Info
                        </button>
                        ${isSuperAdminUser ? `
                        <button 
                            type="button" 
                            class="btn btn-secondary btn-sm" 
                            style="padding: 4px 8px; font-size: 11px;"
                            onclick="openAssignMachineModal(${item.transactionId}, '${escapeSingleQuote(item.materialId)}', '${itemTitleEscaped}', '${item.machineId || ''}')"
                            title="Pindah / Tugaskan ke Mesin SMT Lain (Khusus Superadmin)"
                        >
                            🔄 Mesin
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Render card tunggal untuk tab mesin spesifik (A1, A2, A3, B1, B2)
function renderSingleMachineCard(container, items, machineId) {
    const m = getMachineDef(machineId);
    if (!m) return;

    const machineItems = items.filter(it => it.machineId === m.id);
    const totalMasuk = machineItems.reduce((acc, it) => acc + (Number(it.totalMasukMesin) || 0), 0);
    const totalTerpakai = machineItems.reduce((acc, it) => acc + (Number(it.totalTerpakaiMesin) || 0), 0);
    const totalSisa = machineItems.reduce((acc, it) => acc + (Number(it.sisaKomponenMesin) || 0), 0);

    let tableContent = '';
    if (machineItems.length === 0) {
        tableContent = `
            <div class="p-8 text-center bg-white text-slate-400">
                <p class="text-xs font-medium text-slate-600">Belum ada komponen di feeder ${m.name}</p>
                <p class="text-[11px] text-slate-400 mt-1">
                    Komponen dari <strong>Output Stok</strong> yang terdeteksi di log folder <code class="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">${m.folder}</code> atau ditugaskan manual akan otomatis tampil di sini.
                </p>
            </div>
        `;
    } else {
        tableContent = `
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                        <tr>
                            <th class="py-2.5 px-3 w-9">#</th>
                            <th class="py-2.5 px-3 w-[130px]">Status Feeder</th>
                            <th class="py-2.5 px-3">Material ID &amp; Spesifikasi</th>
                            <th class="py-2.5 px-3">Total Masuk (Stok)</th>
                            <th class="py-2.5 px-3 min-w-[220px]">Rincian Pemakaian per Type Meter</th>
                            <th class="py-2.5 px-3">Total Terpakai</th>
                            <th class="py-2.5 px-3">Sisa Feeder</th>
                            <th class="py-2.5 px-3 text-right w-[160px]">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${renderItemRows(machineItems, m.id)}
                    </tbody>
                </table>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all duration-200">
            <!-- Machine Section Header Banner -->
            <div class="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs" style="background: ${m.color}"></span>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-sm sm:text-base font-bold text-slate-900">${m.name}</h3>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase" style="background: ${m.badgeBg}; border: 1px solid ${m.badgeBorder}; color: ${m.badgeText};">
                                ${m.brand}
                            </span>
                            <span class="text-[11px] font-mono font-medium text-slate-600 bg-white px-2.5 py-0.5 rounded border border-slate-200 shadow-2xs" title="Folder share/lokal tempat file log mesin ditaruh">
                                📁 ${m.folder}
                            </span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">
                            Pemotongan komponen otomatis memantau file <span class="font-mono text-slate-700 font-semibold">.log</span> dari folder ini
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap text-xs shrink-0">
                    <span class="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-semibold text-slate-700 shadow-2xs">
                        ${machineItems.length} Komponen
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                        Masuk: ${formatNumber(totalMasuk)} pcs
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-red-50 text-red-700 font-bold border border-red-100">
                        Terpakai: ${formatNumber(totalTerpakai)} pcs
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                        Sisa: ${formatNumber(totalSisa)} pcs
                    </span>
                </div>
            </div>

            ${tableContent}
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

// Render card tunggal untuk tab 'Antrian Stok' (UNASSIGNED)
function renderUnassignedCard(container, items) {
    const unassignedItems = items.filter(it => !it.machineId || it.machineId === 'UNASSIGNED');
    const totalMasuk = unassignedItems.reduce((acc, it) => acc + (Number(it.totalMasukMesin) || 0), 0);
    const totalTerpakai = unassignedItems.reduce((acc, it) => acc + (Number(it.totalTerpakaiMesin) || 0), 0);
    const totalSisa = unassignedItems.reduce((acc, it) => acc + (Number(it.sisaKomponenMesin) || 0), 0);

    let tableContent = '';
    if (unassignedItems.length === 0) {
        tableContent = `
            <div class="p-8 text-center text-slate-400 bg-white">
                <p class="text-xs">Tidak ada komponen dalam antrian. Semua komponen sudah terpasang di 5 mesin SMT.</p>
            </div>
        `;
    } else {
        tableContent = `
            <div class="overflow-x-auto bg-white">
                <table class="w-full text-xs text-left">
                    <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                        <tr>
                            <th class="py-2.5 px-3 w-9">#</th>
                            <th class="py-2.5 px-3 w-[130px]">Status Feeder</th>
                            <th class="py-2.5 px-3">Material ID &amp; Spesifikasi</th>
                            <th class="py-2.5 px-3">Total Masuk (Stok)</th>
                            <th class="py-2.5 px-3 min-w-[220px]">Rincian Pemakaian per Type Meter</th>
                            <th class="py-2.5 px-3">Total Terpakai</th>
                            <th class="py-2.5 px-3">Sisa Feeder</th>
                            <th class="py-2.5 px-3 text-right w-[160px]">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${renderItemRows(unassignedItems, '')}
                    </tbody>
                </table>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="rounded-xl border border-dashed border-amber-300 bg-amber-50/30 shadow-xs overflow-hidden">
            <div class="p-4 sm:p-5 border-b border-amber-200 bg-amber-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <span class="w-3.5 h-3.5 rounded-full bg-amber-400 shrink-0"></span>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-sm sm:text-base font-bold text-amber-950">Antrian Material (Belum Masuk Mesin)</h3>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                MENUNGGU LOG MESIN / PENUGASAN
                            </span>
                        </div>
                        <p class="text-xs text-amber-700/80 mt-0.5">
                            Material baru dikeluarkan dari Output Stok. Sistem akan otomatis menugaskan mesin saat membaca log <span class="font-mono font-semibold">.log</span> atau Anda dapat menugaskannya manual dengan tombol <strong>🔄 Mesin</strong>.
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap text-xs shrink-0">
                    <span class="px-2.5 py-1 rounded-md bg-white border border-amber-200 font-semibold text-amber-800">
                        ${unassignedItems.length} Komponen
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                        Masuk: ${formatNumber(totalMasuk)} pcs
                    </span>
                    <span class="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                        Sisa: ${formatNumber(totalSisa)} pcs
                    </span>
                </div>
            </div>

            ${tableContent}
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

// Render baris untuk tabel spesifik per mesin
function renderItemRows(items, defaultMachineId) {
    return items.map((item, index) => {
        const breakdowns = item.meterBreakdown || [];

        let meterBadgesHtml = '';
        if (breakdowns.length === 0) {
            meterBadgesHtml = `
                <span style="font-size: 11px; color: #94a3b8; font-style: italic;">
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
                    <div style="display: inline-flex; align-items: center; gap: 4px; background: ${badgeColor.bg}; border: 1px solid ${badgeColor.border}; color: ${badgeColor.text}; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-weight: 600; margin: 2px 4px 2px 0;">
                        <span>🏷️ ${escapeHtml(b.meterType)}:</span>
                        <strong style="color: ${badgeColor.strong};">${formatNumber(b.usedQuantity)} pcs</strong>
                        <span style="opacity: 0.7; font-size: 10px;">(${percent}%)</span>
                    </div>
                `;
            }).join('');
        }

        const percent = item.persentaseTerpakai || 0;
        let progressColor = '#10b981';
        if (percent >= 100) progressColor = '#ef4444';
        else if (percent >= 80) progressColor = '#f59e0b';

        const effectiveMachineId = item.machineId || defaultMachineId || '';
        const itemTitleEscaped = escapeSingleQuote(item.specification || item.materialName || item.materialId);

        return `
            <tr class="hover:bg-slate-50/70 transition-colors">
                <td style="color: var(--light-text); font-size: 12px; font-weight: 500;">${index + 1}</td>
                <td>
                    <span class="badge" style="background: ${item.statusColor}; color: white; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap;">
                        ${item.statusLabel}
                    </span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-family: 'Courier New', monospace; font-weight: 700; color: #1e40af; font-size: 13px;">
                            ${escapeHtml(item.materialId)}
                        </span>
                        ${item.rid ? `<span class="badge" style="background-color: #dbeafe; color: #1e40af; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-weight: 600;">RID: ${escapeHtml(item.rid)}</span>` : ''}
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: var(--dark-text); margin-top: 2px;">
                        ${escapeHtml(item.specification || item.materialName)}
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 13px; color: #1e3a8a;">
                    ${formatNumber(item.totalMasukMesin)} pcs
                    <div style="font-size: 10px; font-weight: normal; color: var(--light-text); margin-top: 2px;">
                        Stok: ${formatDateTime(item.stokOutputTime)} (${escapeHtml(item.stokOperator || '-')})
                    </div>
                </td>
                <td>
                    <div style="margin-bottom: 5px;">
                        ${meterBadgesHtml}
                    </div>
                    <div style="background: #e2e8f0; border-radius: 6px; height: 6px; overflow: hidden; width: 100%;">
                        <div style="background: ${progressColor}; width: ${percent}%; height: 100%; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--light-text); margin-top: 2px;">
                        <span>Terpakai: ${percent}%</span>
                        <span>Sisa: ${100 - percent}%</span>
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 13px; color: #b91c1c; white-space: nowrap;">
                    ${formatNumber(item.totalTerpakaiMesin)} pcs
                </td>
                <td style="font-weight: 700; font-size: 13px; color: #15803d; white-space: nowrap;">
                    ${formatNumber(item.sisaKomponenMesin)} pcs
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center; gap: 4px;">
                        <button 
                            type="button" 
                            class="btn btn-primary btn-sm" 
                            style="padding: 4px 8px; font-size: 11px; background: #0284c7;"
                            onclick="openTestFolderModal('${effectiveMachineId || item.machineId || ''}')"
                            title="Uji koneksi ke folder Pd Info mesin ini"
                        >
                            🔍 Tes Pd Info
                        </button>
                        ${isSuperAdminUser ? `
                        <button 
                            type="button" 
                            class="btn btn-secondary btn-sm" 
                            style="padding: 4px 8px; font-size: 11px;"
                            onclick="openAssignMachineModal(${item.transactionId}, '${escapeSingleQuote(item.materialId)}', '${itemTitleEscaped}', '${effectiveMachineId}')"
                            title="Pindah / Tugaskan ke Mesin SMT Lain (Khusus Superadmin)"
                        >
                            🔄 Mesin
                        </button>
                        ` : ''}
                    </div>
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
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-family: 'Courier New', monospace; font-weight: 700; color: #1e3a8a;">
                            ${escapeHtml(item.material_id)}
                        </span>
                        ${item.rid ? `<span class="badge" style="background-color: #e0f2fe; color: #0369a1; font-size: 11px; padding: 1px 6px; border-radius: 3px; font-family: monospace; font-weight: 600;">RID: ${escapeHtml(item.rid)}</span>` : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--light-text);">${escapeHtml(item.specification || item.material_name)}</div>
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
                    ${item.machine_id ? `<span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 700; margin-right: 4px;">${escapeHtml(item.line_id ? (item.line_id + ' ' + item.machine_id) : ('Mesin ' + item.machine_id))}</span>` : ''}
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

// ========== TEST MACHINE FOLDER CONNECTION MODAL ==========

let currentTestingMachineId = 'A1';

async function openTestFolderModal(machineId) {
    const modal = document.getElementById('testFolderModal');
    if (!modal) return;

    if (!machineId || machineId === 'UNASSIGNED') {
        showToast('Material ini berada di antrian stok dan belum ditugaskan ke mesin tertentu. Klik tombol 🔄 Mesin untuk menugaskan.', 'info');
        return;
    }

    currentTestingMachineId = machineId;
    modal.style.display = 'flex';

    const banner = document.getElementById('testConnStatusBanner');
    const icon = document.getElementById('testConnIcon');
    const title = document.getElementById('testConnTitle');
    const msg = document.getElementById('testConnMessage');
    const machineNameEl = document.getElementById('testConnMachineName');
    const machineBrandEl = document.getElementById('testConnMachineBrand');
    const folderPathEl = document.getElementById('testConnFolderPath');
    const logCountEl = document.getElementById('testConnLogCount');
    const latestLogEl = document.getElementById('testConnLatestLog');

    // Reset to loading state
    if (banner) {
        banner.className = 'p-4 rounded-xl border flex items-start gap-3 bg-blue-50 border-blue-200';
    }
    if (icon) icon.textContent = '⏳';
    if (title) title.textContent = `Memeriksa koneksi folder Pd Info (${machineId})...`;
    if (msg) msg.textContent = 'Sedang memeriksa akses direktori dan file .log mesin...';
    if (machineNameEl) machineNameEl.textContent = `Mesin ${machineId}`;
    if (machineBrandEl) machineBrandEl.textContent = '-';
    if (folderPathEl) folderPathEl.textContent = 'Menghubungkan...';
    if (logCountEl) logCountEl.textContent = '-';
    if (latestLogEl) latestLogEl.textContent = '-';

    try {
        const response = await fetch('/api/machine-output/test-machine-folder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ machineId })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            if (machineNameEl) machineNameEl.textContent = data.machineName || `Mesin ${machineId}`;
            if (machineBrandEl) machineBrandEl.textContent = data.brand || '-';
            if (folderPathEl) folderPathEl.textContent = data.folderPath || '-';
            if (logCountEl) logCountEl.textContent = `${data.logFilesCount || 0} file`;

            if (data.latestLogFile) {
                const fDate = new Date(data.latestLogFile.mtime).toLocaleString('id-ID');
                const fSize = (data.latestLogFile.size / 1024).toFixed(1);
                if (latestLogEl) latestLogEl.innerHTML = `<strong>${escapeHtml(data.latestLogFile.name)}</strong> (${fSize} KB)<br><span class="text-slate-400">${fDate}</span>`;
            } else {
                if (latestLogEl) latestLogEl.textContent = 'Belum ada file .log di folder ini';
            }

            if (data.reachable) {
                if (banner) banner.className = 'p-4 rounded-xl border flex items-start gap-3 bg-emerald-50 border-emerald-200';
                if (icon) icon.textContent = '🟢';
                if (title) title.textContent = 'Terhubung! Folder Pd Info Dapat Diakses';
                if (msg) msg.textContent = data.message || `Web berhasil membaca folder log mesin ${data.machineName}. Pemakaian komponen akan terdeteksi secara otomatis.`;
            } else {
                if (banner) banner.className = 'p-4 rounded-xl border flex items-start gap-3 bg-amber-50 border-amber-200';
                if (icon) icon.textContent = '⚠️';
                if (title) title.textContent = 'Folder Tidak Dapat Diakses / Offline';
                if (msg) msg.textContent = data.message || `Folder Pd Info belum ditemukan atau belum dapat diakses oleh server web.`;
            }
        } else {
            if (banner) banner.className = 'p-4 rounded-xl border flex items-start gap-3 bg-rose-50 border-rose-200';
            if (icon) icon.textContent = '❌';
            if (title) title.textContent = 'Gagal Memeriksa Folder';
            if (msg) msg.textContent = data.error || 'Terjadi kesalahan saat memeriksa folder mesin.';
        }
    } catch (err) {
        console.error('Error testing machine folder:', err);
        if (banner) banner.className = 'p-4 rounded-xl border flex items-start gap-3 bg-rose-50 border-rose-200';
        if (icon) icon.textContent = '❌';
        if (title) title.textContent = 'Koneksi Gagal';
        if (msg) msg.textContent = 'Tidak dapat menghubungi server web backend.';
    }
}

function closeTestFolderModal() {
    const modal = document.getElementById('testFolderModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function triggerScanFromModal() {
    const scanBtn = document.getElementById('triggerScanModalBtn');
    const originalText = scanBtn ? scanBtn.innerHTML : '';
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Membaca Log...';
    }

    try {
        const response = await fetch('/api/machine-output/watcher-scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (response.ok && data.success) {
            showToast(data.message || 'Log berhasil diproses dan pemakaian diperbarui!', 'success');
            await loadMachineFeed();
            if (currentTestingMachineId) {
                openTestFolderModal(currentTestingMachineId);
            }
        } else {
            showToast(data.error || 'Gagal memindai log folder', 'error');
        }
    } catch (err) {
        console.error('Watcher scan error:', err);
        showToast('Terjadi kesalahan jaringan saat memindai log', 'error');
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = originalText;
        }
    }
}

// ========== ASSIGN / REASSIGN MACHINE MODAL ==========

function openAssignMachineModal(transactionId, materialId, materialName, currentMachineId = '') {
    if (!isSuperAdminUser) {
        showToast('Akses dibatasi. Fitur penugasan mesin manual khusus Superadmin.', 'warning');
        return;
    }
    const modal = document.getElementById('assignMachineModal');
    if (!modal) return;

    document.getElementById('assignTransactionId').value = transactionId || '';
    document.getElementById('assignMaterialId').value = materialId || '';
    document.getElementById('assignMaterialName').textContent = `${materialName} (${materialId})`;

    const curMeta = getMachineDef(currentMachineId);
    const curMachineEl = document.getElementById('assignCurrentMachine');
    if (curMachineEl) {
        curMachineEl.textContent = curMeta ? curMeta.name : (currentMachineId ? `Mesin ${currentMachineId}` : 'Belum Ditugaskan (Antrian Stok)');
    }

    const targetSelect = document.getElementById('targetMachineSelect');
    if (targetSelect) {
        if (currentMachineId && ['A1', 'A2', 'A3', 'B1', 'B2'].includes(currentMachineId.toUpperCase())) {
            targetSelect.value = currentMachineId.toUpperCase();
        } else {
            targetSelect.value = 'A1';
        }
    }

    modal.style.display = 'flex';
}

function closeAssignMachineModal() {
    const modal = document.getElementById('assignMachineModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function submitAssignMachine(e) {
    if (e) e.preventDefault();

    const transactionId = document.getElementById('assignTransactionId').value;
    const materialId = document.getElementById('assignMaterialId').value;
    const targetSelect = document.getElementById('targetMachineSelect');
    const machineId = targetSelect ? targetSelect.value : '';

    if (!transactionId || !machineId) {
        showToast('Pilih mesin tujuan penugasan', 'warning');
        return;
    }

    const submitBtn = document.getElementById('assignSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menyimpan...';
    }

    try {
        const response = await fetch('/api/machine-output/assign-machine', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transactionId: parseInt(transactionId, 10),
                machineId
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(data.message || `Komponen berhasil ditugaskan ke Mesin ${machineId}!`, 'success');
            closeAssignMachineModal();
            await loadMachineFeed();
        } else {
            showToast(data.error || 'Gagal menugaskan mesin', 'error');
        }
    } catch (error) {
        console.error('Assign machine error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Simpan Penugasan Mesin';
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

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initMachinePage();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initMachinePage();
}
