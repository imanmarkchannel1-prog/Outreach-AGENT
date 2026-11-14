// ==========================================================================
// Outreach ENGINE — Apple Design System Frontend Controller (v2.1 PRO)
// Palette: Subtle Blue, White, Black, Subtle Warm Yellow, Understated Mint
// Dynamic Fleet Scaling, Real-Time Reply Tracking, AI Response Composer
// ==========================================================================

let activeTab = 'dashboard';
let currentCampaignId = 1;
let leadsCache = [];
let companiesCache = [];
let inboxesCache = [];
let repliesCache = [];
let selectedLeadId = null;
let leadFilterQuery = '';
let studioFilterQuery = '';
let mobileStudioMode = 'list'; // 'list' or 'detail'

document.addEventListener('DOMContentLoaded', async () => {
  initDragAndDrop();
  initDialogPolyfill();
  initKeyboardShortcuts();
  await refreshAll();

  // Periodic metrics, replies & queue polling (every 12s)
  setInterval(() => {
    fetchMetrics();
    if (activeTab === 'replies') fetchReplies();
    if (activeTab === 'queue') fetchQueue();
  }, 12000);
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

// ── Subtle HUD Toast Notification ─────────────────────────────────────────

function showAppleToast(message, isError = false) {
  const toast = document.getElementById('apple-toast');
  const text = document.getElementById('apple-toast-text');
  if (!toast || !text) return;

  text.innerText = message;
  const icon = toast.querySelector('i');
  if (icon) {
    icon.className = isError
      ? 'fa-solid fa-circle-exclamation text-[#ffd60a] text-xs'
      : 'fa-solid fa-circle-check text-[#2997ff] text-xs';
  }

  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3500);
}

// ── Tab Management ────────────────────────────────────────────────────────

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.segmented-tab').forEach(el => el.classList.remove('active'));

  const pane = document.getElementById(`tab-${tabId}`);
  const btn = document.getElementById(`nav-${tabId}`);
  if (pane) pane.classList.remove('hidden');
  if (btn) btn.classList.add('active');

  if (tabId === 'companies' || tabId === 'studio') {
    fetchCompaniesAndLeads();
  } else if (tabId === 'inboxes') {
    fetchInboxes();
  } else if (tabId === 'queue') {
    fetchQueue();
  } else if (tabId === 'replies') {
    fetchReplies();
  } else if (tabId === 'dashboard') {
    fetchMetrics();
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
    const elCapSub = document.getElementById('metric-capacity-sub');
    const elHealth = document.getElementById('metric-health-pct');
    const elHourly = document.getElementById('metric-hourly-rate');
    const elTotalDelivered = document.getElementById('metric-total-delivered');
    const elReplyRate = document.getElementById('metric-reply-rate');
    const elRepliesCount = document.getElementById('metric-replies-count');
    const elInterestedCount = document.getElementById('metric-interested-count');
    const elFleetSummary = document.getElementById('metric-fleet-summary');
    const elBadge = document.getElementById('inbox-count-badge');
    const elRepBadge = document.getElementById('replies-count-badge');

    if (elTotal) elTotal.innerText = m.total_inboxes;
    if (elCap) elCap.innerText = m.total_fleet_daily_capacity;
    if (elCapSub) elCapSub.innerText = m.total_fleet_daily_capacity;
    if (elHealth) elHealth.innerText = `${m.fleet_capacity_health_pct}%`;
    if (elHourly) elHourly.innerText = m.total_fleet_hourly_capacity;
    if (elTotalDelivered) elTotalDelivered.innerText = m.total_sent_all_time;
    if (elReplyRate) elReplyRate.innerText = `${m.reply_rate_pct}%`;
    if (elRepliesCount) elRepliesCount.innerText = m.total_replies_count;
    if (elInterestedCount) elInterestedCount.innerText = m.interested_replies_count;
    if (elBadge) elBadge.innerText = m.total_inboxes;
    if (elRepBadge) elRepBadge.innerText = m.total_replies_count;

    if (elFleetSummary) {
      elFleetSummary.innerText = `${m.total_inboxes} accounts pooled · ${m.total_fleet_hourly_capacity}/hr rate`;
    }

    // Top Sticky HUD
    const hudBanner = document.getElementById('hud-capacity-banner');
    const hudPace = document.getElementById('hud-pace');
    const hudReplyRate = document.getElementById('hud-reply-rate');
    const hudRepliesCount = document.getElementById('hud-replies-count');

    if (hudBanner) hudBanner.innerText = `${m.total_fleet_daily_capacity} sends/day`;
    if (hudPace) hudPace.innerText = m.total_fleet_hourly_capacity;
    if (hudReplyRate) hudReplyRate.innerText = `${m.reply_rate_pct}%`;
    if (hudRepliesCount) hudRepliesCount.innerText = m.total_replies_count;

    // Replies summary cards
    const repSumDelivered = document.getElementById('replies-summary-delivered');
    const repSumCount = document.getElementById('replies-summary-count');
    const repSumRate = document.getElementById('replies-summary-rate');
    const repSumInterested = document.getElementById('replies-summary-interested');

    if (repSumDelivered) repSumDelivered.innerText = m.total_sent_all_time;
    if (repSumCount) repSumCount.innerText = m.total_replies_count;
    if (repSumRate) repSumRate.innerText = `${m.reply_rate_pct}%`;
    if (repSumInterested) repSumInterested.innerText = m.interested_replies_count;

  } catch (e) {
    console.error('Failed to fetch metrics:', e);
  }
}

// ── Inboxes Fleet, Dynamic Limits & Live Authentication ───────────────────

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

function renderInboxList() {
  const container = document.getElementById('dashboard-inbox-list');
  const grid = document.getElementById('inbox-cards-grid');

  if (container) {
    container.innerHTML = inboxesCache.map(ib => `
      <div class="flex items-center justify-between p-2.5 rounded-md bg-[#141418] border border-white/[0.05] hover:border-white/[0.1] transition">
        <div class="flex items-center space-x-2.5">
          <div class="w-6 h-6 rounded-md bg-[#0071e3]/10 text-[#2997ff] flex items-center justify-center font-bold text-[11px] border border-[#0071e3]/25">
            <i class="fa-solid fa-envelope" aria-hidden="true"></i>
          </div>
          <div>
            <div class="text-xs font-semibold text-white flex items-center space-x-1.5">
              <span>${ib.display_name || 'Sender'}</span>
              <span class="text-[10.5px] text-[#8e8e93] font-mono">(${ib.email})</span>
            </div>
            <div class="text-[10px] text-[#8e8e93]">
              Daily Cap: <span class="text-white font-mono">${ib.daily_limit}/day</span> &middot; Rate: <span class="text-white font-mono">${ib.hourly_limit}/hr</span>
            </div>
          </div>
        </div>
        <div class="text-right flex items-center space-x-2">
          <button onclick="openEditInboxModal(${ib.id})" class="text-[11px] text-[#2997ff] hover:underline" title="Adjust daily/hourly caps">
            Edit
          </button>
          <span class="pill ${ib.is_quarantined ? 'pill-yellow' : 'pill-blue'} font-mono text-[9px]">
            ${ib.is_quarantined ? 'PAUSED' : 'READY &middot; 587'}
          </span>
        </div>
      </div>
    `).join('');
  }

  if (grid) {
    grid.innerHTML = inboxesCache.map(ib => `
      <div class="apple-card p-3.5 space-y-3 apple-card-hover">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-2.5">
            <div class="w-7 h-7 rounded-md bg-[#2997ff]/10 text-[#2997ff] flex items-center justify-center text-xs font-bold border border-white/[0.08]">
              <i class="fa-brands fa-google" aria-hidden="true"></i>
            </div>
            <div>
              <h4 class="text-xs font-semibold text-white tracking-tight">${ib.display_name || 'Sender Account'}</h4>
              <div class="text-[10.5px] text-[#8e8e93] font-mono">${ib.email}</div>
            </div>
          </div>
          <span class="pill ${ib.is_quarantined ? 'pill-yellow' : 'pill-blue'} font-mono text-[9px]">
            ${ib.is_quarantined ? 'PAUSED' : 'ACTIVE'}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-1.5 bg-[#0f0f12] p-2 rounded-md border border-white/[0.05] text-xs">
          <div>
            <div class="text-[9px] text-[#8e8e93] uppercase font-semibold">Daily Send Cap</div>
            <div class="text-xs font-bold text-white font-mono">${ib.daily_limit} <span class="text-[9.5px] text-[#8e8e93] font-normal">/ day</span></div>
          </div>
          <div>
            <div class="text-[9px] text-[#8e8e93] uppercase font-semibold">Hourly Pacing</div>
            <div class="text-xs font-bold text-white font-mono">${ib.hourly_limit} <span class="text-[9.5px] text-[#8e8e93] font-normal">/ hr</span></div>
          </div>
          <div>
            <div class="text-[9px] text-[#8e8e93] uppercase font-semibold">Typing Delay</div>
            <div class="text-xs font-bold text-[#ffd60a] font-mono">${ib.min_delay_seconds}–${ib.max_delay_seconds}s</div>
          </div>
          <div>
            <div class="text-[9px] text-[#8e8e93] uppercase font-semibold">Sent Today</div>
            <div class="text-xs font-bold text-[#2997ff] font-mono">${ib.sent_today_count}</div>
          </div>
        </div>

        <div class="pt-1.5 border-t border-white/[0.05] flex items-center justify-between text-xs">
          <div class="flex items-center space-x-2.5">
            <button onclick="testInboxConnection(${ib.id})" class="text-[#2997ff] hover:underline flex items-center space-x-1 font-medium text-[11px]">
              <i class="fa-solid fa-vial-circle-check text-[9.5px]" aria-hidden="true"></i>
              <span>Verify</span>
            </button>
            <button onclick="openEditInboxModal(${ib.id})" class="text-[#8e8e93] hover:text-white text-[11px]">
              Adjust Limits
            </button>
          </div>
          <button onclick="deleteInbox(${ib.id})" class="text-[#8e8e93] hover:text-[#ffd60a] text-[11px] transition">
            Remove
          </button>
        </div>
      </div>
    `).join('');
  }
}

async function testInboxConnection(inboxId) {
  showAppleToast('Verifying Google TLS handshake...');
  try {
    const res = await fetch(`/api/inboxes/${inboxId}/test`, { method: 'POST' });
    const data = await res.json();
    if (data.is_authenticated) {
      showAppleToast(data.message);
    } else {
      showAppleToast(data.message, true);
    }
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

// ── Native Dialog & Inbox Adding ──────────────────────────────────────────

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
      showAppleToast(`Inbox ${email} connected (${daily}/day limit)`);
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

// ── Companies & Leads Clustering with Live Search ─────────────────────────

async function fetchCompaniesAndLeads() {
  try {
    const [cRes, lRes] = await Promise.all([
      fetch('/api/companies'),
      fetch('/api/leads'),
    ]);
    if (!cRes.ok || !lRes.ok) return;
    companiesCache = await cRes.json();
    leadsCache = await lRes.json();

    renderCompanyClusterView();
    renderStudioLeadList();
    populateFollowUpSelect();
  } catch (e) {
    console.error('Failed to fetch leads:', e);
  }
}

function filterCompaniesAndLeads(query) {
  leadFilterQuery = (query || '').toLowerCase().trim();
  renderCompanyClusterView();
}

function renderCompanyClusterView() {
  const container = document.getElementById('company-lead-container');
  if (!container) return;

  if (companiesCache.length === 0) {
    container.innerHTML = `
      <div class="apple-card p-6 text-center space-y-2.5">
        <div class="w-8 h-8 rounded-md bg-[#0071e3]/10 text-[#2997ff] flex items-center justify-center text-sm mx-auto">
          <i class="fa-solid fa-users-viewfinder" aria-hidden="true"></i>
        </div>
        <h3 class="text-xs font-semibold text-white">No Prospects Imported</h3>
        <p class="text-[11px] text-[#8e8e93] max-w-sm mx-auto">Import a CSV in Step 1 or click "Load Demo Data" to test multi-lead company clustering, 24h staggering, and live web/Reddit enrichment.</p>
        <button onclick="loadSampleData()" class="btn-apple-primary text-xs py-1 px-3 mt-1">Load Demo Data</button>
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

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="apple-card p-4 text-center text-xs text-[#8e8e93]">
        No prospects or companies match "${leadFilterQuery}".
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(comp => {
    let compLeads = leadsCache.filter(l => l.company_id === comp.id);
    if (leadFilterQuery) {
      compLeads = compLeads.filter(l => 
        comp.name.toLowerCase().includes(leadFilterQuery) ||
        comp.domain.toLowerCase().includes(leadFilterQuery) ||
        l.full_name.toLowerCase().includes(leadFilterQuery) ||
        l.email.toLowerCase().includes(leadFilterQuery) ||
        l.role_title.toLowerCase().includes(leadFilterQuery)
      );
    }
    const hasMilestone = comp.has_recent_milestone;
    const redditPain = comp.reddit_intel?.pain_point;

    return `
      <article class="apple-card overflow-hidden">
        <!-- Company Header -->
        <div class="p-3 border-b border-white/[0.05] bg-[#111114] flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div class="space-y-0.5">
            <div class="flex items-center space-x-2">
              <h3 class="text-xs font-semibold text-white tracking-tight">${comp.name}</h3>
              <a href="${comp.website || '#'}" target="_blank" class="text-[10.5px] text-[#2997ff] hover:underline font-mono">${comp.domain}</a>
              <span class="pill pill-gray font-mono text-[9px]">
                ${compLeads.length} ${compLeads.length === 1 ? 'prospect' : 'prospects'}
              </span>
            </div>
            <div class="text-[10.5px] text-[#8e8e93] flex items-center space-x-2.5">
              <span><i class="fa-solid fa-location-dot mr-1 text-[9.5px]" aria-hidden="true"></i> ${comp.location || 'Global'}</span>
              <span><i class="fa-solid fa-shield-halved mr-1 text-[#2997ff] text-[9.5px]" aria-hidden="true"></i> 24h separation rule active</span>
            </div>
          </div>

          <!-- Intelligence Badges -->
          <div class="flex flex-wrap items-center gap-1">
            ${hasMilestone ? `
              <span class="pill pill-yellow" title="${comp.recent_milestone_summary || ''}">
                <i class="fa-solid fa-trophy mr-1 text-[9px]" aria-hidden="true"></i>
                <span>Win &lt; 30d</span>
              </span>
            ` : ''}

            ${redditPain ? `
              <span class="pill pill-blue" title="${redditPain}">
                <i class="fa-brands fa-reddit-alien mr-1 text-[9px]" aria-hidden="true"></i>
                <span>Reddit Intel</span>
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Leads Table for this Company -->
        <div class="overflow-x-auto no-scrollbar">
          <table class="w-full text-left text-xs min-w-[500px]">
            <thead class="bg-[#0f0f12] text-[#8e8e93] uppercase tracking-wider text-[9px] font-semibold border-b border-white/[0.04]">
              <tr>
                <th class="py-2 px-3.5">Contact</th>
                <th class="py-2 px-3.5">Role / Title</th>
                <th class="py-2 px-3.5">Seniority</th>
                <th class="py-2 px-3.5">Status</th>
                <th class="py-2 px-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.04] text-[#f4f4f6]">
              ${compLeads.map(lead => `
                <tr class="hover:bg-white/[0.02] transition">
                  <td class="py-2 px-3.5">
                    <div class="font-medium text-white text-xs">${lead.full_name}</div>
                    <div class="text-[10px] text-[#8e8e93] font-mono">${lead.email}</div>
                  </td>
                  <td class="py-2 px-3.5 text-[#f4f4f6] text-[11px]">
                    ${lead.role_title || 'Team Member'}
                  </td>
                  <td class="py-2 px-3.5">
                    <span class="pill ${getCategoryPillClass(lead.role_category)} font-mono text-[9px]">
                      ${lead.role_category.toUpperCase()} (Rank ${lead.seniority_rank})
                    </span>
                  </td>
                  <td class="py-2 px-3.5">
                    <span class="pill ${getStatusPillClass(lead.status)} font-mono text-[9px]">
                      ${lead.status.toUpperCase()}
                    </span>
                  </td>
                  <td class="py-2 px-3.5 text-right">
                    <button onclick="inspectLeadInStudio(${lead.id})" class="btn-apple-secondary text-[10.5px] py-0.5 px-2">
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

function getCategoryPillClass(category) {
  switch (category) {
    case 'executive': return 'pill-yellow';
    case 'technical': return 'pill-blue';
    case 'growth': return 'pill-blue';
    case 'operations': return 'pill-gray';
    default: return 'pill-gray';
  }
}

function getStatusPillClass(status) {
  switch (status) {
    case 'replied': return 'pill-yellow';
    case 'interested': return 'pill-yellow';
    case 'approved': return 'pill-blue';
    case 'sent': return 'pill-blue';
    case 'scheduled': return 'pill-blue';
    case 'drafted': return 'pill-blue';
    case 'researched': return 'pill-blue';
    default: return 'pill-gray';
  }
}

// ── Studio: Side-by-Side & Mobile Responsive Review ───────────────────────

function setMobileStudioMode(mode) {
  mobileStudioMode = mode;
  const colList = document.getElementById('studio-col-list');
  const colDetail = document.getElementById('studio-col-detail');
  const tabList = document.getElementById('mobile-studio-tab-list');
  const tabDetail = document.getElementById('mobile-studio-tab-detail');

  if (mode === 'list') {
    if (colList) colList.classList.remove('hidden');
    if (colDetail) {
      colDetail.classList.add('hidden');
      colDetail.classList.remove('flex');
    }
    if (tabList) tabList.classList.add('active');
    if (tabDetail) tabDetail.classList.remove('active');
  } else {
    if (colList) colList.classList.add('hidden');
    if (colDetail) {
      colDetail.classList.remove('hidden');
      colDetail.classList.add('flex');
    }
    if (tabList) tabList.classList.remove('active');
    if (tabDetail) tabDetail.classList.add('active');
  }
}

function filterStudioLeads(query) {
  studioFilterQuery = (query || '').toLowerCase().trim();
  renderStudioLeadList();
}

function renderStudioLeadList() {
  const container = document.getElementById('studio-lead-list');
  const countBadge = document.getElementById('studio-lead-count');
  const mobileBadge = document.getElementById('mobile-studio-badge');
  if (!container) return;

  const filtered = leadsCache.filter(l => {
    if (!studioFilterQuery) return true;
    return l.full_name.toLowerCase().includes(studioFilterQuery) ||
           l.email.toLowerCase().includes(studioFilterQuery) ||
           l.role_title.toLowerCase().includes(studioFilterQuery) ||
           (l.company?.name || '').toLowerCase().includes(studioFilterQuery);
  });

  if (countBadge) countBadge.innerText = filtered.length;
  if (mobileBadge) mobileBadge.innerText = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-[#8e8e93] text-xs">No matching prospects</div>';
    return;
  }

  container.innerHTML = filtered.map(lead => `
    <div onclick="selectStudioLead(${lead.id})" class="p-2 rounded-md border transition cursor-pointer ${selectedLeadId === lead.id ? 'bg-[#18181c] border-[#2997ff]/50' : 'bg-[#111114] border-white/[0.04] hover:border-white/[0.08]'}">
      <div class="flex items-center justify-between mb-0.5">
        <h4 class="text-xs font-semibold text-white truncate max-w-[150px] sm:max-w-[180px]">${lead.full_name}</h4>
        <span class="pill ${getStatusPillClass(lead.status)} text-[9px] font-mono">${lead.status}</span>
      </div>
      <div class="text-[10px] text-[#8e8e93] truncate">${lead.role_title} @ ${lead.company?.name || 'Company'}</div>
    </div>
  `).join('');

  if (!selectedLeadId && filtered.length > 0) {
    selectStudioLead(filtered[0].id, false);
  }
}

function inspectLeadInStudio(leadId) {
  switchTab('studio');
  selectStudioLead(leadId, true);
}

function selectStudioLead(leadId, autoSwitchMobile = true) {
  selectedLeadId = leadId;
  renderStudioLeadList();
  renderStudioDetail();

  if (autoSwitchMobile && window.innerWidth < 1024) {
    setMobileStudioMode('detail');
  }
}

function renderStudioDetail() {
  const panel = document.getElementById('studio-col-detail');
  if (!panel) return;

  const lead = leadsCache.find(l => l.id === selectedLeadId);
  if (!lead) {
    panel.innerHTML = '<div class="text-center py-16 text-[#8e8e93] text-xs">Select a prospect from the list.</div>';
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
      <!-- Mobile Back Button -->
      <div class="flex items-center justify-between pb-1.5 border-b border-white/[0.05] lg:hidden">
        <button type="button" onclick="setMobileStudioMode('list')" class="btn-apple-secondary text-[10.5px] py-0.5 px-2">
          <i class="fa-solid fa-arrow-left mr-1" aria-hidden="true"></i> Back
        </button>
        <span class="pill pill-blue font-mono text-[9px]">${lead.company?.name || 'Company'}</span>
      </div>

      <!-- Lead Header -->
      <div class="flex flex-col sm:flex-row sm:items-start justify-between pb-2.5 border-b border-white/[0.05] gap-2">
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-xs sm:text-sm font-bold text-white tracking-tight">${lead.full_name}</h3>
            <span class="pill ${getCategoryPillClass(lead.role_category)} font-mono text-[9px]">
              ${lead.role_category.toUpperCase()} (Rank ${lead.seniority_rank})
            </span>
          </div>
          <div class="text-[10.5px] text-[#8e8e93] mt-0.5">
            ${lead.role_title} at <strong class="text-white">${lead.company?.name || 'Company'}</strong> (${lead.email})
          </div>
        </div>

        <div class="flex items-center space-x-1.5 self-start sm:self-auto">
          <button onclick="reResearchLead(${lead.id})" class="btn-apple-secondary text-[10.5px] py-1 px-2">
            <i class="fa-solid fa-rotate mr-1 text-[9px]" aria-hidden="true"></i>
            <span>Re-Research</span>
          </button>
          <button onclick="reDraftLead(${lead.id})" class="btn-apple-secondary text-[10.5px] py-1 px-2">
            <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#2997ff] text-[9px]" aria-hidden="true"></i>
            <span>Redraft</span>
          </button>
        </div>
      </div>

      <!-- Live Research Intelligence Dossier -->
      <div class="bg-[#0f0f12] border border-white/[0.04] rounded-md p-2.5 sm:p-3 space-y-2">
        <div class="text-[10.5px] font-semibold text-[#2997ff] uppercase tracking-wider flex items-center space-x-1.5">
          <i class="fa-solid fa-brain text-[10px]" aria-hidden="true"></i>
          <span>Live Intelligence Dossier</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <!-- News < 30 Days -->
          <div class="bg-[#141417] border border-white/[0.04] p-2.5 rounded-md space-y-1">
            <div class="text-[10.5px] font-semibold text-[#ffd60a] flex items-center">
              <i class="fa-solid fa-trophy mr-1 text-[9.5px]" aria-hidden="true"></i> Recent Milestone (&lt; 30 days)
            </div>
            <p class="text-[11px] text-[#f4f4f6] leading-relaxed">
              ${recent.summary || 'Recent company growth and expansion in the market.'}
            </p>
            ${recent.congrats_hook ? `
              <div class="text-[10px] text-[#8e8e93] italic mt-0.5">
                Hook: "${recent.congrats_hook}"
              </div>
            ` : ''}
          </div>

          <!-- Reddit & Sentiment -->
          <div class="bg-[#141417] border border-white/[0.04] p-2.5 rounded-md space-y-1">
            <div class="text-[10.5px] font-semibold text-[#2997ff] flex items-center">
              <i class="fa-brands fa-reddit mr-1 text-[9.5px]" aria-hidden="true"></i> Reddit Pain Point Intel
            </div>
            <p class="text-[11px] text-[#f4f4f6] leading-relaxed">
              ${reddit.pain_point || 'Operational bottlenecks in scaling team bandwidth.'}
            </p>
            ${reddit.discussion_thread ? `
              <div class="text-[10px] text-[#8e8e93] truncate mt-0.5">
                Thread: ${reddit.discussion_thread}
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- AI Email Editor (Anti-Slop 4-Paragraph Format) -->
      <div class="space-y-2.5">
        <div>
          <label for="draft-subject" class="block text-[11px] font-semibold text-white mb-0.5">Subject Line</label>
          <input type="text" id="draft-subject" class="apple-input w-full font-mono text-xs" value="${draft?.subject || 'quick question: ' + (lead.company?.name || '').toLowerCase()}">
        </div>

        <div>
          <div class="flex items-center justify-between mb-0.5">
            <label for="draft-body" class="block text-[11px] font-semibold text-white">Email Body</label>
            <span id="draft-word-count" class="text-[10px] text-[#8e8e93] font-mono">${wordCount} words (Target: &lt; 110)</span>
          </div>
          <textarea id="draft-body" rows="6" oninput="updateWordCount(this.value)" class="apple-input w-full leading-relaxed text-xs">${draft?.body || 'Generating draft...'}</textarea>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
          <div class="text-[10.5px] text-[#8e8e93] flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-sm ${draft?.is_approved ? 'bg-[#2997ff]' : 'bg-[#ffd60a]'}"></span>
            <span>${draft?.is_approved ? 'Status: Approved' : 'Status: Draft Pending'}</span>
          </div>

          <button onclick="saveAndApproveDraft(${lead.id})" class="btn-apple-success text-xs py-1 px-3">
            <i class="fa-solid fa-check mr-1" aria-hidden="true"></i>
            <span>Save & Approve Draft</span>
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
  countEl.className = count > 115 ? 'text-[10px] text-[#ffd60a] font-mono' : 'text-[10px] text-[#8e8e93] font-mono';
}

async function saveAndApproveDraft(leadId) {
  const subjectEl = document.getElementById('draft-subject');
  const bodyEl = document.getElementById('draft-body');
  if (!subjectEl || !bodyEl) return;

  const subject = subjectEl.value;
  const body = bodyEl.value;

  try {
    const res = await fetch(`/api/leads/${leadId}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, is_approved: true }),
    });
    if (res.ok) {
      showAppleToast('Draft approved and queued!');
      await fetchCompaniesAndLeads();
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
  const hudBtn = document.getElementById('hud-btn-run');
  if (hudBtn) {
    hudBtn.disabled = true;
    hudBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Running...';
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
    if (hudBtn) {
      hudBtn.disabled = false;
      hudBtn.innerHTML = '<i class="fa-solid fa-play mr-1.5 text-[9px]"></i> Run Pipeline';
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
    const slots = await res.json();
    renderQueueTable(slots);
  } catch (e) {
    console.error('Failed to fetch queue:', e);
  }
}

function renderQueueTable(slots) {
  const tbody = document.getElementById('queue-table-body');
  if (!tbody) return;

  if (slots.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-[#8e8e93] text-xs">No slots currently scheduled. Approve drafts to populate dispatch queue.</td></tr>';
    return;
  }

  tbody.innerHTML = slots.map(s => {
    const dateObj = new Date(s.scheduled_at);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = dateObj.toLocaleDateString();

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="py-2 px-3 text-[#2997ff]">
          <div class="font-mono text-[11px]">${dateFormatted} ${timeFormatted}</div>
        </td>
        <td class="py-2 px-3">
          <div class="font-medium text-white">${s.lead_name || 'Prospect'}</div>
          <div class="text-[10px] text-[#8e8e93] font-mono">${s.lead_email}</div>
        </td>
        <td class="py-2 px-3 text-[#f4f4f6]">
          <span class="text-white">${s.company_domain || 'Company'}</span>
        </td>
        <td class="py-2 px-3 text-[#8e8e93] font-mono text-[10.5px]">
          ${s.inbox_email || 'Rotation Pool'}
        </td>
        <td class="py-2 px-3">
          <span class="text-[#ffd60a] font-mono text-[10.5px]">+${s.jitter_seconds || 120}s jitter</span>
        </td>
        <td class="py-2 px-3 text-right">
          <span class="pill ${getStatusPillClass(s.status)} font-mono text-[9px]">
            ${s.status.toUpperCase()}
          </span>
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
  } catch (e) {
    console.error('Failed to fetch replies:', e);
  }
}

function renderRepliesView() {
  const container = document.getElementById('replies-cards-container');
  const countEl = document.getElementById('replies-list-count');
  if (!container) return;

  if (countEl) countEl.innerText = repliesCache.length;

  if (repliesCache.length === 0) {
    container.innerHTML = `
      <div class="apple-card p-6 text-center space-y-2">
        <div class="w-8 h-8 rounded-md bg-[#2997ff]/10 text-[#2997ff] flex items-center justify-center text-sm mx-auto">
          <i class="fa-solid fa-reply-all" aria-hidden="true"></i>
        </div>
        <h4 class="text-xs font-semibold text-white">No Replies Logged Yet</h4>
        <p class="text-[10.5px] text-[#8e8e93] max-w-sm mx-auto">When prospects reply to your cold emails, they appear here automatically. You can also click "Simulate Reply" to test the AI response workflow.</p>
        <button onclick="openSimulateReplyModal()" class="btn-apple-secondary text-xs py-1 px-3 mt-1">
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
      <article class="apple-card p-3.5 space-y-2.5 transition border ${r.is_replied_to ? 'border-white/[0.05]' : 'border-[#2997ff]/40 bg-[#121216]'}">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <h4 class="text-xs font-bold text-white tracking-tight">${r.lead_name || r.sender_email}</h4>
              <span class="pill ${isInterested ? 'pill-yellow' : 'pill-blue'} font-mono text-[9px]">
                ${r.intent.toUpperCase()}
              </span>
              ${r.is_replied_to ? '<span class="pill pill-gray text-[9px]">REPLIED</span>' : '<span class="pill pill-yellow text-[9px]">NEEDS RESPONSE</span>'}
            </div>
            <div class="text-[10.5px] text-[#8e8e93] mt-0.5">
              ${r.role_title || 'Lead'} at <strong class="text-white">${r.company_name || 'Company'}</strong> &middot; ${r.sender_email}
            </div>
          </div>
          <span class="text-[10px] text-[#8e8e93] font-mono">${dateFormatted}</span>
        </div>

        <!-- Incoming Message Snippet -->
        <div class="bg-[#0f0f12] p-2.5 rounded-md border border-white/[0.04] text-xs text-[#f4f4f6] leading-relaxed">
          <div class="text-[9.5px] text-[#8e8e93] font-mono mb-1 font-semibold uppercase">Prospect Message:</div>
          "${r.body}"
        </div>

        <!-- Response Composer Trigger & Container -->
        <div class="space-y-2" id="reply-composer-box-${r.id}">
          <div class="flex items-center justify-between pt-1">
            <button onclick="toggleReplyComposer(${r.id})" class="text-[#2997ff] hover:underline text-[11px] font-medium flex items-center space-x-1">
              <i class="fa-solid fa-reply text-[10px]" aria-hidden="true"></i>
              <span>${r.is_replied_to ? 'View Sent Response' : 'Reply Back to Lead'}</span>
            </button>
            ${!r.is_replied_to ? `
              <button onclick="draftAIReplyFor(${r.id})" class="btn-apple-secondary text-[10.5px] py-0.5 px-2">
                <i class="fa-solid fa-wand-magic-sparkles mr-1 text-[#2997ff] text-[9.5px]" aria-hidden="true"></i>
                <span>Draft AI Response</span>
              </button>
            ` : ''}
          </div>

          <!-- Inline Expandable Composer -->
          <div id="reply-drawer-${r.id}" class="hidden space-y-2 pt-2 border-t border-white/[0.05]">
            <textarea id="reply-text-${r.id}" rows="4" class="apple-input w-full text-xs" placeholder="Type your response or click 'Draft AI Response' above...">${r.reply_back_body || ''}</textarea>
            <div class="flex items-center justify-end space-x-2">
              <button type="button" onclick="toggleReplyComposer(${r.id})" class="btn-apple-secondary text-[11px] py-1 px-2.5">Close</button>
              <button type="button" onclick="sendReplyBack(${r.id})" class="btn-apple-primary text-[11px] py-1 px-3">
                <i class="fa-solid fa-paper-plane mr-1 text-[9.5px]" aria-hidden="true"></i>
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

function previewFollowUpForSelectedLead() {
  generateFollowUpStep(1);
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

function initDragAndDrop() {
  // Handled via onclick file picker on container
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

function appendInstruction(text) {
  const el = document.getElementById('campaign-instructions');
  if (!el) return;
  el.value = el.value ? `${el.value} ${text}` : text;
  showAppleToast('Instruction updated');
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (activeTab === 'studio' && selectedLeadId) {
        e.preventDefault();
        saveAndApproveDraft(selectedLeadId);
      }
    }
  });
}
