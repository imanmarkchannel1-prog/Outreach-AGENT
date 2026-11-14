// ==========================================================================
// OUTREACH // OS (1) — High-Density Workstation Controller
// Inspired by Nothing Tech (Carl Pei) & ElevenLabs
// Architecture: Left-Rail Sidebar + High-Density Right Workstation
// Palette: Pitch Black (#000000), Nothing Red-Orange (#ff3b00), Industrial Grays
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
let mobileStudioMode = 'list';

document.addEventListener('DOMContentLoaded', async () => {
  initDialogPolyfill();
  initKeyboardShortcuts();
  await refreshAll();

  // Periodic polling for metrics, queue, and replies
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

// ── Toast HUD Notification ─────────────────────────────────────────────────

function showAppleToast(message, isError = false) {
  const toast = document.getElementById('apple-toast');
  const text = document.getElementById('apple-toast-text');
  if (!toast || !text) return;

  text.innerText = message;
  const dot = toast.querySelector('span');
  if (dot) {
    dot.style.background = isError ? '#ff3b00' : '#ff3b00';
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
  companies: '2. CLUSTERED PROSPECTS',
  studio: '3. AI REVIEW STUDIO',
  inboxes: '4. FLEET ACCOUNTS',
  queue: '5. DISPATCH QUEUE',
  replies: '6. REPLIES & SEQUENCES',
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

    // Command Center Cards
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
  // 1. Sidebar Streamlined Circular Avatar Stack (Nothing Tech Style)
  const circlesContainer = document.getElementById('sidebar-inbox-circles');
  if (circlesContainer) {
    const circlesHtml = inboxesCache.map(ib => {
      const initials = getInitials(ib.display_name, ib.email);
      const dotColor = ib.is_quarantined ? '#8c8c92' : '#ff3b00';
      const tooltip = `${ib.display_name || ib.email} (${ib.email}) — ${ib.daily_limit}/day, ${ib.hourly_limit}/hr`;

      return `
        <div onclick="openEditInboxModal(${ib.id})" class="nt-avatar-circle" title="${tooltip}">
          ${initials}
          <span class="nt-avatar-dot" style="background:${dotColor}"></span>
        </div>
      `;
    }).join('');

    const addBtnHtml = `
      <button onclick="openAddInboxModal()" class="w-7 h-7 rounded-full border border-dashed border-white/20 hover:border-[#ff3b00] text-[#8c8c92] hover:text-[#ff3b00] flex items-center justify-center text-xs font-mono transition" title="Add another Gmail inbox">
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
          <div class="text-[#ff3b00] text-lg font-mono">[!]</div>
          <h4 class="text-xs font-semibold text-white">No Sender Accounts Connected</h4>
          <p class="text-[11px] text-[#8c8c92]">Add personal Gmail inboxes to scale cold email volume safely.</p>
          <button onclick="openAddInboxModal()" class="nt-btn-orange text-xs py-1 px-3 mt-1">+ Add Gmail Account</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = inboxesCache.map(ib => {
      const initials = getInitials(ib.display_name, ib.email);
      return `
        <div class="nt-card p-3.5 space-y-3 nt-card-glow">
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-2.5">
              <div class="w-8 h-8 rounded-full bg-[#16161a] border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white">
                ${initials}
              </div>
              <div>
                <h4 class="text-xs font-semibold text-white tracking-tight">${ib.display_name || 'Sender Account'}</h4>
                <div class="text-[10px] text-[#8c8c92] font-mono">${ib.email}</div>
              </div>
            </div>
            <span class="nt-pill ${ib.is_quarantined ? 'nt-pill-gray' : 'nt-pill-orange'}">
              ${ib.is_quarantined ? 'PAUSED' : 'READY &middot; 587'}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-1.5 bg-[#0a0a0c] p-2 rounded border border-white/[0.04] text-xs">
            <div>
              <div class="text-[9px] text-[#8c8c92] uppercase font-mono">Daily Cap</div>
              <div class="text-xs font-bold text-white font-mono">${ib.daily_limit} <span class="text-[9px] text-[#8c8c92] font-normal">/day</span></div>
            </div>
            <div>
              <div class="text-[9px] text-[#8c8c92] uppercase font-mono">Hourly Pacing</div>
              <div class="text-xs font-bold text-white font-mono">${ib.hourly_limit} <span class="text-[9px] text-[#8c8c92] font-normal">/hr</span></div>
            </div>
            <div>
              <div class="text-[9px] text-[#8c8c92] uppercase font-mono">Typing Delay</div>
              <div class="text-xs font-bold text-[#ff3b00] font-mono">${ib.min_delay_seconds}–${ib.max_delay_seconds}s</div>
            </div>
            <div>
              <div class="text-[9px] text-[#8c8c92] uppercase font-mono">Sent Today</div>
              <div class="text-xs font-bold text-white font-mono">${ib.sent_today_count}</div>
            </div>
          </div>

          <div class="pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2">
              <button onclick="testInboxConnection(${ib.id})" class="text-[#ff3b00] hover:underline font-mono text-[10.5px]">
                Verify Handshake
              </button>
              <button onclick="openEditInboxModal(${ib.id})" class="text-[#8c8c92] hover:text-white font-mono text-[10.5px]">
                Edit Limits
              </button>
            </div>
            <button onclick="deleteInbox(${ib.id})" class="text-[#8c8c92] hover:text-white font-mono text-[10.5px]">
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

    // Render Command Center workstation (Page 1)
    renderCommandCenterDirectory();

    // Render Clustered Leads tab (Step 2)
    renderCompanyClusterView();

    // Render Studio tab (Step 3)
    renderStudioLeadList();

    // Populate selects
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
      return `<span class="nt-pill nt-pill-orange">${status.toUpperCase()}</span>`;
    case 'approved':
    case 'scheduled':
    case 'sent':
      return `<span class="nt-pill nt-pill-white">${status.toUpperCase()}</span>`;
    case 'drafted':
    case 'researched':
      return `<span class="nt-pill nt-pill-gray">${status.toUpperCase()}</span>`;
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
      <div class="p-6 text-center text-[#8c8c92] text-xs font-mono">
        ${leadFilterQuery ? 'No prospects match "' + leadFilterQuery + '"' : 'No prospects imported. Click "Demo Data" above.'}
      </div>
    `;
    return;
  }

  // Default selection if none selected
  if (!selectedLeadId && filtered.length > 0) {
    selectedLeadId = filtered[0].id;
  }

  container.innerHTML = filtered.map(l => {
    const isSelected = selectedLeadId === l.id;
    return `
      <div onclick="selectLead(${l.id})" class="p-2.5 rounded border transition cursor-pointer ${isSelected ? 'bg-[#18181c] border-[#ff3b00]' : 'bg-[#0f0f11] border-white/[0.04] hover:border-white/[0.1]'}">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center space-x-1.5 truncate">
            <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#ff3b00]' : 'bg-white/20'}"></span>
            <h4 class="text-xs font-semibold text-white truncate">${l.full_name}</h4>
          </div>
          ${getStatusPill(l.status)}
        </div>
        <div class="text-[10px] text-[#8c8c92] flex items-center justify-between font-mono">
          <span class="truncate">${l.role_title} @ <strong class="text-white">${l.company?.name || 'Company'}</strong></span>
          <span class="text-[9px] text-[#ff3b00]">${l.seniority_rank ? 'Rank ' + l.seniority_rank : ''}</span>
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
      <div class="text-center py-24 text-[#8c8c92] text-xs font-mono">
        Select a prospect from the left directory to inspect intelligence and edit copy.
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

  panel.innerHTML = `
    <div class="space-y-3">
      <!-- Header Bar -->
      <div class="flex flex-col sm:flex-row sm:items-start justify-between pb-2 border-b border-white/[0.06] gap-2">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-sm font-bold text-white tracking-tight">${lead.full_name}</h3>
            <span class="nt-pill nt-pill-gray text-[9px]">${(lead.role_category || 'LEAD').toUpperCase()}</span>
            ${getStatusPill(lead.status)}
          </div>
          <div class="text-[10px] text-[#8c8c92] font-mono mt-0.5">
            ${lead.role_title} &middot; <strong class="text-white">${lead.company?.name || 'Company'}</strong> (${lead.email})
          </div>
        </div>

        <div class="flex items-center space-x-1.5">
          <button onclick="reResearchLead(${lead.id})" class="nt-btn-secondary text-[10.5px] py-1 px-2 font-mono">
            <i class="fa-solid fa-rotate mr-1 text-[9px]" aria-hidden="true"></i> Re-Research
          </button>
          <button onclick="reDraftLead(${lead.id})" class="nt-btn-secondary text-[10.5px] py-1 px-2 font-mono">
            <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#ff3b00] text-[9px]" aria-hidden="true"></i> Redraft
          </button>
        </div>
      </div>

      <!-- Live Intelligence Badges & Findings -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <!-- Milestone < 30 days -->
        <div class="bg-[#09090b] border border-white/[0.05] p-2.5 rounded space-y-1">
          <div class="text-[10px] font-mono font-semibold text-[#ff3b00] flex items-center">
            <i class="fa-solid fa-trophy mr-1 text-[9px]" aria-hidden="true"></i> RECENT WIN (&lt;30 DAYS)
          </div>
          <p class="text-[11px] text-[#f4f4f6] leading-relaxed">
            ${recent.summary || 'Recent company growth milestone in the market.'}
          </p>
          ${recent.congrats_hook ? `
            <div class="text-[9.5px] text-[#8c8c92] font-mono italic">
              Hook: "${recent.congrats_hook}"
            </div>
          ` : ''}
        </div>

        <!-- Reddit Intel & Pain Point -->
        <div class="bg-[#09090b] border border-white/[0.05] p-2.5 rounded space-y-1">
          <div class="text-[10px] font-mono font-semibold text-[#8c8c92] flex items-center">
            <i class="fa-brands fa-reddit mr-1 text-[9px] text-[#ff3b00]" aria-hidden="true"></i> REDDIT PAIN POINT INTEL
          </div>
          <p class="text-[11px] text-[#f4f4f6] leading-relaxed">
            ${reddit.pain_point || 'Operational bottlenecks in scaling team bandwidth.'}
          </p>
          ${reddit.discussion_thread ? `
            <div class="text-[9.5px] text-[#8c8c92] font-mono truncate">
              r/thread: ${reddit.discussion_thread}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Anti-Slop Copy Editor -->
      <div class="space-y-2">
        <div>
          <label for="command-draft-subject" class="block text-[10px] font-mono text-[#8c8c92] mb-0.5">SUBJECT LINE</label>
          <input type="text" id="command-draft-subject" class="nt-input w-full font-mono text-xs" value="${draft?.subject || 'quick question: ' + (lead.company?.name || '').toLowerCase()}">
        </div>

        <div>
          <div class="flex items-center justify-between mb-0.5">
            <label for="command-draft-body" class="block text-[10px] font-mono text-[#8c8c92]">EMAIL BODY</label>
            <span id="command-draft-wordcount" class="text-[9.5px] text-[#8c8c92] font-mono">${wordCount} words (Target: &lt; 110)</span>
          </div>
          <textarea id="command-draft-body" rows="6" oninput="updateCommandWordCount(this.value)" class="nt-input w-full leading-relaxed text-xs">${draft?.body || 'Generating draft...'}</textarea>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[10px] text-[#8c8c92] font-mono flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${draft?.is_approved ? 'bg-white' : 'bg-[#ff3b00]'}"></span>
            <span>${draft?.is_approved ? 'Status: Approved & Scheduled' : 'Status: Draft Pending'}</span>
          </span>

          <button onclick="saveAndApproveCommandDraft(${lead.id})" class="nt-btn-orange text-xs py-1.5 px-3">
            <i class="fa-solid fa-check mr-1" aria-hidden="true"></i> Save & Approve Draft
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
  countEl.innerText = `${count} words (Target: < 110)`;
  countEl.className = count > 115 ? 'text-[9.5px] text-[#ff3b00] font-mono' : 'text-[9.5px] text-[#8c8c92] font-mono';
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

// ── Tab 2: Clustered Leads Table ──────────────────────────────────────────

function renderCompanyClusterView() {
  const container = document.getElementById('company-lead-container');
  if (!container) return;

  if (companiesCache.length === 0) {
    container.innerHTML = `
      <div class="nt-card p-6 text-center space-y-2">
        <h3 class="text-xs font-semibold text-white">No Prospects Imported</h3>
        <p class="text-[11px] text-[#8c8c92]">Import a CSV or click "Demo Data" to populate clustered prospects.</p>
        <button onclick="loadSampleData()" class="nt-btn-orange text-xs py-1 px-3 mt-1">Load Demo Data</button>
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
    const redditPain = comp.reddit_intel?.pain_point;

    return `
      <article class="nt-card overflow-hidden">
        <div class="p-3 border-b border-white/[0.05] bg-[#0c0c0e] flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-xs font-semibold text-white tracking-tight">${comp.name}</h3>
              <a href="${comp.website || '#'}" target="_blank" class="text-[10px] text-[#ff3b00] hover:underline font-mono">${comp.domain}</a>
              <span class="nt-pill nt-pill-gray text-[9px]">${compLeads.length} prospects</span>
            </div>
            <div class="text-[10px] text-[#8c8c92] font-mono mt-0.5">
              <span>Location: ${comp.location || 'Global'}</span> &middot; 
              <span class="text-white">24h Separation Active</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            ${hasMilestone ? `
              <span class="nt-pill nt-pill-orange">
                <i class="fa-solid fa-trophy mr-1 text-[8.5px]" aria-hidden="true"></i> Win &lt;30d
              </span>
            ` : ''}
            ${redditPain ? `
              <span class="nt-pill nt-pill-gray">
                <i class="fa-brands fa-reddit mr-1 text-[8.5px]" aria-hidden="true"></i> Reddit Intel
              </span>
            ` : ''}
          </div>
        </div>

        <div class="overflow-x-auto no-scrollbar">
          <table class="w-full text-left text-xs min-w-[500px]">
            <thead class="bg-[#08080a] text-[#8c8c92] font-mono uppercase tracking-wider text-[9px] border-b border-white/[0.04]">
              <tr>
                <th class="py-2 px-3.5">CONTACT</th>
                <th class="py-2 px-3.5">ROLE / TITLE</th>
                <th class="py-2 px-3.5">CATEGORY</th>
                <th class="py-2 px-3.5">STATUS</th>
                <th class="py-2 px-3.5 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.04] text-[#f4f4f6]">
              ${compLeads.map(lead => `
                <tr class="hover:bg-white/[0.02] transition">
                  <td class="py-2 px-3.5">
                    <div class="font-medium text-white text-xs">${lead.full_name}</div>
                    <div class="text-[10px] text-[#8c8c92] font-mono">${lead.email}</div>
                  </td>
                  <td class="py-2 px-3.5 text-xs text-[#8c8c92]">${lead.role_title}</td>
                  <td class="py-2 px-3.5">
                    <span class="nt-pill nt-pill-gray text-[9px] font-mono">${lead.role_category.toUpperCase()}</span>
                  </td>
                  <td class="py-2 px-3.5">
                    ${getStatusPill(lead.status)}
                  </td>
                  <td class="py-2 px-3.5 text-right">
                    <button onclick="inspectLeadInStudio(${lead.id})" class="nt-btn-secondary text-[10px] py-0.5 px-2 font-mono">
                      Review &rarr;
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }).join('');
}

// ── Tab 3: Dedicated AI Review Studio ─────────────────────────────────────

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
    container.innerHTML = '<div class="text-center py-6 text-[#8c8c92] text-xs font-mono">No prospects</div>';
    return;
  }

  container.innerHTML = filtered.map(lead => `
    <div onclick="selectStudioLead(${lead.id})" class="p-2 rounded border transition cursor-pointer ${selectedLeadId === lead.id ? 'bg-[#18181c] border-[#ff3b00]' : 'bg-[#0f0f11] border-white/[0.04] hover:border-white/[0.08]'}">
      <div class="flex items-center justify-between mb-0.5">
        <h4 class="text-xs font-semibold text-white truncate max-w-[150px]">${lead.full_name}</h4>
        ${getStatusPill(lead.status)}
      </div>
      <div class="text-[10px] text-[#8c8c92] font-mono truncate">${lead.role_title} @ ${lead.company?.name || 'Company'}</div>
    </div>
  `).join('');
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
    panel.innerHTML = '<div class="text-center py-20 text-[#8c8c92] text-xs font-mono">Select a prospect from the list.</div>';
    return;
  }

  const dossier = lead.research_dossier || {};
  const recent = dossier.recent_achievement || {};
  const reddit = dossier.reddit_insights || {};
  const draft = lead.draft;
  const bodyText = draft?.body || '';
  const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;

  panel.innerHTML = `
    <div class="space-y-3.5">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between pb-2.5 border-b border-white/[0.06] gap-2">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-sm font-bold text-white tracking-tight">${lead.full_name}</h3>
            <span class="nt-pill nt-pill-gray text-[9px] font-mono">${(lead.role_category || 'LEAD').toUpperCase()}</span>
            ${getStatusPill(lead.status)}
          </div>
          <div class="text-[10.5px] text-[#8c8c92] font-mono mt-0.5">
            ${lead.role_title} &middot; <strong class="text-white">${lead.company?.name || 'Company'}</strong> (${lead.email})
          </div>
        </div>

        <div class="flex items-center space-x-1.5">
          <button onclick="reResearchLead(${lead.id})" class="nt-btn-secondary text-[10.5px] py-1 px-2 font-mono">
            <i class="fa-solid fa-rotate mr-1 text-[9px]" aria-hidden="true"></i> Re-Research
          </button>
          <button onclick="reDraftLead(${lead.id})" class="nt-btn-secondary text-[10.5px] py-1 px-2 font-mono">
            <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#ff3b00] text-[9px]" aria-hidden="true"></i> Redraft
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div class="bg-[#09090b] border border-white/[0.05] p-2.5 rounded space-y-1">
          <div class="text-[10px] font-mono font-semibold text-[#ff3b00] flex items-center">
            <i class="fa-solid fa-trophy mr-1 text-[9px]" aria-hidden="true"></i> RECENT WIN (&lt;30 DAYS)
          </div>
          <p class="text-[11px] text-[#f4f4f6] leading-relaxed">
            ${recent.summary || 'Recent company growth milestone in the market.'}
          </p>
          ${recent.congrats_hook ? `
            <div class="text-[9.5px] text-[#8c8c92] font-mono italic">
              Hook: "${recent.congrats_hook}"
            </div>
          ` : ''}
        </div>

        <div class="bg-[#09090b] border border-white/[0.05] p-2.5 rounded space-y-1">
          <div class="text-[10px] font-mono font-semibold text-[#8c8c92] flex items-center">
            <i class="fa-brands fa-reddit mr-1 text-[9px] text-[#ff3b00]" aria-hidden="true"></i> REDDIT PAIN POINT INTEL
          </div>
          <p class="text-[11px] text-[#f4f4f6] leading-relaxed">
            ${reddit.pain_point || 'Operational bottlenecks in scaling team bandwidth.'}
          </p>
          ${reddit.discussion_thread ? `
            <div class="text-[9.5px] text-[#8c8c92] font-mono truncate">
              r/thread: ${reddit.discussion_thread}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="space-y-2">
        <div>
          <label for="draft-subject" class="block text-[10px] font-mono text-[#8c8c92] mb-0.5">SUBJECT LINE</label>
          <input type="text" id="draft-subject" class="nt-input w-full font-mono text-xs" value="${draft?.subject || 'quick question: ' + (lead.company?.name || '').toLowerCase()}">
        </div>

        <div>
          <div class="flex items-center justify-between mb-0.5">
            <label for="draft-body" class="block text-[10px] font-mono text-[#8c8c92]">EMAIL BODY</label>
            <span id="draft-word-count" class="text-[9.5px] text-[#8c8c92] font-mono">${wordCount} words (Target: &lt; 110)</span>
          </div>
          <textarea id="draft-body" rows="6" oninput="updateWordCount(this.value)" class="nt-input w-full leading-relaxed text-xs">${draft?.body || 'Generating draft...'}</textarea>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[10px] text-[#8c8c92] font-mono flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${draft?.is_approved ? 'bg-white' : 'bg-[#ff3b00]'}"></span>
            <span>${draft?.is_approved ? 'Status: Approved' : 'Status: Draft Pending'}</span>
          </span>

          <button onclick="saveAndApproveDraft(${lead.id})" class="nt-btn-orange text-xs py-1.5 px-3">
            <i class="fa-solid fa-check mr-1" aria-hidden="true"></i> Save & Approve Draft
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateWordCount(text) {
  const countEl = document.getElementById('draft-word-count');
  if (!countEl) return;
  const count = text.trim() ? text.trim().split(/\s+/).length : 0;
  countEl.innerText = `${count} words (Target: < 110)`;
  countEl.className = count > 115 ? 'text-[9.5px] text-[#ff3b00] font-mono' : 'text-[9.5px] text-[#8c8c92] font-mono';
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
  showAppleToast('Running live web & Reddit research...');
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
  showAppleToast('Regenerating anti-slop copy...');
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
  showAppleToast('Drafting emails for all leads...');
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
  if (!confirm('Approve all drafted emails across all companies?')) return;
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
    topbarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Running...';
  }

  try {
    if (leadsCache.length === 0) {
      await loadSampleCSVDirectly();
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
      topbarBtn.innerHTML = '<i class="fa-solid fa-play mr-1 text-[9px]"></i> Run Pipeline';
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

// ── Queue Management ──────────────────────────────────────────────────────

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
    container.innerHTML = '<div class="text-[11px] text-[#8c8c92] font-mono py-2">No active slots scheduled.</div>';
    return;
  }

  container.innerHTML = slots.slice(0, 4).map(s => {
    const timeFormatted = new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="flex items-center justify-between p-2 rounded bg-[#0a0a0c] border border-white/[0.04] text-xs">
        <div class="flex items-center space-x-2 truncate">
          <span class="text-[#ff3b00] font-mono text-[10.5px]">${timeFormatted}</span>
          <span class="text-white font-medium truncate">${s.lead_name || 'Prospect'}</span>
          <span class="text-[#8c8c92] text-[10px] font-mono">(${s.company_domain})</span>
        </div>
        <div class="flex items-center space-x-1.5 shrink-0">
          <span class="text-[9.5px] text-[#8c8c92] font-mono">+${s.jitter_seconds}s</span>
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
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-[#8c8c92] text-xs font-mono">No slots scheduled. Approve drafts to populate dispatch queue.</td></tr>';
    return;
  }

  tbody.innerHTML = slots.map(s => {
    const dateObj = new Date(s.scheduled_at);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = dateObj.toLocaleDateString();

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="py-2.5 px-3.5 text-[#ff3b00] font-mono text-[10.5px]">
          ${dateFormatted} ${timeFormatted}
        </td>
        <td class="py-2.5 px-3.5">
          <div class="font-medium text-white">${s.lead_name || 'Prospect'}</div>
          <div class="text-[10px] text-[#8c8c92] font-mono">${s.lead_email}</div>
        </td>
        <td class="py-2.5 px-3.5 text-white font-mono text-xs">
          ${s.company_domain || 'Company'}
        </td>
        <td class="py-2.5 px-3.5 text-[#8c8c92] font-mono text-[10.5px]">
          ${s.inbox_email || 'Rotation Pool'}
        </td>
        <td class="py-2.5 px-3.5 text-[#8c8c92] font-mono text-[10.5px]">
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
    container.innerHTML = '<div class="text-[11px] text-[#8c8c92] font-mono py-2">No incoming replies yet. Click "Demo Data" or "Simulate Reply".</div>';
    return;
  }

  container.innerHTML = replies.slice(0, 3).map(r => {
    return `
      <div onclick="switchTab('replies')" class="p-2 rounded bg-[#0a0a0c] border border-white/[0.04] text-xs hover:border-[#ff3b00] cursor-pointer transition space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-[#ff3b00]"></span>
            <span class="text-white font-semibold">${r.lead_name || r.sender_email}</span>
            <span class="text-[10px] text-[#8c8c92]">(${r.company_name})</span>
          </div>
          <span class="nt-pill ${r.intent === 'interested' ? 'nt-pill-orange' : 'nt-pill-gray'} text-[8.5px]">${r.intent.toUpperCase()}</span>
        </div>
        <p class="text-[10.5px] text-[#8c8c92] truncate italic">"${r.body}"</p>
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
        <h4 class="text-xs font-semibold text-white">No Replies Logged Yet</h4>
        <p class="text-[10.5px] text-[#8c8c92]">Click "Simulate Reply" above to test the AI response workflow.</p>
        <button onclick="openSimulateReplyModal()" class="nt-btn-orange text-xs py-1 px-3 mt-1">
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
      <article class="nt-card p-3.5 space-y-2.5 transition border ${r.is_replied_to ? 'border-white/[0.05]' : 'border-[#ff3b00]/40 bg-[#0e0e11]'}">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <h4 class="text-xs font-bold text-white tracking-tight">${r.lead_name || r.sender_email}</h4>
              <span class="nt-pill ${isInterested ? 'nt-pill-orange' : 'nt-pill-gray'} font-mono text-[9px]">
                ${r.intent.toUpperCase()}
              </span>
              ${r.is_replied_to ? '<span class="nt-pill nt-pill-gray text-[9px]">REPLIED</span>' : '<span class="nt-pill nt-pill-orange text-[9px]">NEEDS RESPONSE</span>'}
            </div>
            <div class="text-[10.5px] text-[#8c8c92] font-mono mt-0.5">
              ${r.role_title || 'Lead'} at <strong class="text-white">${r.company_name || 'Company'}</strong> &middot; ${r.sender_email}
            </div>
          </div>
          <span class="text-[10px] text-[#8c8c92] font-mono">${dateFormatted}</span>
        </div>

        <div class="bg-[#070709] p-2.5 rounded border border-white/[0.04] text-xs text-[#f4f4f6] leading-relaxed">
          <div class="text-[9px] text-[#8c8c92] font-mono mb-1 font-semibold uppercase">Prospect Message:</div>
          "${r.body}"
        </div>

        <div class="space-y-2" id="reply-composer-box-${r.id}">
          <div class="flex items-center justify-between pt-1">
            <button onclick="toggleReplyComposer(${r.id})" class="text-[#ff3b00] hover:underline text-[11px] font-mono flex items-center space-x-1">
              <i class="fa-solid fa-reply text-[9px]" aria-hidden="true"></i>
              <span>${r.is_replied_to ? 'View Sent Response' : 'Reply Back to Lead'}</span>
            </button>
            ${!r.is_replied_to ? `
              <button onclick="draftAIReplyFor(${r.id})" class="nt-btn-secondary text-[10.5px] py-0.5 px-2 font-mono">
                <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#ff3b00] text-[9px]" aria-hidden="true"></i>
                <span>Draft AI Response</span>
              </button>
            ` : ''}
          </div>

          <div id="reply-drawer-${r.id}" class="hidden space-y-2 pt-2 border-t border-white/[0.05]">
            <textarea id="reply-text-${r.id}" rows="4" class="nt-input w-full text-xs" placeholder="Type your response or click 'Draft AI Response' above...">${r.reply_back_body || ''}</textarea>
            <div class="flex items-center justify-end space-x-2">
              <button type="button" onclick="toggleReplyComposer(${r.id})" class="nt-btn-secondary text-[11px] py-1 px-2.5">Close</button>
              <button type="button" onclick="sendReplyBack(${r.id})" class="nt-btn-orange text-[11px] py-1 px-3">
                <i class="fa-solid fa-paper-plane mr-1 text-[9px]" aria-hidden="true"></i>
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
  showAppleToast('Drafting tailored AI response...');
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
    <option value="${l.id}">${l.full_name} (${l.role_title} @ ${l.company?.name || 'Company'})</option>
  `).join('');

  if (select) select.innerHTML = optionsHtml;
  if (simSelect) simSelect.innerHTML = optionsHtml;
}

async function generateFollowUpStep(step) {
  const select = document.getElementById('followup-lead-select');
  if (!select || !select.value) return;
  const leadId = select.value;

  showAppleToast(`Generating Follow-up #${step} bump...`);
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
        subject: "Re: discussion",
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

// ── CSV File Selection & Upload ───────────────────────────────────────────

function handleCsvFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const displayEl = document.getElementById('csv-filename-display');
  if (displayEl) {
    displayEl.innerText = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  }

  uploadCsvFile(file);
}

async function uploadCsvFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  showAppleToast('Uploading & clustering CSV leads...');
  try {
    const res = await fetch(`/api/leads/upload-csv?campaign_id=${currentCampaignId}`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      showAppleToast(`Imported ${data.imported_leads} leads across ${data.unique_companies} companies!`);
      await refreshAll();
      switchTab('companies');
    }
  } catch (e) {
    showAppleToast('Upload failed: ' + e, true);
  }
}

async function loadSampleCSVDirectly() {
  const sampleCSV = `first_name,last_name,email,company,role_title,website,location,linkedin
Sarah,Connor,sarah.c@stripe.com,Stripe,VP of Engineering,https://stripe.com,San Francisco CA,https://linkedin.com/in/sarah-connor
David,Miller,david.m@stripe.com,Stripe,Head of Product Marketing,https://stripe.com,San Francisco CA,https://linkedin.com/in/david-miller
Elena,Rostova,elena.r@stripe.com,Stripe,Chief Technology Officer,https://stripe.com,San Francisco CA,https://linkedin.com/in/elena-rostova
Marcus,Vance,marcus@linear.app,Linear,Head of Customer Success,https://linear.app,New York NY,https://linkedin.com/in/marcus-vance
Karim,Zowail,karim@linear.app,Linear,VP Growth & Sales,https://linear.app,New York NY,https://linkedin.com/in/karim-zowail
Maya,Patel,maya@anthropic.com,Anthropic,Director of Developer Relations,https://anthropic.com,San Francisco CA,https://linkedin.com/in/maya-patel
Liam,Nguyen,liam@vercel.com,Vercel,VP Infrastructure,https://vercel.com,San Francisco CA,https://linkedin.com/in/liam-nguyen
Chloe,Dubois,chloe@vercel.com,Vercel,Lead Growth Engineer,https://vercel.com,San Francisco CA,https://linkedin.com/in/chloe-dubois`;

  const blob = new Blob([sampleCSV], { type: 'text/csv' });
  const file = new File([blob], 'sample_prospects.csv', { type: 'text/csv' });
  await uploadCsvFile(file);
}

async function loadSampleData() {
  await loadSampleCSVDirectly();
}

function downloadSampleCsv() {
  const sampleCSV = `first_name,last_name,email,company,role_title,website,location,linkedin
Sarah,Connor,sarah.c@stripe.com,Stripe,VP of Engineering,https://stripe.com,San Francisco CA,https://linkedin.com/in/sarah-connor
David,Miller,david.m@stripe.com,Stripe,Head of Product Marketing,https://stripe.com,San Francisco CA,https://linkedin.com/in/david-miller
Elena,Rostova,elena.r@stripe.com,Stripe,Chief Technology Officer,https://stripe.com,San Francisco CA,https://linkedin.com/in/elena-rostova
Marcus,Vance,marcus@linear.app,Linear,Head of Customer Success,https://linear.app,New York NY,https://linkedin.com/in/marcus-vance
Karim,Zowail,karim@linear.app,Linear,VP Growth & Sales,https://linear.app,New York NY,https://linkedin.com/in/karim-zowail
Maya,Patel,maya@anthropic.com,Anthropic,Director of Developer Relations,https://anthropic.com,San Francisco CA,https://linkedin.com/in/maya-patel
Liam,Nguyen,liam@vercel.com,Vercel,VP Infrastructure,https://vercel.com,San Francisco CA,https://linkedin.com/in/liam-nguyen
Chloe,Dubois,chloe@vercel.com,Vercel,Lead Growth Engineer,https://vercel.com,San Francisco CA,https://linkedin.com/in/chloe-dubois`;

  const blob = new Blob([sampleCSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prospects_template.csv';
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
