// ==========================================================================
// OUTREACH // DTC AD ENGINE — Frontend Controller
// Inspired by Discord, Slack & Linear (Warm, Approachable, High-Contrast)
// Architecture: Left-Rail Sidebar + High-Density Right Workstation
// Specialization: End-to-End DTC Performance Ad Creatives
// ==========================================================================

let activeTab = 'dashboard';
let currentCampaignId = 1;
let leadsCache = [];
let companiesCache = [];
let inboxesCache = [];
let repliesCache = [];
let queueCache = [];
let selectedLeadId = null;
let leadFilterQuery = '';
let studioFilterQuery = '';
let stagedCsvFile = null;

const DTC_SHOWCASE_URL = "https://dtc-creatives.agency/showcase";

// ── Theme Manager (Black Dark Mode vs White Mode) ─────────────────────────

function initTheme() {
  const saved = localStorage.getItem('outreach_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');

  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.content = isLight ? 'light' : 'dark';

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) metaThemeColor.content = isLight ? '#f8fafc' : '#0b0c10';

  // Update topbar toggle button
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  if (icon) {
    icon.className = isLight ? 'fa-solid fa-moon text-blue-500' : 'fa-solid fa-sun text-amber-500';
  }
  if (label) {
    label.innerText = isLight ? 'Dark Mode' : 'White Mode';
  }

  // Update sidebar indicators if present
  document.querySelectorAll('.theme-sidebar-icon').forEach(el => {
    el.className = isLight ? 'theme-sidebar-icon fa-solid fa-moon text-blue-500 text-[11px]' : 'theme-sidebar-icon fa-solid fa-sun text-amber-500 text-[11px]';
  });
  document.querySelectorAll('.theme-current-badge').forEach(el => {
    el.innerText = isLight ? 'WHITE' : 'DARK';
  });

  localStorage.setItem('outreach_theme', isLight ? 'light' : 'dark');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  showAppleToast(next === 'light' ? 'Switched to White Mode' : 'Switched to Dark Mode');
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initDialogPolyfill();
  initKeyboardShortcuts();
  await refreshAll();

  // Periodic polling for deliverability metrics, queue, and prospect replies
  setInterval(() => {
    fetchMetrics();
    if (activeTab === 'replies' || activeTab === 'dashboard') fetchReplies();
    if (activeTab === 'queue' || activeTab === 'dashboard') fetchQueue();
  }, 10000);
});

async function refreshAll() {
  await Promise.all([
    fetchMetrics(),
    fetchInboxes(),
    fetchCompaniesAndLeads(),
    fetchQueue(),
    fetchReplies(),
  ]);
}

// ── Mobile Sidebar Drawer ──────────────────────────────────────────────────

function toggleMobileSidebar() {
  const rail = document.getElementById('sidebar-rail');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!rail || !backdrop) return;

  const isOpen = !rail.classList.contains('-translate-x-full');
  if (isOpen) {
    rail.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  } else {
    rail.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
  }
}

// ── Toast HUD Notification (Friendly, Subtle Blue & Warm Amber) ───────────

function showAppleToast(message, isError = false) {
  const toast = document.getElementById('apple-toast');
  const text = document.getElementById('apple-toast-text');
  if (!toast || !text) return;

  text.innerText = message;
  const dot = toast.querySelector('span');
  if (dot) {
    dot.style.background = isError ? '#f59e0b' : '#3b82f6';
    dot.style.boxShadow = isError ? '0 0 8px rgba(245,158,11,0.5)' : '0 0 8px rgba(59,130,246,0.5)';
  }

  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3200);
}

// ── Tab Management ────────────────────────────────────────────────────────

const TAB_TITLES = {
  dashboard: 'COMMAND CENTER',
  import: '1. IMPORT & SETUP',
  companies: '2. DTC BRANDS',
  studio: '3. AD CREATIVE STUDIO',
  inboxes: '4. SENDER ACCOUNTS',
  queue: '5. DISPATCH QUEUE',
  replies: '6. RESPONSES & BUMPS',
};

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nt-sidebar-item').forEach(el => el.classList.remove('active'));

  const pane = document.getElementById(`tab-${tabId}`);
  const btn = document.getElementById(`nav-${tabId}`);
  if (pane) pane.classList.remove('hidden');
  if (btn) btn.classList.add('active');

  const topbarTitle = document.getElementById('topbar-current-view');
  if (topbarTitle && TAB_TITLES[tabId]) {
    topbarTitle.innerText = TAB_TITLES[tabId];
  }

  // Close mobile sidebar on navigation
  const rail = document.getElementById('sidebar-rail');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (rail && window.innerWidth < 768) {
    rail.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }

  if (tabId === 'companies' || tabId === 'studio' || tabId === 'dashboard') {
    fetchCompaniesAndLeads();
  } else if (tabId === 'inboxes') {
    fetchInboxes();
  } else if (tabId === 'queue') {
    fetchQueue();
  } else if (tabId === 'replies') {
    fetchReplies();
  }
}

// ── Metrics & Dynamic Fleet Capacity ──────────────────────────────────────

async function fetchMetrics() {
  try {
    const res = await fetch('/api/deliverability/metrics');
    if (!res.ok) return;
    const m = await res.json();

    const elTotal = document.getElementById('metric-total-inboxes');
    const elCap = document.getElementById('metric-capacity');
    const elHourly = document.getElementById('metric-hourly-rate');
    const elTotalDelivered = document.getElementById('metric-total-delivered');
    const elReplyRate = document.getElementById('metric-reply-rate');
    const elRepliesCount = document.getElementById('metric-replies-count');
    const elInterestedCount = document.getElementById('metric-interested-count');

    if (elTotal) elTotal.innerText = m.total_inboxes;
    if (elCap) elCap.innerText = m.total_fleet_daily_capacity;
    if (elHourly) elHourly.innerText = m.total_fleet_hourly_capacity;
    if (elTotalDelivered) elTotalDelivered.innerText = m.total_sent_all_time;
    if (elReplyRate) elReplyRate.innerText = `${m.reply_rate_pct}%`;
    if (elRepliesCount) elRepliesCount.innerText = m.total_replies_count;
    if (elInterestedCount) elInterestedCount.innerText = m.interested_replies_count;

    // Topbar Tickers
    const topbarReplyRate = document.getElementById('topbar-reply-rate');
    const topbarFleetRate = document.getElementById('topbar-fleet-rate');
    if (topbarReplyRate) topbarReplyRate.innerText = `${m.reply_rate_pct}%`;
    if (topbarFleetRate) topbarFleetRate.innerText = `${m.total_fleet_hourly_capacity}/hr`;

    // Sidebar Tickers
    const sbCount = document.getElementById('sidebar-inbox-count');
    const sbCap = document.getElementById('sidebar-fleet-cap');
    const sbRate = document.getElementById('sidebar-fleet-rate');
    const sbReplyCount = document.getElementById('sidebar-reply-count');
    if (sbCount) sbCount.innerText = m.total_inboxes;
    if (sbCap) sbCap.innerText = m.total_fleet_daily_capacity;
    if (sbRate) sbRate.innerText = m.total_fleet_hourly_capacity;
    if (sbReplyCount) sbReplyCount.innerText = m.total_replies_count;

  } catch (e) {
    console.error('Failed to fetch metrics:', e);
  }
}

// ── Inboxes Fleet: Circular Avatars & Limit Adjustments ─────────────────────

async function fetchInboxes() {
  try {
    const res = await fetch('/api/inboxes');
    if (!res.ok) return;
    inboxesCache = await res.json();
    renderInboxList();
  } catch (e) {
    console.error('Failed to fetch inboxes:', e);
  }
}

function getInitials(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (email) {
    const prefix = email.split('@')[0];
    return prefix.substring(0, 2).toUpperCase();
  }
  return 'IB';
}

function renderInboxList() {
  // 1. Sidebar Streamlined Circular Avatar Stack
  const circlesContainer = document.getElementById('sidebar-inbox-circles');
  if (circlesContainer) {
    const circlesHtml = inboxesCache.map(ib => {
      const initials = getInitials(ib.display_name, ib.email);
      const dotColor = ib.is_quarantined ? '#646a78' : '#3b82f6';
      const tooltip = `${ib.display_name || ib.email} (${ib.email}) — ${ib.daily_limit}/day, ${ib.hourly_limit}/hr`;

      return `
        <div onclick="openEditInboxModal(${ib.id})" class="nt-avatar-circle" title="${tooltip}">
          ${initials}
          <span class="nt-avatar-dot" style="background:${dotColor}"></span>
        </div>
      `;
    }).join('');

    const addBtnHtml = `
      <button onclick="openAddInboxModal()" class="w-7 h-7 rounded-full border border-dashed border-white/20 hover:border-white text-[#9da3af] hover:text-white flex items-center justify-center text-xs font-mono transition" title="Add another Gmail inbox">
        +
      </button>
    `;

    circlesContainer.innerHTML = circlesHtml + addBtnHtml;
  }

  // 2. Full Fleet Cards Grid (Step 4 - Fleet Accounts Tab)
  const grid = document.getElementById('inbox-cards-grid');
  if (grid) {
    if (inboxesCache.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full nt-card p-6 text-center space-y-2">
          <h4 class="text-sm font-semibold text-white">No Sender Accounts Connected</h4>
          <p class="text-xs text-[#9da3af]">Add personal Gmail inboxes to scale cold email volume safely.</p>
          <button onclick="openAddInboxModal()" class="nt-btn-primary text-xs py-1.5 px-3.5 mt-1">+ Add Gmail Account</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = inboxesCache.map(ib => {
      const initials = getInitials(ib.display_name, ib.email);
      return `
        <div class="nt-card p-4 space-y-3 nt-card-glow">
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-2.5">
              <div class="w-9 h-9 rounded-full bg-[#1c1e2b] border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white">
                ${initials}
              </div>
              <div>
                <h4 class="text-xs sm:text-sm font-semibold text-white tracking-tight">${ib.display_name || 'Sender Account'}</h4>
                <div class="text-[11px] text-[#9da3af] font-mono">${ib.email}</div>
              </div>
            </div>
            <span class="nt-pill ${ib.is_quarantined ? 'nt-pill-gray' : 'nt-pill-blue'}">
              ${ib.is_quarantined ? 'PAUSED' : 'READY &middot; 587'}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 bg-[#0c0d12] p-2.5 rounded-lg border border-white/[0.04] text-xs">
            <div>
              <div class="text-[10px] text-[#9da3af] uppercase font-semibold">Daily Send Cap</div>
              <div class="text-xs font-bold text-white font-mono">${ib.daily_limit} <span class="text-[10px] text-[#9da3af] font-normal">/day</span></div>
            </div>
            <div>
              <div class="text-[10px] text-[#9da3af] uppercase font-semibold">Hourly Pacing</div>
              <div class="text-xs font-bold text-white font-mono">${ib.hourly_limit} <span class="text-[10px] text-[#9da3af] font-normal">/hr</span></div>
            </div>
            <div>
              <div class="text-[10px] text-[#9da3af] uppercase font-semibold">Typing Delay</div>
              <div class="text-xs font-bold text-[#3b82f6] font-mono">${ib.min_delay_seconds}–${ib.max_delay_seconds}s</div>
            </div>
            <div>
              <div class="text-[10px] text-[#9da3af] uppercase font-semibold">Sent Today</div>
              <div class="text-xs font-bold text-white font-mono">${ib.sent_today_count}</div>
            </div>
          </div>

          <div class="pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2.5">
              <button onclick="testInboxConnection(${ib.id})" class="text-[#3b82f6] hover:underline font-medium text-xs">
                Verify Handshake
              </button>
              <button onclick="openEditInboxModal(${ib.id})" class="text-[#9da3af] hover:text-white text-xs">
                Edit Limits
              </button>
            </div>
            <button onclick="deleteInbox(${ib.id})" class="text-[#9da3af] hover:text-[#f59e0b] text-xs">
              Remove
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

async function testInboxConnection(inboxId) {
  showAppleToast('Verifying Google TLS handshake...');
  try {
    const res = await fetch(`/api/inboxes/${inboxId}/test`, { method: 'POST' });
    const data = await res.json();
    showAppleToast(data.message, !data.is_authenticated);
    await fetchInboxes();
  } catch (e) {
    showAppleToast('Handshake error: ' + e, true);
  }
}

// ── Edit Inbox Limits Modal ───────────────────────────────────────────────

function openEditInboxModal(inboxId) {
  const inbox = inboxesCache.find(i => i.id === inboxId);
  if (!inbox) return;

  document.getElementById('edit-inbox-id').value = inbox.id;
  document.getElementById('modal-edit-email').innerText = inbox.email;
  document.getElementById('edit-inbox-name').value = inbox.display_name || '';
  document.getElementById('edit-inbox-daily').value = inbox.daily_limit || 35;
  document.getElementById('edit-inbox-hourly').value = inbox.hourly_limit || 5;

  const dialog = document.getElementById('modal-edit-inbox');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else if (dialog) {
    dialog.setAttribute('open', '');
  }
}

function closeEditInboxModal() {
  const dialog = document.getElementById('modal-edit-inbox');
  if (dialog && typeof dialog.close === 'function') {
    dialog.close();
  } else if (dialog) {
    dialog.removeAttribute('open');
  }
}

async function submitEditInbox() {
  const id = document.getElementById('edit-inbox-id').value;
  const name = document.getElementById('edit-inbox-name').value.trim();
  const daily = parseInt(document.getElementById('edit-inbox-daily').value) || 35;
  const hourly = parseInt(document.getElementById('edit-inbox-hourly').value) || 5;

  try {
    const res = await fetch(`/api/inboxes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name,
        daily_limit: daily,
        hourly_limit: hourly,
      }),
    });

    if (res.ok) {
      closeEditInboxModal();
      showAppleToast(`Inbox limits updated: ${daily}/day · ${hourly}/hr`);
      await fetchInboxes();
      await fetchMetrics();
    }
  } catch (e) {
    showAppleToast('Failed to update limits: ' + e, true);
  }
}

// ── Add Inbox Dialog ──────────────────────────────────────────────────────

function openAddInboxModal() {
  const dialog = document.getElementById('modal-inbox');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else if (dialog) {
    dialog.setAttribute('open', '');
  }
}

function closeAddInboxModal() {
  const dialog = document.getElementById('modal-inbox');
  if (dialog && typeof dialog.close === 'function') {
    dialog.close();
  } else if (dialog) {
    dialog.removeAttribute('open');
  }
}

function initDialogPolyfill() {
  ['modal-inbox', 'modal-edit-inbox', 'modal-simulate-reply'].forEach(id => {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e, dlg) => {
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, dialog); });
      dialog.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e, dialog)) dialog.close(); });
    }
  });
}

async function submitNewInbox() {
  const email = document.getElementById('modal-email').value.trim();
  const name = document.getElementById('modal-name').value.trim();
  const password = document.getElementById('modal-password').value.trim();
  const daily = parseInt(document.getElementById('modal-daily').value) || 35;
  const hourly = parseInt(document.getElementById('modal-hourly').value) || 5;

  if (!email) {
    showAppleToast('Please enter a valid Gmail address', true);
    return;
  }

  try {
    const res = await fetch('/api/inboxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        display_name: name,
        app_password: password || null,
        daily_limit: daily,
        hourly_limit: hourly,
      }),
    });
    if (res.ok) {
      closeAddInboxModal();
      showAppleToast(`Inbox ${email} added to fleet rotation!`);
      await fetchInboxes();
      await fetchMetrics();
    }
  } catch (e) {
    showAppleToast('Failed to connect inbox: ' + e, true);
  }
}

async function deleteInbox(id) {
  if (!confirm('Remove this inbox from rotation?')) return;
  try {
    await fetch(`/api/inboxes/${id}`, { method: 'DELETE' });
    showAppleToast('Inbox removed from fleet');
    await fetchInboxes();
    await fetchMetrics();
  } catch (e) {
    showAppleToast('Error deleting inbox: ' + e, true);
  }
}

// ── Companies & Leads Clustering ──────────────────────────────────────────

async function fetchCompaniesAndLeads() {
  try {
    const [cRes, lRes] = await Promise.all([
      fetch('/api/companies'),
      fetch('/api/leads'),
    ]);
    if (!cRes.ok || !lRes.ok) return;
    companiesCache = await cRes.json();
    leadsCache = await lRes.json();

    renderCommandCenterDirectory();
    renderCompanyClusterView();
    renderStudioLeadList();
    populateFollowUpSelect();
  } catch (e) {
    console.error('Failed to fetch leads:', e);
  }
}

function filterCompaniesAndLeads(query) {
  leadFilterQuery = (query || '').toLowerCase().trim();
  renderCommandCenterDirectory();
  renderCompanyClusterView();
}

function getStatusPill(status) {
  switch (status) {
    case 'replied':
    case 'interested':
      return `<span class="nt-pill nt-pill-amber">${status.toUpperCase()}</span>`;
    case 'approved':
    case 'scheduled':
    case 'sent':
      return `<span class="nt-pill nt-pill-blue">${status.toUpperCase()}</span>`;
    case 'drafted':
    case 'researched':
      return `<span class="nt-pill nt-pill-white">${status.toUpperCase()}</span>`;
    default:
      return `<span class="nt-pill nt-pill-gray">${status.toUpperCase()}</span>`;
  }
}

// ── 1-PAGE COMMAND CENTER WORKSTATION (High Information Density) ───────────

function renderCommandCenterDirectory() {
  const container = document.getElementById('command-lead-list');
  const countBadge = document.getElementById('command-lead-count');
  const sidebarCountBadge = document.getElementById('sidebar-lead-count');

  const filtered = leadsCache.filter(l => {
    if (!leadFilterQuery) return true;
    return l.full_name.toLowerCase().includes(leadFilterQuery) ||
           l.email.toLowerCase().includes(leadFilterQuery) ||
           l.role_title.toLowerCase().includes(leadFilterQuery) ||
           (l.company?.name || '').toLowerCase().includes(leadFilterQuery);
  });

  if (countBadge) countBadge.innerText = filtered.length;
  if (sidebarCountBadge) sidebarCountBadge.innerText = filtered.length;

  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-[#9da3af] text-xs">
        ${leadFilterQuery ? 'No DTC prospects match "' + leadFilterQuery + '"' : 'No DTC brands imported. Click "Demo DTC Data" above.'}
      </div>
    `;
    return;
  }

  if (!selectedLeadId && filtered.length > 0) {
    selectedLeadId = filtered[0].id;
  }

  container.innerHTML = filtered.map(l => {
    const isSelected = selectedLeadId === l.id;
    const isFounder = (l.seniority_rank === 1 || (l.role_title || '').toLowerCase().includes('founder') || (l.role_title || '').toLowerCase().includes('ceo'));

    return `
      <div onclick="selectLead(${l.id})" class="p-3 rounded-xl border transition cursor-pointer ${isSelected ? 'border-l-4 border-l-[#3b82f6] bg-[#1a1c29] border-white/20 shadow-md' : 'bg-[#12131b] border-white/[0.05] hover:border-white/[0.12]'}">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center space-x-2 truncate">
            <span class="w-2 h-2 rounded-full ${isSelected ? 'bg-[#3b82f6]' : 'bg-white/20'}"></span>
            <h4 class="text-xs sm:text-sm font-semibold text-white truncate">${l.full_name}</h4>
            ${isFounder ? '<span class="nt-pill nt-pill-amber text-[9px]"><i class="fa-solid fa-crown mr-1 text-[8px]"></i>FOUNDER</span>' : ''}
          </div>
          ${getStatusPill(l.status)}
        </div>
        <div class="text-[11px] text-[#9da3af] flex items-center justify-between mt-1">
          <span class="truncate">${l.role_title} @ <strong class="text-white">${l.company?.name || 'Brand'}</strong></span>
          <span class="text-[10px] text-[#9da3af] font-mono">${l.company?.domain || ''}</span>
        </div>
      </div>
    `;
  }).join('');

  renderCommandCenterStudio();
}

function selectLead(leadId) {
  selectedLeadId = leadId;
  renderCommandCenterDirectory();
  renderStudioLeadList();
  renderStudioDetail();
}

function renderCommandCenterStudio() {
  const panel = document.getElementById('command-studio-panel');
  if (!panel) return;

  const lead = leadsCache.find(l => l.id === selectedLeadId);
  if (!lead) {
    panel.innerHTML = `
      <div class="text-center py-24 text-[#9da3af] text-xs">
        Select a prospect from the left directory to inspect intelligence and edit ad copy.
      </div>
    `;
    return;
  }

  const dossier = lead.research_dossier || {};
  const recent = dossier.recent_achievement || {};
  const reddit = dossier.reddit_insights || {};
  const draft = lead.draft;
  const bodyText = draft?.body || '';
  const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  const isFounder = (lead.seniority_rank === 1 || (lead.role_title || '').toLowerCase().includes('founder'));

  panel.innerHTML = `
    <div class="space-y-3.5">
      <!-- Header Bar with Clear Lead Title & Discrete Secondary Actions -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-white/[0.08] gap-2">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-base font-bold text-white tracking-tight">${lead.full_name}</h3>
            ${isFounder ? '<span class="nt-pill nt-pill-amber text-[9.5px]"><i class="fa-solid fa-crown mr-1"></i>FOUNDER / CEO</span>' : ''}
            <span class="nt-pill nt-pill-gray text-[9.5px]">${(lead.role_category || 'GROWTH').toUpperCase()}</span>
            ${getStatusPill(lead.status)}
          </div>
          <div class="text-xs text-[#9da3af] mt-0.5">
            ${lead.role_title} at <strong class="text-white">${lead.company?.name || 'Brand'}</strong> &middot; <span class="font-mono text-[#cbd5e1]">${lead.email}</span>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button onclick="reResearchLead(${lead.id})" class="nt-btn-secondary text-xs py-1 px-2.5">
            <i class="fa-solid fa-rotate mr-1 text-[10px]" aria-hidden="true"></i> Re-Research
          </button>
          <button onclick="reDraftLead(${lead.id})" class="nt-btn-secondary text-xs py-1 px-2.5">
            <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#3b82f6] text-[10px]" aria-hidden="true"></i> Redraft
          </button>
        </div>
      </div>

      <!-- High-Contrast Key Intelligence Callouts (Crisp White Surfaces) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        <!-- Milestone < 30 days -->
        <div class="nt-white-intel-card space-y-1">
          <div class="flex items-center justify-between">
            <span class="nt-pill nt-pill-amber text-[9.5px] font-bold">🏆 Milestone &lt; 30d</span>
            <span class="text-[10px] text-[#64748b]">Verified Recency</span>
          </div>
          <p class="text-xs font-semibold text-[#0f172a] leading-relaxed">
            ${recent.summary || 'Recent product collection launch and expanding DTC audience.'}
          </p>
          ${recent.congrats_hook ? `
            <div class="text-[11px] text-[#475569] italic pt-0.5 border-t border-slate-100">
              Hook: "${recent.congrats_hook}"
            </div>
          ` : ''}
        </div>

        <!-- Ad Creative Angle & Fatigue Gap -->
        <div class="nt-white-intel-card space-y-1">
          <div class="flex items-center justify-between">
            <span class="nt-pill nt-pill-blue text-[9.5px] font-bold">🎯 Ad Creative Angle</span>
            <span class="text-[10px] text-[#2563eb] font-medium font-mono">Showcase Ready</span>
          </div>
          <p class="text-xs font-semibold text-[#0f172a] leading-relaxed">
            ${reddit.pain_point || 'Creative fatigue on Meta/TikTok ads; need continuous fresh vertical UGC hooks & AI video tests.'}
          </p>
          <div class="text-[11px] text-[#2563eb] font-mono pt-0.5 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[#64748b]">Showcase Asset:</span>
            <a href="${DTC_SHOWCASE_URL}" target="_blank" class="text-[#2563eb] hover:underline font-bold">${DTC_SHOWCASE_URL}</a>
          </div>
        </div>
      </div>

      <!-- Cold Email Draft Sheet (Crisp White Paper Surface - High Contrast) -->
      <div class="nt-paper-sheet space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
          <div class="flex items-center space-x-2 text-[#475569]">
            <span class="font-bold text-[#0f172a]">To:</span>
            <span class="bg-slate-100 text-[#0f172a] px-2 py-0.5 rounded font-medium">${lead.full_name} &lt;${lead.email}&gt;</span>
          </div>
          <div class="text-[11px] text-[#64748b] hidden sm:block">
            Sender: <span class="font-semibold text-[#0f172a]">Alex Rivera</span> (DTC Creative Lab)
          </div>
        </div>

        <!-- Subject Line -->
        <div>
          <label for="command-draft-subject" class="block text-xs font-bold text-[#0f172a] mb-1">Subject</label>
          <input type="text" id="command-draft-subject" class="nt-white-input w-full" value="${draft?.subject || 'ad creative test for ' + (lead.company?.name || '').toLowerCase()}">
        </div>

        <!-- Email Body Textarea -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="command-draft-body" class="block text-xs font-bold text-[#0f172a]">Email Body (Under 100 Words)</label>
            <span id="command-draft-wordcount" class="text-xs text-[#64748b] font-mono">${wordCount} words (Target: &lt; 100)</span>
          </div>
          <textarea id="command-draft-body" rows="7" oninput="updateCommandWordCount(this.value)" class="nt-white-textarea w-full">${draft?.body || 'Generating DTC ad pitch...'}</textarea>
        </div>

        <!-- Footer Bar with High-Importance Primary Action -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-slate-200 gap-2">
          <div class="text-xs text-[#64748b] flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full ${draft?.is_approved ? 'bg-[#3b82f6]' : 'bg-[#f59e0b]'}"></span>
            <span class="font-medium text-[#334155]">${draft?.is_approved ? 'Status: Approved & Scheduled' : 'Status: Draft Ready for Approval'}</span>
          </div>

          <!-- Prominent Primary Action Button -->
          <button onclick="saveAndApproveCommandDraft(${lead.id})" class="nt-btn-paper-action text-xs sm:text-sm py-2 px-5">
            <i class="fa-solid fa-check mr-1.5 text-blue-400"></i> Save & Approve Draft
          </button>
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateCommandWordCount(text) {
  const countEl = document.getElementById('command-draft-wordcount');
  if (!countEl) return;
  const count = text.trim() ? text.trim().split(/\s+/).length : 0;
  countEl.innerText = `${count} words (Target: < 100)`;
  countEl.className = count > 105 ? 'text-xs text-[#f59e0b] font-mono font-bold' : 'text-xs text-[#9da3af] font-mono';
}

async function saveAndApproveCommandDraft(leadId) {
  const subjectEl = document.getElementById('command-draft-subject');
  const bodyEl = document.getElementById('command-draft-body');
  if (!subjectEl || !bodyEl) return;

  try {
    const res = await fetch(`/api/leads/${leadId}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subjectEl.value, body: bodyEl.value, is_approved: true }),
    });
    if (res.ok) {
      showAppleToast('Draft approved & queued for dispatch!');
      await fetchCompaniesAndLeads();
      await fetchQueue();
    }
  } catch (e) {
    showAppleToast('Failed to save draft: ' + e, true);
  }
}

// ── Tab 2: Clustered DTC Brands Table ─────────────────────────────────────

function renderCompanyClusterView() {
  const container = document.getElementById('company-lead-container');
  if (!container) return;

  if (companiesCache.length === 0) {
    container.innerHTML = `
      <div class="nt-card p-6 text-center space-y-2">
        <h3 class="text-sm font-semibold text-white">No DTC Brands Imported</h3>
        <p class="text-xs text-[#9da3af]">Import a CSV or click "Demo DTC Data" to populate clustered prospects.</p>
        <button onclick="loadSampleDtcData()" class="nt-btn-primary text-xs py-1.5 px-3.5 mt-1">Load Demo DTC Data</button>
      </div>
    `;
    return;
  }

  const filtered = companiesCache.filter(comp => {
    if (!leadFilterQuery) return true;
    const matchCompany = comp.name.toLowerCase().includes(leadFilterQuery) || comp.domain.toLowerCase().includes(leadFilterQuery);
    const compLeads = leadsCache.filter(l => l.company_id === comp.id);
    const matchLead = compLeads.some(l => 
      l.full_name.toLowerCase().includes(leadFilterQuery) ||
      l.email.toLowerCase().includes(leadFilterQuery) ||
      l.role_title.toLowerCase().includes(leadFilterQuery)
    );
    return matchCompany || matchLead;
  });

  container.innerHTML = filtered.map(comp => {
    const compLeads = leadsCache.filter(l => l.company_id === comp.id);
    const hasMilestone = comp.has_recent_milestone;

    return `
      <article class="nt-card overflow-hidden">
        <div class="p-3.5 border-b border-white/[0.05] bg-[#12131b] flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-sm font-semibold text-white tracking-tight">${comp.name}</h3>
              <a href="${comp.website || '#'}" target="_blank" class="text-xs text-[#3b82f6] hover:underline font-mono">${comp.domain}</a>
              <span class="nt-pill nt-pill-gray text-[9.5px]">${compLeads.length} contacts</span>
            </div>
            <div class="text-xs text-[#9da3af] mt-0.5 flex items-center space-x-2">
              <span>Location: ${comp.location || 'Global'}</span> &middot; 
              <span class="text-white flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-[#3b82f6] mr-1"></span> 24h Brand Stagger Active</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            ${hasMilestone ? `
              <span class="nt-pill nt-pill-amber">
                <i class="fa-solid fa-trophy mr-1 text-[8.5px]" aria-hidden="true"></i> Win &lt;30d
              </span>
            ` : ''}
            <span class="nt-pill nt-pill-gray">
              <i class="fa-solid fa-video mr-1 text-[8.5px] text-[#3b82f6]"></i> AI Video Showcase Ready
            </span>
          </div>
        </div>

        <div class="overflow-x-auto no-scrollbar">
          <table class="w-full text-left text-xs min-w-[500px]">
            <thead class="bg-[#0d0e14] text-[#9da3af] font-mono uppercase tracking-wider text-[9px] border-b border-white/[0.04]">
              <tr>
                <th class="py-2.5 px-3.5">CONTACT</th>
                <th class="py-2.5 px-3.5">ROLE / TITLE</th>
                <th class="py-2.5 px-3.5">CATEGORY</th>
                <th class="py-2.5 px-3.5">STATUS</th>
                <th class="py-2.5 px-3.5 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.04] text-[#f4f4f6]">
              ${compLeads.map(lead => {
                const isFounder = (lead.seniority_rank === 1 || (lead.role_title || '').toLowerCase().includes('founder') || (lead.role_title || '').toLowerCase().includes('ceo'));
                return `
                  <tr class="hover:bg-white/[0.02] transition">
                    <td class="py-2.5 px-3.5">
                      <div class="font-medium text-white text-xs flex items-center space-x-1.5">
                        <span>${lead.full_name}</span>
                        ${isFounder ? '<span class="nt-pill nt-pill-amber text-[8.5px]"><i class="fa-solid fa-crown mr-0.5"></i>FOUNDER</span>' : ''}
                      </div>
                      <div class="text-[11px] text-[#9da3af] font-mono">${lead.email}</div>
                    </td>
                    <td class="py-2.5 px-3.5 text-xs text-[#9da3af]">${lead.role_title}</td>
                    <td class="py-2.5 px-3.5">
                      <span class="nt-pill nt-pill-gray text-[9.5px] font-mono">${lead.role_category.toUpperCase()}</span>
                    </td>
                    <td class="py-2.5 px-3.5">
                      ${getStatusPill(lead.status)}
                    </td>
                    <td class="py-2.5 px-3.5 text-right">
                      <button onclick="inspectLeadInStudio(${lead.id})" class="nt-btn-secondary text-[11px] py-1 px-2.5">
                        Review &rarr;
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }).join('');
}

// ── Tab 3: Dedicated Ad Creative Studio ────────────────────────────────────

function filterStudioLeads(query) {
  studioFilterQuery = (query || '').toLowerCase().trim();
  renderStudioLeadList();
}

function renderStudioLeadList() {
  const container = document.getElementById('studio-lead-list');
  const countBadge = document.getElementById('studio-lead-count');
  if (!container) return;

  const filtered = leadsCache.filter(l => {
    if (!studioFilterQuery) return true;
    return l.full_name.toLowerCase().includes(studioFilterQuery) ||
           l.email.toLowerCase().includes(studioFilterQuery) ||
           l.role_title.toLowerCase().includes(studioFilterQuery) ||
           (l.company?.name || '').toLowerCase().includes(studioFilterQuery);
  });

  if (countBadge) countBadge.innerText = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-[#9da3af] text-xs">No prospects</div>';
    return;
  }

  container.innerHTML = filtered.map(lead => {
    const isFounder = (lead.seniority_rank === 1 || (lead.role_title || '').toLowerCase().includes('founder'));
    return `
      <div onclick="selectStudioLead(${lead.id})" class="p-2.5 rounded-xl border transition cursor-pointer ${selectedLeadId === lead.id ? 'bg-[#181a26] border-white/30' : 'bg-[#12131b] border-white/[0.04] hover:border-white/[0.08]'}">
        <div class="flex items-center justify-between mb-0.5">
          <div class="flex items-center space-x-1.5 truncate max-w-[150px]">
            <h4 class="text-xs font-semibold text-white truncate">${lead.full_name}</h4>
            ${isFounder ? '<span class="text-[9px] text-[#f59e0b]"><i class="fa-solid fa-crown"></i></span>' : ''}
          </div>
          ${getStatusPill(lead.status)}
        </div>
        <div class="text-[11px] text-[#9da3af] truncate">${lead.role_title} @ ${lead.company?.name || 'Brand'}</div>
      </div>
    `;
  }).join('');
}

function inspectLeadInStudio(leadId) {
  switchTab('studio');
  selectStudioLead(leadId);
}

function selectStudioLead(leadId) {
  selectedLeadId = leadId;
  renderStudioLeadList();
  renderStudioDetail();
}

function renderStudioDetail() {
  const panel = document.getElementById('studio-col-detail');
  if (!panel) return;

  const lead = leadsCache.find(l => l.id === selectedLeadId);
  if (!lead) {
    panel.innerHTML = '<div class="text-center py-20 text-[#9da3af] text-xs">Select a prospect from the list.</div>';
    return;
  }

  const dossier = lead.research_dossier || {};
  const recent = dossier.recent_achievement || {};
  const reddit = dossier.reddit_insights || {};
  const draft = lead.draft;
  const bodyText = draft?.body || '';
  const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  const isFounder = (lead.seniority_rank === 1 || (lead.role_title || '').toLowerCase().includes('founder') || (lead.role_title || '').toLowerCase().includes('ceo'));

  panel.innerHTML = `
    <div class="space-y-3.5">
      <!-- Header Bar with Clear Lead Title & Discrete Secondary Actions -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-white/[0.08] gap-2">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-base font-bold text-white tracking-tight">${lead.full_name}</h3>
            ${isFounder ? '<span class="nt-pill nt-pill-amber text-[9.5px]"><i class="fa-solid fa-crown mr-1"></i>FOUNDER / CEO</span>' : ''}
            <span class="nt-pill nt-pill-gray text-[9.5px]">${(lead.role_category || 'GROWTH').toUpperCase()}</span>
            ${getStatusPill(lead.status)}
          </div>
          <div class="text-xs text-[#9da3af] mt-0.5">
            ${lead.role_title} at <strong class="text-white">${lead.company?.name || 'Brand'}</strong> &middot; <span class="font-mono text-[#cbd5e1]">${lead.email}</span>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button onclick="reResearchLead(${lead.id})" class="nt-btn-secondary text-xs py-1 px-2.5 text-[#9da3af] hover:text-white" title="Run background brand research">
            <i class="fa-solid fa-rotate mr-1 text-[10px]" aria-hidden="true"></i> Re-Research
          </button>
          <button onclick="reDraftLead(${lead.id})" class="nt-btn-secondary text-xs py-1 px-2.5 text-[#9da3af] hover:text-[#3b82f6]" title="Regenerate DTC pitch">
            <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#3b82f6] text-[10px]" aria-hidden="true"></i> Redraft
          </button>
        </div>
      </div>

      <!-- High-Contrast Key Intelligence Callouts (Crisp White Surfaces) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        <!-- Milestone < 30 days -->
        <div class="nt-white-intel-card space-y-1">
          <div class="flex items-center justify-between">
            <span class="nt-pill nt-pill-amber text-[9.5px] font-bold">🏆 Milestone &lt; 30d</span>
            <span class="text-[10px] text-[#64748b]">Verified Recency</span>
          </div>
          <p class="text-xs font-semibold text-[#0f172a] leading-relaxed">
            ${recent.summary || 'Recent product collection launch and expanding DTC audience.'}
          </p>
          ${recent.congrats_hook ? `
            <div class="text-[11px] text-[#475569] italic pt-0.5 border-t border-slate-100">
              Hook: "${recent.congrats_hook}"
            </div>
          ` : ''}
        </div>

        <!-- Ad Creative Angle & Fatigue Gap -->
        <div class="nt-white-intel-card space-y-1">
          <div class="flex items-center justify-between">
            <span class="nt-pill nt-pill-blue text-[9.5px] font-bold">🎯 Ad Creative Angle</span>
            <span class="text-[10px] text-[#2563eb] font-medium font-mono">Showcase Ready</span>
          </div>
          <p class="text-xs font-semibold text-[#0f172a] leading-relaxed">
            ${reddit.pain_point || 'High creative fatigue on Meta/TikTok paid channels; need 3–5 fresh hooks/week.'}
          </p>
          <div class="text-[11px] text-[#0f172a] font-mono pt-0.5 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[#64748b]">Showcase Asset:</span>
            <a href="${DTC_SHOWCASE_URL}" target="_blank" class="text-[#2563eb] hover:underline font-bold">${DTC_SHOWCASE_URL}</a>
          </div>
        </div>
      </div>

      <!-- Authentic White Email Sheet (High Contrast, Senior UX) -->
      <div class="nt-paper-sheet space-y-3">
        <!-- Email Metadata Header Strip -->
        <div class="pb-2.5 border-b border-[#e2e8f0] space-y-2">
          <div class="flex items-center justify-between text-xs text-[#64748b]">
            <div class="flex items-center space-x-1.5">
              <span class="font-semibold text-[#0f172a]">DTC PITCH DRAFT</span>
              <span>&middot;</span>
              <span class="font-mono text-[11px]">Ready for Approval</span>
            </div>
            <div id="draft-word-count" class="font-mono text-[11px] ${wordCount > 105 ? 'text-amber-600 font-bold' : 'text-[#64748b]'}">
              ${wordCount} words (Target &lt; 100)
            </div>
          </div>

          <div>
            <label for="draft-subject" class="block text-[11px] font-bold uppercase tracking-wide text-[#475569] mb-1">Subject</label>
            <input type="text" id="draft-subject" class="nt-white-input w-full font-sans text-xs" value="${draft?.subject || 'ad creative for ' + (lead.company?.name || '').toLowerCase()}">
          </div>
        </div>

        <!-- Email Body on Crisp White Canvas -->
        <div>
          <label for="draft-body" class="block text-[11px] font-bold uppercase tracking-wide text-[#475569] mb-1">Email Body</label>
          <textarea id="draft-body" rows="7" oninput="updateWordCount(this.value)" class="nt-white-textarea w-full text-xs font-sans" placeholder="Generating tailored DTC ad creative pitch...">${draft?.body || ''}</textarea>
        </div>

        <!-- Primary Action Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-[#e2e8f0] gap-2">
          <div class="flex items-center space-x-2 text-xs">
            <span class="w-2 h-2 rounded-full ${draft?.is_approved ? 'bg-[#3b82f6]' : 'bg-[#f59e0b]'}"></span>
            <span class="font-medium text-[#475569]">${draft?.is_approved ? 'Draft Status: Approved' : 'Draft Status: Awaiting Approval'}</span>
          </div>

          <div class="flex items-center space-x-2">
            <button onclick="saveAndApproveDraft(${lead.id})" class="nt-btn-paper-action w-full sm:w-auto">
              <i class="fa-solid fa-check mr-1.5 text-blue-400" aria-hidden="true"></i>
              <span>Save & Approve Draft</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateWordCount(text) {
  const countEl = document.getElementById('draft-word-count');
  if (!countEl) return;
  const count = text.trim() ? text.trim().split(/\s+/).length : 0;
  countEl.innerText = `${count} words (Target: < 100)`;
  countEl.className = count > 105 ? 'text-xs text-[#f59e0b] font-mono font-bold' : 'text-xs text-[#9da3af] font-mono';
}

async function saveAndApproveDraft(leadId) {
  const subjectEl = document.getElementById('draft-subject');
  const bodyEl = document.getElementById('draft-body');
  if (!subjectEl || !bodyEl) return;

  try {
    const res = await fetch(`/api/leads/${leadId}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subjectEl.value, body: bodyEl.value, is_approved: true }),
    });
    if (res.ok) {
      showAppleToast('Draft approved and queued!');
      await fetchCompaniesAndLeads();
      await fetchQueue();
    }
  } catch (e) {
    showAppleToast('Failed to save draft: ' + e, true);
  }
}

async function reResearchLead(leadId) {
  showAppleToast('Running live brand & Reddit research...');
  try {
    const res = await fetch(`/api/leads/${leadId}/research`, { method: 'POST' });
    if (res.ok) {
      showAppleToast('Research refreshed!');
      await fetchCompaniesAndLeads();
    }
  } catch (e) {
    showAppleToast('Research failed: ' + e, true);
  }
}

async function reDraftLead(leadId) {
  showAppleToast('Regenerating DTC ad pitch...');
  try {
    const res = await fetch(`/api/leads/${leadId}/draft`, { method: 'POST' });
    if (res.ok) {
      showAppleToast('Draft regenerated!');
      await fetchCompaniesAndLeads();
    }
  } catch (e) {
    showAppleToast('Draft error: ' + e, true);
  }
}

async function triggerAllResearch() {
  showAppleToast('Researching all leads in background...');
  try {
    const res = await fetch('/api/pipeline/run-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: currentCampaignId,
        auto_approve: false,
        schedule_immediately: false,
      }),
    });
    const d = await res.json();
    showAppleToast(`Researched ${d.researched_count} leads successfully!`);
    await fetchCompaniesAndLeads();
  } catch (e) {
    showAppleToast(e, true);
  }
}

async function triggerAllDrafts() {
  showAppleToast('Drafting DTC ad emails for all leads...');
  try {
    const res = await fetch('/api/pipeline/run-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: currentCampaignId,
        auto_approve: false,
        schedule_immediately: false,
      }),
    });
    const d = await res.json();
    showAppleToast(`Drafted ${d.drafted_count} personalized emails!`);
    await fetchCompaniesAndLeads();
  } catch (e) {
    showAppleToast(e, true);
  }
}

async function approveAllDrafts() {
  if (!confirm('Approve all drafted emails across all DTC brands?')) return;
  try {
    for (const lead of leadsCache) {
      if (lead.draft) {
        await fetch(`/api/leads/${lead.id}/draft`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: lead.draft.subject,
            body: lead.draft.body,
            is_approved: true,
          }),
        });
      }
    }
    showAppleToast('All emails approved! Scheduling dispatch slots...');
    await runSchedulingOnly();
    await refreshAll();
  } catch (e) {
    showAppleToast('Error approving drafts: ' + e, true);
  }
}

// ── Autonomous Pipeline Execution ─────────────────────────────────────────

async function runAutonomousPipeline() {
  const topbarBtn = document.getElementById('topbar-btn-run');
  if (topbarBtn) {
    topbarBtn.disabled = true;
    topbarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Running...';
  }

  try {
    if (leadsCache.length === 0) {
      await loadSampleDtcData();
    }

    const res = await fetch('/api/pipeline/run-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: currentCampaignId,
        auto_approve: true,
        schedule_immediately: true,
      }),
    });

    const data = await res.json();
    showAppleToast(`Pipeline Complete: ${data.drafted_count} drafted · ${data.scheduled_count} scheduled!`);
    await refreshAll();
    switchTab('queue');
  } catch (e) {
    showAppleToast('Pipeline error: ' + e, true);
  } finally {
    if (topbarBtn) {
      topbarBtn.disabled = false;
      topbarBtn.innerHTML = '<i class="fa-solid fa-play mr-1.5 text-[9px]"></i> Run Pipeline';
    }
  }
}

async function runSchedulingOnly() {
  await fetch('/api/pipeline/run-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: currentCampaignId,
      auto_approve: true,
      schedule_immediately: true,
    }),
  });
}

// ── Queue Management (Compact & Smaller Schedule Badges) ───────────────────

async function fetchQueue() {
  try {
    const res = await fetch('/api/queue');
    if (!res.ok) return;
    queueCache = await res.json();
    renderQueueTable(queueCache);
    renderMiniQueue(queueCache);

    const sbQueue = document.getElementById('sidebar-queue-count');
    if (sbQueue) sbQueue.innerText = queueCache.length;
  } catch (e) {
    console.error('Failed to fetch queue:', e);
  }
}

function renderMiniQueue(slots) {
  const container = document.getElementById('command-queue-mini');
  if (!container) return;

  if (slots.length === 0) {
    container.innerHTML = '<div class="text-xs text-[#9da3af] py-2">No active slots scheduled.</div>';
    return;
  }

  container.innerHTML = slots.slice(0, 4).map(s => {
    const timeFormatted = new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="flex items-center justify-between p-2 rounded-lg bg-[#0e0f14] border border-white/[0.04] text-xs">
        <div class="flex items-center space-x-2 truncate">
          <span class="text-[#3b82f6] font-mono text-[10px] bg-[#3b82f6]/10 px-1.5 py-0.5 rounded">${timeFormatted}</span>
          <span class="text-white font-medium truncate">${s.lead_name || 'Prospect'}</span>
          <span class="text-[#9da3af] text-[10.5px]">(${s.company_domain || 'Brand'})</span>
        </div>
        <div class="flex items-center space-x-1.5 shrink-0">
          <span class="text-[10px] text-[#9da3af] font-mono">+${s.jitter_seconds}s</span>
          ${getStatusPill(s.status)}
        </div>
      </div>
    `;
  }).join('');
}

function renderQueueTable(slots) {
  const tbody = document.getElementById('queue-table-body');
  if (!tbody) return;

  if (slots.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-[#9da3af] text-xs">No slots scheduled. Approve drafts to populate dispatch queue.</td></tr>';
    return;
  }

  tbody.innerHTML = slots.map(s => {
    const dateObj = new Date(s.scheduled_at);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="py-2.5 px-3.5">
          <span class="text-[#3b82f6] font-mono text-[10.5px] bg-[#3b82f6]/10 px-2 py-0.5 rounded-full">
            ${dateFormatted}, ${timeFormatted}
          </span>
        </td>
        <td class="py-2.5 px-3.5">
          <div class="font-medium text-white">${s.lead_name || 'Prospect'}</div>
          <div class="text-[10px] text-[#9da3af] font-mono">${s.lead_email}</div>
        </td>
        <td class="py-2.5 px-3.5 text-white text-xs font-medium">
          ${s.company_domain || 'DTC Brand'}
        </td>
        <td class="py-2.5 px-3.5 text-[#9da3af] font-mono text-[10.5px]">
          ${s.inbox_email || 'Rotation Pool'}
        </td>
        <td class="py-2.5 px-3.5 text-[#9da3af] font-mono text-[10.5px]">
          +${s.jitter_seconds || 120}s jitter
        </td>
        <td class="py-2.5 px-3.5 text-right">
          ${getStatusPill(s.status)}
        </td>
      </tr>
    `;
  }).join('');
}

// ── Replies & Follow-Ups Engine ───────────────────────────────────────────

async function fetchReplies() {
  try {
    const res = await fetch('/api/replies');
    if (!res.ok) return;
    repliesCache = await res.json();
    renderRepliesView();
    renderMiniReplies(repliesCache);

    const countEl = document.getElementById('command-replies-count');
    const sbReply = document.getElementById('sidebar-reply-count');
    if (countEl) countEl.innerText = repliesCache.length;
    if (sbReply) sbReply.innerText = repliesCache.length;
  } catch (e) {
    console.error('Failed to fetch replies:', e);
  }
}

function renderMiniReplies(replies) {
  const container = document.getElementById('command-replies-mini');
  if (!container) return;

  if (replies.length === 0) {
    container.innerHTML = '<div class="text-xs text-[#9da3af] py-2">No incoming replies yet. Click "Simulate Reply".</div>';
    return;
  }

  container.innerHTML = replies.slice(0, 3).map(r => {
    return `
      <div onclick="switchTab('replies')" class="p-2.5 rounded-xl bg-white border border-[#e2e8f0] shadow-sm text-xs hover:border-[#3b82f6] cursor-pointer transition space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-1.5 truncate">
            <span class="w-2 h-2 rounded-full bg-[#3b82f6]"></span>
            <span class="text-[#0f172a] font-bold truncate">${r.lead_name || r.sender_email}</span>
            <span class="text-[11px] text-[#64748b]">(${r.company_name})</span>
          </div>
          <span class="nt-pill ${r.intent === 'interested' ? 'nt-pill-amber' : 'nt-pill-gray'} text-[8.5px]">${r.intent.toUpperCase()}</span>
        </div>
        <p class="text-[11.5px] text-[#334155] truncate italic">"${r.body}"</p>
      </div>
    `;
  }).join('');
}

function renderRepliesView() {
  const container = document.getElementById('replies-cards-container');
  const countEl = document.getElementById('replies-list-count');
  if (!container) return;

  if (countEl) countEl.innerText = repliesCache.length;

  if (repliesCache.length === 0) {
    container.innerHTML = `
      <div class="nt-card p-6 text-center space-y-2">
        <h4 class="text-sm font-semibold text-white">No Replies Logged Yet</h4>
        <p class="text-xs text-[#9da3af]">Click "Simulate Reply" above to test the AI response workflow.</p>
        <button onclick="openSimulateReplyModal()" class="nt-btn-primary text-xs py-1.5 px-3.5 mt-1">
          + Simulate Prospect Reply
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = repliesCache.map(r => {
    const dateFormatted = new Date(r.received_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const isInterested = r.intent === 'interested';

    return `
      <article class="nt-card p-4 space-y-3 transition border ${r.is_replied_to ? 'border-white/[0.05]' : 'border-[#3b82f6]/40 bg-[#12141e]'}">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <h4 class="text-xs sm:text-sm font-bold text-white tracking-tight">${r.lead_name || r.sender_email}</h4>
              <span class="nt-pill ${isInterested ? 'nt-pill-amber' : 'nt-pill-gray'} font-mono text-[9px]">
                ${r.intent.toUpperCase()}
              </span>
              ${r.is_replied_to ? '<span class="nt-pill nt-pill-gray text-[9px]">REPLIED</span>' : '<span class="nt-pill nt-pill-blue text-[9px]">NEEDS RESPONSE</span>'}
            </div>
            <div class="text-xs text-[#9da3af] mt-0.5">
              ${r.role_title || 'Lead'} at <strong class="text-white">${r.company_name || 'Brand'}</strong> &middot; <span class="font-mono text-[#cbd5e1]">${r.sender_email}</span>
            </div>
          </div>
          <span class="text-[10px] text-[#9da3af] font-mono">${dateFormatted}</span>
        </div>

        <!-- High-Contrast Crisp White Prospect Message Card (No Black-on-Black) -->
        <div class="nt-prospect-msg-box">
          <div class="text-[10px] text-[#2563eb] font-bold uppercase tracking-wider mb-1 flex items-center">
            <i class="fa-solid fa-inbox mr-1.5 text-[9px]"></i> Prospect Message:
          </div>
          <div class="text-xs text-[#0f172a] font-medium leading-relaxed">
            "${r.body}"
          </div>
        </div>

        <div class="space-y-2" id="reply-composer-box-${r.id}">
          <div class="flex items-center justify-between pt-1">
            <button onclick="toggleReplyComposer(${r.id})" class="text-[#3b82f6] hover:underline text-xs font-semibold flex items-center space-x-1.5">
              <i class="fa-solid fa-reply text-[10px]" aria-hidden="true"></i>
              <span>${r.is_replied_to ? 'View Sent Response' : 'Reply Back to Lead'}</span>
            </button>
            ${!r.is_replied_to ? `
              <button onclick="draftAIReplyFor(${r.id})" class="nt-btn-secondary text-xs py-1 px-2.5">
                <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#3b82f6] text-[9.5px]" aria-hidden="true"></i>
                <span>Draft AI Response</span>
              </button>
            ` : ''}
          </div>

          <div id="reply-drawer-${r.id}" class="hidden space-y-2 pt-2 border-t border-white/[0.05]">
            <textarea id="reply-text-${r.id}" rows="4" class="nt-white-textarea w-full text-xs font-sans" placeholder="Type your response or click 'Draft AI Response' above...">${r.reply_back_body || ''}</textarea>
            <div class="flex items-center justify-end space-x-2">
              <button type="button" onclick="toggleReplyComposer(${r.id})" class="nt-btn-secondary text-xs py-1.5 px-3">Close</button>
              <button type="button" onclick="sendReplyBack(${r.id})" class="nt-btn-paper-action text-xs py-1.5 px-3.5">
                <i class="fa-solid fa-paper-plane mr-1.5 text-[10px] text-blue-400"></i>
                <span>Send Response</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function toggleReplyComposer(replyId) {
  const drawer = document.getElementById(`reply-drawer-${replyId}`);
  if (!drawer) return;
  drawer.classList.toggle('hidden');
}

async function draftAIReplyFor(replyId) {
  showAppleToast('Drafting tailored DTC AI response...');
  try {
    const res = await fetch(`/api/replies/${replyId}/generate-response`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();

    const drawer = document.getElementById(`reply-drawer-${replyId}`);
    const textarea = document.getElementById(`reply-text-${replyId}`);
    if (drawer) drawer.classList.remove('hidden');
    if (textarea) textarea.value = data.body;
    showAppleToast('AI response prepared!');
  } catch (e) {
    showAppleToast('Error drafting response: ' + e, true);
  }
}

async function sendReplyBack(replyId) {
  const textarea = document.getElementById(`reply-text-${replyId}`);
  if (!textarea || !textarea.value.trim()) {
    showAppleToast('Please enter a response message', true);
    return;
  }

  showAppleToast('Dispatching response to prospect...');
  try {
    const res = await fetch(`/api/replies/${replyId}/send-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: 1,
        subject: "Re: connecting",
        body: textarea.value.trim(),
      }),
    });
    if (res.ok) {
      showAppleToast('Response sent successfully!');
      await fetchReplies();
      await fetchMetrics();
    }
  } catch (e) {
    showAppleToast('Failed to send: ' + e, true);
  }
}

// ── Follow-Up Bump Generator ──────────────────────────────────────────────

function populateFollowUpSelect() {
  const select = document.getElementById('followup-lead-select');
  const simSelect = document.getElementById('sim-lead-select');
  if (!select && !simSelect) return;

  const optionsHtml = leadsCache.map(l => `
    <option value="${l.id}">${l.full_name} (${l.role_title} @ ${l.company?.name || 'Brand'})</option>
  `).join('');

  if (select) select.innerHTML = optionsHtml;
  if (simSelect) simSelect.innerHTML = optionsHtml;
}

async function generateFollowUpStep(step) {
  const select = document.getElementById('followup-lead-select');
  if (!select || !select.value) return;
  const leadId = select.value;

  showAppleToast(`Generating DTC Follow-up #${step} bump...`);
  try {
    const res = await fetch(`/api/leads/${leadId}/generate-follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: parseInt(leadId), step }),
    });

    if (res.ok) {
      const data = await res.json();
      const container = document.getElementById('followup-preview-container');
      const subjEl = document.getElementById('followup-subject');
      const bodyEl = document.getElementById('followup-body');

      if (container) container.classList.remove('hidden');
      if (subjEl) subjEl.value = data.subject;
      if (bodyEl) bodyEl.value = data.body;
      showAppleToast(`Follow-up #${step} generated!`);
    }
  } catch (e) {
    showAppleToast('Error generating follow-up: ' + e, true);
  }
}

async function scheduleGeneratedFollowUp() {
  const select = document.getElementById('followup-lead-select');
  const subjEl = document.getElementById('followup-subject');
  const bodyEl = document.getElementById('followup-body');
  if (!select || !subjEl || !bodyEl) return;

  const leadId = select.value;
  try {
    await fetch(`/api/leads/${leadId}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subjEl.value,
        body: bodyEl.value,
        is_approved: true,
      }),
    });
    await runSchedulingOnly();
    showAppleToast('Follow-up scheduled in dispatch queue!');
    await fetchQueue();
    switchTab('queue');
  } catch (e) {
    showAppleToast('Error scheduling follow-up: ' + e, true);
  }
}

// ── Simulate Reply Modal ──────────────────────────────────────────────────

function openSimulateReplyModal() {
  populateFollowUpSelect();
  const dialog = document.getElementById('modal-simulate-reply');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else if (dialog) {
    dialog.setAttribute('open', '');
  }
}

function closeSimulateReplyModal() {
  const dialog = document.getElementById('modal-simulate-reply');
  if (dialog && typeof dialog.close === 'function') {
    dialog.close();
  } else if (dialog) {
    dialog.removeAttribute('open');
  }
}

async function submitSimulatedReply() {
  const leadId = parseInt(document.getElementById('sim-lead-select').value);
  const intent = document.getElementById('sim-intent').value;
  const body = document.getElementById('sim-body').value.trim();

  if (!body) {
    showAppleToast('Please enter a message body', true);
    return;
  }

  try {
    const res = await fetch('/api/replies/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        subject: "Re: DTC ad creative",
        body,
        intent,
      }),
    });

    if (res.ok) {
      closeSimulateReplyModal();
      showAppleToast('Reply logged! Metrics updated.');
      await fetchReplies();
      await fetchMetrics();
      await fetchCompaniesAndLeads();
    }
  } catch (e) {
    showAppleToast('Failed to log reply: ' + e, true);
  }
}

// ── Agentic CSV Pre-Flight Inspection & Upload ────────────────────────────

async function handleCsvFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  stagedCsvFile = file;
  const displayEl = document.getElementById('csv-filename-display');
  if (displayEl) {
    displayEl.innerText = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }

  // Pre-flight Agentic Audit
  await runAgenticPreflightAudit(file);
}

async function runAgenticPreflightAudit(file) {
  showAppleToast('Running agentic schema discovery & founder detection...');
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/leads/parse-preview', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Failed to analyze CSV');
    const audit = await res.json();

    renderAgenticAuditCard(audit);
  } catch (e) {
    showAppleToast('Agentic audit error: ' + e, true);
  }
}

function renderAgenticAuditCard(audit) {
  const card = document.getElementById('agentic-audit-card');
  const confEl = document.getElementById('audit-confidence');
  const sumEl = document.getElementById('audit-summary-count');
  const mapEl = document.getElementById('audit-column-mappings');
  const fCountEl = document.getElementById('audit-founders-count');
  const fListEl = document.getElementById('audit-founders-list');

  if (!card) return;
  card.classList.remove('hidden');

  if (confEl) confEl.innerText = `${audit.confidence_score}% Agentic Confidence`;
  if (sumEl) sumEl.innerText = `${audit.total_rows} contacts · ${audit.unique_brands_count} DTC brands`;

  // Render mapped columns chips
  if (mapEl) {
    const mappings = audit.mapped_columns || {};
    mapEl.innerHTML = Object.entries(mappings).map(([canonical, original]) => `
      <span class="nt-pill nt-pill-gray text-[10px]">
        <strong class="text-white">${canonical}</strong> &larr; "${original}"
      </span>
    `).join('');
  }

  // Render detected founders
  if (fCountEl) fCountEl.innerText = `${audit.detected_founders?.length || 0} Identified`;
  if (fListEl) {
    const founders = audit.detected_founders || [];
    if (founders.length === 0) {
      fListEl.innerHTML = '<span class="text-xs text-[#9da3af]">No founders detected (General growth leads)</span>';
    } else {
      fListEl.innerHTML = founders.map(f => `
        <span class="nt-pill nt-pill-amber text-[10px]">
          <i class="fa-solid fa-crown mr-1"></i> ${f.name} &middot; <strong class="text-white">${f.role}</strong> (${f.brand})
        </span>
      `).join('');
    }
  }
}

function cancelCsvPreview() {
  stagedCsvFile = null;
  const card = document.getElementById('agentic-audit-card');
  const displayEl = document.getElementById('csv-filename-display');
  const fileInput = document.getElementById('csv-file-input');

  if (card) card.classList.add('hidden');
  if (displayEl) displayEl.innerText = 'No file chosen';
  if (fileInput) fileInput.value = '';
}

async function confirmAgenticImport() {
  if (!stagedCsvFile) {
    showAppleToast('No CSV file staged', true);
    return;
  }

  const formData = new FormData();
  formData.append('file', stagedCsvFile);

  showAppleToast('Importing & clustering DTC brand prospects...');
  try {
    const res = await fetch(`/api/leads/upload-csv?campaign_id=${currentCampaignId}`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      showAppleToast(`Imported ${data.imported_leads} prospects across ${data.unique_companies} DTC brands!`);
      cancelCsvPreview();
      await refreshAll();
      switchTab('companies');
    }
  } catch (e) {
    showAppleToast('Upload failed: ' + e, true);
  }
}

// ── DTC Brand Sample Data Loader ──────────────────────────────────────────

const SAMPLE_DTC_CSV = `Brand,Founder / Exec,Work Email,Store URL,Designation,Location
Ridge,Sean Frank,sean@ridge.com,https://ridge.com,Co-Founder & CEO,Carlsbad CA
Ridge,Connor Macdonald,connor@ridge.com,https://ridge.com,VP of Performance Marketing,Carlsbad CA
Feastables,Bob Bilbruck,bob@feastables.com,https://feastables.com,Head of Growth,Chicago IL
Feastables,Sarah Jenkins,sarah.j@feastables.com,https://feastables.com,Director of Paid Media,Chicago IL
HexClad,Daniel Winer,daniel@hexclad.com,https://hexclad.com,CEO & Co-Founder,Los Angeles CA
Athletic Greens,Chris Asakawa,chris@drinkag1.com,https://drinkag1.com,Chief Marketing Officer,New York NY
True Classic,Ryan Bartlett,ryan@trueclassic.com,https://trueclassictees.com,CEO & Founder,Calabasas CA
Glossier,Kyle Leahy,kyle@glossier.com,https://glossier.com,Chief Executive Officer,New York NY`;

async function loadSampleDtcData() {
  const blob = new Blob([SAMPLE_DTC_CSV], { type: 'text/csv' });
  const file = new File([blob], 'sample_dtc_brands.csv', { type: 'text/csv' });
  stagedCsvFile = file;

  const displayEl = document.getElementById('csv-filename-display');
  if (displayEl) {
    displayEl.innerText = 'sample_dtc_brands.csv (8 DTC Brands & Founders)';
  }

  // Pre-flight Audit
  await runAgenticPreflightAudit(file);
}

function downloadSampleDtcCsv() {
  const blob = new Blob([SAMPLE_DTC_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dtc_prospects_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (activeTab === 'dashboard' && selectedLeadId) {
        e.preventDefault();
        saveAndApproveCommandDraft(selectedLeadId);
      } else if (activeTab === 'studio' && selectedLeadId) {
        e.preventDefault();
        saveAndApproveDraft(selectedLeadId);
      }
    }
  });
}
