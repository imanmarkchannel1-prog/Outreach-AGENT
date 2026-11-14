// ==========================================================================
// Outreach ENGINE — Apple HIG Frontend Controller
// ==========================================================================

let activeTab = 'dashboard';
let currentCampaignId = 1;
let leadsCache = [];
let companiesCache = [];
let inboxesCache = [];
let selectedLeadId = null;
let leadFilterQuery = '';
let studioFilterQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  initDragAndDrop();
  initDialogPolyfill();
  initKeyboardShortcuts();
  await refreshAll();

  // Periodic metrics & queue polling
  setInterval(() => {
    fetchMetrics();
    if (activeTab === 'queue') fetchQueue();
  }, 12000);
});

async function refreshAll() {
  await Promise.all([
    fetchMetrics(),
    fetchInboxes(),
    fetchCompaniesAndLeads(),
    fetchQueue(),
  ]);
}

// ── Apple HUD Toast Notification ──────────────────────────────────────────

function showAppleToast(message, isError = false) {
  const toast = document.getElementById('apple-toast');
  const text = document.getElementById('apple-toast-text');
  if (!toast || !text) return;

  text.innerText = message;
  const icon = toast.querySelector('i');
  if (icon) {
    icon.className = isError
      ? 'fa-solid fa-circle-exclamation text-[#ff453a]'
      : 'fa-solid fa-circle-check text-[#34c759]';
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
  } else if (tabId === 'dashboard') {
    fetchMetrics();
  }
}

// ── Metrics & Fleet Capacity ──────────────────────────────────────────────

async function fetchMetrics() {
  try {
    const res = await fetch('/api/deliverability/metrics');
    if (!res.ok) return;
    const m = await res.json();

    document.getElementById('metric-total-inboxes').innerText = m.total_inboxes;
    document.getElementById('metric-capacity').innerText = m.total_fleet_daily_capacity;
    document.getElementById('metric-needed-inboxes').innerText = `${m.recommended_inboxes_needed} inboxes`;
    document.getElementById('metric-health-pct').innerText = `${m.fleet_capacity_health_pct}%`;
    document.getElementById('metric-hourly-rate').innerText = m.total_inboxes * 5;
    document.getElementById('metric-pending-queue').innerText = m.pending_queue_count;
    document.getElementById('metric-window').innerText = m.business_hours_window;
    document.getElementById('inbox-count-badge').innerText = m.total_inboxes;

    // Sticky HUD metrics
    const hudCap = document.getElementById('hud-capacity');
    const hudPace = document.getElementById('hud-pace');
    if (hudCap) hudCap.innerText = m.total_fleet_daily_capacity;
    if (hudPace) hudPace.innerText = m.total_inboxes * 5;
  } catch (e) {
    console.error('Failed to fetch metrics:', e);
  }
}

// ── Inboxes Fleet & Live Authentication ────────────────────────────────────

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
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-[#1c1c1e] border border-white/[0.06] hover:border-white/[0.12] transition">
        <div class="flex items-center space-x-3.5">
          <div class="w-8 h-8 rounded-xl bg-[#0071e3]/15 text-[#2997ff] flex items-center justify-center font-bold text-xs border border-[#0071e3]/30">
            <i class="fa-solid fa-envelope" aria-hidden="true"></i>
          </div>
          <div>
            <div class="text-xs font-semibold text-white flex items-center space-x-2">
              <span>${ib.display_name || 'Sender'}</span>
              <span class="text-[11px] text-[#86868b] font-mono">(${ib.email})</span>
            </div>
            <div class="text-[11px] text-[#86868b]">
              Limit: <span class="text-white font-mono">${ib.daily_limit}/day</span> · Pacing: <span class="text-white font-mono">${ib.hourly_limit}/hr</span>
            </div>
          </div>
        </div>
        <div class="text-right">
          <span class="pill ${ib.is_quarantined ? 'pill-orange' : 'pill-green'} font-mono text-[10px]">
            ${ib.is_quarantined ? 'QUARANTINED' : 'ACTIVE · AUTHENTICATED'}
          </span>
          <div class="text-[10px] text-[#86868b] font-mono mt-1">Sent today: ${ib.sent_today_count}</div>
        </div>
      </div>
    `).join('');
  }

  if (grid) {
    grid.innerHTML = inboxesCache.map(ib => `
      <div class="apple-card p-5 space-y-4 apple-card-hover">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2997ff]/20 to-[#af52de]/20 text-[#2997ff] flex items-center justify-center text-sm font-bold border border-white/[0.1]">
              <i class="fa-brands fa-google" aria-hidden="true"></i>
            </div>
            <div>
              <h4 class="text-sm font-bold text-white tracking-tight">${ib.display_name || 'Sender Account'}</h4>
              <div class="text-xs text-[#86868b] font-mono">${ib.email}</div>
            </div>
          </div>
          <span class="pill ${ib.is_quarantined ? 'pill-orange' : 'pill-green'} font-mono text-[10px]">
            ${ib.is_quarantined ? 'QUARANTINE' : 'READY'}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2.5 bg-[#121214] p-3 rounded-xl border border-white/[0.06] text-xs">
          <div>
            <div class="text-[10px] text-[#86868b] uppercase font-semibold">Daily Send Cap</div>
            <div class="text-sm font-bold text-white font-mono">${ib.daily_limit} <span class="text-[10px] text-[#86868b] font-normal">/ day</span></div>
          </div>
          <div>
            <div class="text-[10px] text-[#86868b] uppercase font-semibold">Hourly Rate</div>
            <div class="text-sm font-bold text-white font-mono">${ib.hourly_limit} <span class="text-[10px] text-[#86868b] font-normal">/ hr</span></div>
          </div>
          <div>
            <div class="text-[10px] text-[#86868b] uppercase font-semibold">Human Delay</div>
            <div class="text-sm font-bold text-[#ff9f0a] font-mono">${ib.min_delay_seconds}–${ib.max_delay_seconds}s</div>
          </div>
          <div>
            <div class="text-[10px] text-[#86868b] uppercase font-semibold">Sent Today</div>
            <div class="text-sm font-bold text-[#34c759] font-mono">${ib.sent_today_count}</div>
          </div>
        </div>

        <div class="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
          <button onclick="testInboxConnection(${ib.id})" class="text-[#2997ff] hover:underline flex items-center space-x-1 font-medium">
            <i class="fa-solid fa-vial-circle-check text-[11px]" aria-hidden="true"></i>
            <span>Test Handshake</span>
          </button>
          <button onclick="deleteInbox(${ib.id})" class="text-[#ff453a] hover:underline text-xs">
            Remove
          </button>
        </div>
      </div>
    `).join('');
  }
}

async function testInboxConnection(inboxId) {
  showAppleToast('Testing Google SMTP handshake...');
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
  const dialog = document.getElementById('modal-inbox');
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
      showAppleToast(`Inbox ${email} successfully connected!`);
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
      <div class="apple-card p-12 text-center space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-[#0071e3]/10 text-[#2997ff] flex items-center justify-center text-xl mx-auto">
          <i class="fa-solid fa-users-viewfinder" aria-hidden="true"></i>
        </div>
        <h3 class="text-sm font-semibold text-white">No Prospects Imported Yet</h3>
        <p class="text-xs text-[#86868b] max-w-sm mx-auto">Import a CSV file in Step 1 or click "Load Demo Data" to test multi-lead company clustering, 24h staggering, and live web/Reddit enrichment.</p>
        <button onclick="loadSampleData()" class="btn-apple-primary text-xs py-2 px-4 mt-2">Load Sample Prospects</button>
      </div>
    `;
    return;
  }

  // Filter companies based on query matching company name, domain, or prospect details
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
      <div class="apple-card p-8 text-center text-xs text-[#86868b]">
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
        <div class="p-5 border-b border-white/[0.08] bg-[#141416] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center space-x-3">
              <h3 class="text-base font-bold text-white tracking-tight">${comp.name}</h3>
              <a href="${comp.website || '#'}" target="_blank" class="text-xs text-[#2997ff] hover:underline font-mono">${comp.domain}</a>
              <span class="pill pill-gray font-mono text-[10px]">
                ${compLeads.length} ${compLeads.length === 1 ? 'prospect' : 'prospects'}
              </span>
            </div>
            <div class="text-xs text-[#86868b] flex items-center space-x-3">
              <span><i class="fa-solid fa-location-dot mr-1" aria-hidden="true"></i> ${comp.location || 'Global'}</span>
              <span><i class="fa-solid fa-shield-halved mr-1 text-[#34c759]" aria-hidden="true"></i> Stagger: 24h separation enforced</span>
            </div>
          </div>

          <!-- Intelligence Badges -->
          <div class="flex flex-wrap items-center gap-2">
            ${hasMilestone ? `
              <span class="pill pill-orange" title="${comp.recent_milestone_summary || ''}">
                <i class="fa-solid fa-trophy mr-1 text-[10px]" aria-hidden="true"></i>
                <span>Milestone &lt; 30d</span>
              </span>
            ` : ''}

            ${redditPain ? `
              <span class="pill pill-purple" title="${redditPain}">
                <i class="fa-brands fa-reddit-alien mr-1 text-[10px]" aria-hidden="true"></i>
                <span>Reddit Intel Found</span>
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Leads Table for this Company -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-[#121214] text-[#86868b] uppercase tracking-wider text-[10px] font-semibold border-b border-white/[0.06]">
              <tr>
                <th class="py-3 px-5">Contact</th>
                <th class="py-3 px-5">Role / Post</th>
                <th class="py-3 px-5">Category & Seniority</th>
                <th class="py-3 px-5">Status</th>
                <th class="py-3 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/[0.04] text-[#f5f5f7]">
              ${compLeads.map(lead => `
                <tr class="hover:bg-white/[0.02] transition">
                  <td class="py-3 px-5">
                    <div class="font-semibold text-white">${lead.full_name}</div>
                    <div class="text-[11px] text-[#86868b] font-mono">${lead.email}</div>
                  </td>
                  <td class="py-3 px-5 font-medium text-slate-200">
                    ${lead.role_title || 'Team Member'}
                  </td>
                  <td class="py-3 px-5">
                    <span class="pill ${getCategoryPillClass(lead.role_category)} font-mono text-[10px]">
                      ${lead.role_category.toUpperCase()} (Rank ${lead.seniority_rank})
                    </span>
                  </td>
                  <td class="py-3 px-5">
                    <span class="pill ${getStatusPillClass(lead.status)} font-mono text-[10px]">
                      ${lead.status.toUpperCase()}
                    </span>
                  </td>
                  <td class="py-3 px-5 text-right">
                    <button onclick="inspectLeadInStudio(${lead.id})" class="btn-apple-secondary text-xs py-1 px-2.5">
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
    case 'executive': return 'pill-orange';
    case 'technical': return 'pill-blue';
    case 'growth': return 'pill-green';
    case 'operations': return 'pill-purple';
    default: return 'pill-gray';
  }
}

function getStatusPillClass(status) {
  switch (status) {
    case 'approved': return 'pill-green';
    case 'scheduled': return 'pill-purple';
    case 'sent': return 'pill-green';
    case 'drafted': return 'pill-blue';
    case 'researched': return 'pill-blue';
    default: return 'pill-gray';
  }
}

// ── Studio: Side-by-Side Review ───────────────────────────────────────────

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

  countBadge.innerText = filtered.length;
  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-[#86868b] text-xs">No matching prospects</div>';
    return;
  }

  container.innerHTML = filtered.map(lead => `
    <div onclick="selectStudioLead(${lead.id})" class="p-3 rounded-xl border transition cursor-pointer ${selectedLeadId === lead.id ? 'bg-[#1c1c1e] border-[#2997ff]' : 'bg-[#141416] border-white/[0.06] hover:border-white/[0.12]'}">
      <div class="flex items-center justify-between mb-1">
        <h4 class="text-xs font-semibold text-white truncate max-w-[170px]">${lead.full_name}</h4>
        <span class="pill ${getStatusPillClass(lead.status)} text-[9px] font-mono">${lead.status}</span>
      </div>
      <div class="text-[11px] text-[#86868b] truncate">${lead.role_title} @ ${lead.company?.name || 'Company'}</div>
    </div>
  `).join('');

  if (!selectedLeadId && filtered.length > 0) {
    selectStudioLead(filtered[0].id);
  }
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
  const panel = document.getElementById('studio-detail-panel');
  if (!panel) return;

  const lead = leadsCache.find(l => l.id === selectedLeadId);
  if (!lead) {
    panel.innerHTML = '<div class="text-center py-28 text-[#86868b] text-sm">Select a prospect from the left list.</div>';
    return;
  }

  const dossier = lead.research_dossier || {};
  const recent = dossier.recent_achievement || {};
  const reddit = dossier.reddit_insights || {};
  const draft = lead.draft;

  const bodyText = draft?.body || '';
  const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;

  panel.innerHTML = `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between pb-4 border-b border-white/[0.08]">
        <div>
          <div class="flex items-center space-x-3">
            <h3 class="text-base font-bold text-white tracking-tight">${lead.full_name}</h3>
            <span class="pill ${getCategoryPillClass(lead.role_category)} font-mono text-[10px]">
              ${lead.role_category.toUpperCase()} (Rank ${lead.seniority_rank})
            </span>
          </div>
          <div class="text-xs text-[#86868b] mt-0.5">
            ${lead.role_title} at <strong class="text-white">${lead.company?.name || 'Company'}</strong> (${lead.email})
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button onclick="reResearchLead(${lead.id})" class="btn-apple-secondary text-xs py-1.5 px-3">
            <i class="fa-solid fa-rotate mr-1.5 text-xs" aria-hidden="true"></i>
            <span>Re-Research</span>
          </button>
          <button onclick="reDraftLead(${lead.id})" class="btn-apple-secondary text-xs py-1.5 px-3">
            <i class="fa-solid fa-wand-magic-sparkles mr-1.5 text-[#2997ff] text-xs" aria-hidden="true"></i>
            <span>Redraft</span>
          </button>
        </div>
      </div>

      <!-- Live Research Intelligence Dossier -->
      <div class="bg-[#121214] border border-white/[0.06] rounded-2xl p-4 space-y-3">
        <div class="text-xs font-semibold text-[#2997ff] uppercase tracking-wider flex items-center space-x-2">
          <i class="fa-solid fa-brain" aria-hidden="true"></i>
          <span>Live Intelligence Dossier</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- News < 30 Days -->
          <div class="bg-[#18181b] border border-white/[0.06] p-3.5 rounded-xl space-y-1.5">
            <div class="text-xs font-semibold text-[#ff9f0a] flex items-center">
              <i class="fa-solid fa-trophy mr-1.5 text-[11px]" aria-hidden="true"></i> Recent Milestone (&lt; 30 days)
            </div>
            <p class="text-xs text-[#f5f5f7] leading-relaxed">
              ${recent.summary || 'Recent company growth and expansion in the market.'}
            </p>
            ${recent.congrats_hook ? `
              <div class="text-[11px] text-[#86868b] italic mt-1">
                Hook: "${recent.congrats_hook}"
              </div>
            ` : ''}
          </div>

          <!-- Reddit & Sentiment -->
          <div class="bg-[#18181b] border border-white/[0.06] p-3.5 rounded-xl space-y-1.5">
            <div class="text-xs font-semibold text-[#af52de] flex items-center">
              <i class="fa-brands fa-reddit mr-1.5 text-[11px]" aria-hidden="true"></i> Reddit Community Intel & Pain Point
            </div>
            <p class="text-xs text-[#f5f5f7] leading-relaxed">
              ${reddit.pain_point || 'Operational bottlenecks in scaling team bandwidth.'}
            </p>
            ${reddit.discussion_thread ? `
              <div class="text-[11px] text-[#86868b] truncate mt-1">
                Thread: ${reddit.discussion_thread}
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- AI Email Editor (Anti-Slop 4-Paragraph Format) -->
      <div class="space-y-4">
        <div>
          <label for="draft-subject" class="block text-xs font-semibold text-white mb-1.5">Subject Line (2–4 words, peer-to-peer)</label>
          <input type="text" id="draft-subject" class="apple-input w-full font-mono" value="${draft?.subject || 'quick question: ' + (lead.company?.name || '').toLowerCase()}">
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="draft-body" class="block text-xs font-semibold text-white">Email Body (Anti-slop 4-paragraph format)</label>
            <span id="draft-word-count" class="text-[11px] text-[#86868b] font-mono">${wordCount} words (Target: &lt; 110 words)</span>
          </div>
          <textarea id="draft-body" rows="9" oninput="updateWordCount(this.value)" class="apple-input w-full leading-relaxed">${draft?.body || 'Generating draft...'}</textarea>
        </div>

        <div class="flex items-center justify-between pt-2">
          <div class="text-xs text-[#86868b] flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full ${draft?.is_approved ? 'bg-[#34c759]' : 'bg-[#ff9f0a]'}"></span>
            <span>${draft?.is_approved ? 'Status: Approved for dispatch' : 'Status: Draft pending approval'}</span>
          </div>

          <button onclick="saveAndApproveDraft(${lead.id})" class="btn-apple-success text-xs py-2 px-4">
            <i class="fa-solid fa-check mr-1.5" aria-hidden="true"></i>
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
  countEl.innerText = `${count} words (Target: < 110 words)`;
  countEl.className = count > 115 ? 'text-[11px] text-[#ff453a] font-mono' : 'text-[11px] text-[#86868b] font-mono';
}

async function saveAndApproveDraft(leadId) {
  const subject = document.getElementById('draft-subject').value;
  const body = document.getElementById('draft-body').value;

  try {
    const res = await fetch(`/api/leads/${leadId}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, is_approved: true }),
    });
    if (res.ok) {
      showAppleToast('Draft approved and ready for dispatch!');
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
      showAppleToast('Research completed!');
      await fetchCompaniesAndLeads();
    }
  } catch (e) {
    showAppleToast('Research failed: ' + e, true);
  }
}

async function reDraftLead(leadId) {
  showAppleToast('Generating new anti-slop copy...');
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
  const btn = document.getElementById('btn-run-all');
  const hudBtn = document.getElementById('hud-btn-run');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Running Autonomous Pipeline...';
  }
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
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-play mr-2 text-xs"></i> Run Autonomous Pipeline Now';
    }
    if (hudBtn) {
      hudBtn.disabled = false;
      hudBtn.innerHTML = '<i class="fa-solid fa-play mr-1.5 text-[10px]"></i> Run Pipeline';
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
    tbody.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-[#86868b] font-sans text-xs">No slots currently scheduled. Approve drafts to populate dispatch queue.</td></tr>';
    return;
  }

  tbody.innerHTML = slots.map(s => {
    const dateObj = new Date(s.scheduled_at);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateFormatted = dateObj.toLocaleDateString();

    return `
      <tr class="hover:bg-white/[0.02] transition">
        <td class="py-3 px-5 text-[#2997ff]">
          <div>${dateFormatted} ${timeFormatted}</div>
          <div class="text-[10px] text-[#86868b]">+ randomized jitter</div>
        </td>
        <td class="py-3 px-5">
          <div class="font-semibold text-white">${s.lead_name || 'Prospect'}</div>
          <div class="text-[11px] text-[#86868b]">${s.lead_email}</div>
        </td>
        <td class="py-3 px-5 text-[#f5f5f7]">
          ${s.inbox_email || 'Round-Robin Pool'}
        </td>
        <td class="py-3 px-5">
          <span class="text-[#34c759] font-mono text-[11px]">24h Spaced</span>
        </td>
        <td class="py-3 px-5">
          <span class="pill ${getStatusPillClass(s.status)} font-mono text-[10px]">
            ${s.status.toUpperCase()}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// ── CSV Drag & Drop & Upload ──────────────────────────────────────────────

let selectedFile = null;

function initDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('csv-file-input');

  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-[#2997ff]');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-[#2997ff]');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-[#2997ff]');
    if (e.dataTransfer.files.length) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleSelectedFile(e.target.files[0]);
    }
  });
}

function handleSelectedFile(file) {
  selectedFile = file;
  const nameEl = document.getElementById('selected-file-name');
  if (nameEl) {
    nameEl.innerText = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    nameEl.classList.remove('hidden');
  }
}

async function submitCSVUpload() {
  if (!selectedFile) {
    showAppleToast('Please drop or select a CSV file first', true);
    return;
  }

  const formData = new FormData();
  formData.append('file', selectedFile);

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
  handleSelectedFile(file);
  await submitCSVUpload();
}

async function loadSampleData() {
  await loadSampleCSVDirectly();
}

async function clearCurrentLeads() {
  if (!confirm('Clear all leads and drafts in this campaign?')) return;
  try {
    await fetch(`/api/campaigns/${currentCampaignId}/leads`, { method: 'DELETE' });
    showAppleToast('Leads cleared');
    await refreshAll();
  } catch (e) {
    showAppleToast(e, true);
  }
}

function appendInstruction(text) {
  const el = document.getElementById('campaign-instructions');
  if (!el) return;
  el.value = el.value ? `${el.value} ${text}` : text;
  showAppleToast('Instruction updated');
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd+Enter or Ctrl+Enter in studio saves and approves
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (activeTab === 'studio' && selectedLeadId) {
        e.preventDefault();
        saveAndApproveDraft(selectedLeadId);
      }
    }
  });
}
