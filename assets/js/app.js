/**
 * AgriHibalo — app.js  (v5 · PHP Backend Connected)
 * All data operations now go through fetch() calls to the PHP API.
 * The in-memory seed data and registeredUsers array have been removed.
 *
 * API BASE PATHS:
 *   Auth      → assets/php/auth.php
 *   Questions → assets/php/questions.php
 *   Answers   → assets/php/answers.php
 *   Users     → assets/php/users.php
 *   Upload    → assets/php/upload.php
 */
'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS (must mirror config.php values)
═══════════════════════════════════════════════════════════ */
const DOMAINS = {
  farm:   { label:'🌾 Farming',        cats:['Soil Science','Crop Management','Irrigation','Pests & Disease','Fertilizers','Harvesting','General Farming'] },
  animal: { label:'🐄 Animal Science', cats:['Livestock','Poultry','Veterinary','Animal Feeds','Breeding','Housing','General Animal Science'] },
};

const TOPIC_PILLS = {
  all:    ['All','No Answer','Best Answered','Most Voted'],
  farm:   ['All Farming','🌱 Soil','🌾 Crops','💧 Irrigation','🐛 Pests','🌿 Organic'],
  animal: ['All Animals','🐄 Cattle','🐓 Poultry','🐷 Swine','🐐 Goats','💉 Veterinary'],
};

const BADGES_DEF = [
  { id:'first_q',    icon:'🌱', label:'First Question',    desc:'Posted your first question',        check: u => (u.q_count||u.qCount||0)  >= 1   },
  { id:'first_a',    icon:'✏️',  label:'First Answer',      desc:'Posted your first answer',          check: u => (u.a_count||u.aCount||0)  >= 1   },
  { id:'sprout',     icon:'🌿', label:'Sprout',            desc:'Reached Sprout title (100 pts)',    check: u => (u.pts||0)                >= 100 },
  { id:'planter',    icon:'🌾', label:'Planter',           desc:'Reached Planter title (200 pts)',   check: u => (u.pts||0)                >= 200 },
  { id:'best_ans',   icon:'✅', label:'Best Answer',       desc:'Had an answer marked as Best',      check: u => (u.best_ans||u.bestAns||0) >= 1  },
  { id:'helpful',    icon:'👍', label:'Helpful',           desc:'Earned 5 Best Answer marks',        check: u => (u.best_ans||u.bestAns||0) >= 5  },
  { id:'popular',    icon:'🔥', label:'Popular Question',  desc:'Question received 10+ votes',       check: u => (u.pts||0)                >= 110 },
  { id:'cultivator', icon:'🚜', label:'Cultivator',        desc:'Reached Cultivator title (400 pts)',check: u => (u.pts||0)                >= 400 },
];

const TITLES_DEF = [
  { id:'seedling',      label:'Seedling',     icon:'🌱', minPts:50,   color:'#10b981', bg:'#d1fae5' },
  { id:'sprout',        label:'Sprout',       icon:'🌿', minPts:100,  color:'#22c55e', bg:'#dcfce7' },
  { id:'planter',       label:'Planter',      icon:'🌾', minPts:200,  color:'#0f7436', bg:'#e8f4ec' },
  { id:'cultivator',    label:'Cultivator',   icon:'🚜', minPts:400,  color:'#d97706', bg:'#fffbeb' },
  { id:'agronomist',    label:'Agronomist',   icon:'🌻', minPts:700,  color:'#3b82f6', bg:'#eff6ff' },
  { id:'master_grower', label:'Master Grower',icon:'🏆', minPts:2000, color:'#9333ea', bg:'#fdf4ff' },
];

const BOUNTY_MIN      = 5;
const BOUNTY_MAX      = 10;
const ANSWER_FLAT_PTS = 3;
const ASKER_RETURN    = 3;

/* ── API base paths (relative — works from any subdirectory depth) ── */
const API = {
  auth:      'assets/php/auth.php',
  questions: 'assets/php/questions.php',
  answers:   'assets/php/answers.php',
  users:     'assets/php/users.php',
  upload:    'assets/php/upload.php',
};

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
let questions        = [];   // local cache of fetched questions
let activeDomain     = 'all';
let activeTopic      = 'All';
let activeSort       = 'newest';
let currentUser      = null; // logged-in user object (from PHP session)
let notifications    = [];   // local notification list
let tagList          = [];   // current ask-form tags
let toastTimer       = null;
let activeQId        = null; // question detail page question id
let activeProfile    = null; // name of profile being viewed (null = own profile)
let leaderboardCache = [];   // cached leaderboard rows

/* ═══════════════════════════════════════════════════════════
   API HELPERS
═══════════════════════════════════════════════════════════ */
async function api(endpoint, options = {}) {
  const res  = await fetch(endpoint, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Server error.');
  return json.data;
}
async function apiPost(endpoint, body) {
  return api(endpoint, { method:'POST', body:JSON.stringify(body) });
}
async function apiGet(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api(qs ? `${endpoint}?${qs}` : endpoint);
}

/* ═══════════════════════════════════════════════════════════
   TITLE & XP HELPERS
═══════════════════════════════════════════════════════════ */
function getUserTitle(pts) {
  for (let i = TITLES_DEF.length-1; i >= 0; i--) if (pts >= TITLES_DEF[i].minPts) return TITLES_DEF[i];
  return TITLES_DEF[0];
}
function getXPProgress(pts) {
  const cur  = getUserTitle(pts);
  const curI = TITLES_DEF.indexOf(cur);
  if (curI >= TITLES_DEF.length-1) return { pct:100, cur:pts, next:pts, nextTitle:cur };
  const next = TITLES_DEF[curI+1];
  return { pct:Math.round(((pts-cur.minPts)/(next.minPts-cur.minPts))*100), cur:pts, next:next.minPts, nextTitle:next };
}

/* ── Author chip (renders a clickable name + title badge) ── */
function authorChip(name, init, role, small = false) {
  const u     = leaderboardCache.find(x => x.name === name) || {};
  const pts   = u.pts || 0;
  const title = getUserTitle(pts);
  const badge = u.active_badge ? BADGES_DEF.find(b => b.id === u.active_badge) : null;
  const cls   = small ? 'author-chip author-chip-sm' : 'author-chip';
  return `<span class="${cls}" onclick="event.stopPropagation();viewProfile('${esc(name)}')" role="button" tabindex="0" title="View ${esc(name)}'s profile">
    <span class="ac-av">${esc(init)}</span>
    <span class="ac-name">${esc(name)}</span>
    <span class="ac-title" title="${title.label}" style="color:${title.color}">${title.icon}</span>
    ${badge ? `<span class="ac-badge" title="${badge.label}">${badge.icon}</span>` : ''}
  </span>`;
}

/* ═══════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  bootLoader();
  bootCursor();
  bootCanvas();
  bootNavScroll();
  bootCharCount();
  bootTagInput();
  bootDragDrop();
  updateCatOptions();
  renderTopicPills();

  /* Restore PHP session */
  try { const me = await apiGet(API.auth, { action:'me' }); if (me) applySession(me); } catch (_) {}

  /* Handle navigation from landing page */
  const stored       = sessionStorage.getItem('goto');
  const storedDomain = sessionStorage.getItem('domain');
  sessionStorage.removeItem('goto');
  sessionStorage.removeItem('domain');
  if (storedDomain && DOMAINS[storedDomain]) {
    activeDomain = storedDomain;
    const btn = $(`dt-${storedDomain}`);
    if (btn) { document.querySelectorAll('.domain-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
  }

  await loadLeaderboardCache();
  await loadFeed();
  renderSidebarLB();
  renderLeaderboard();
  if (stored && stored !== 'feed') setTimeout(() => gotoPage(stored), 0);
  setText('adm-date', new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));
});

function bootLoader() { window.addEventListener('load',()=>setTimeout(()=>$('loader')?.classList.add('done'),800)); }

function bootCursor() {
  const g=$('cursor-glow'); if(!g||window.matchMedia('(hover:none)').matches) return;
  let mx=0,my=0,cx=0,cy=0;
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
  (function tick(){cx+=(mx-cx)*.18;cy+=(my-cy)*.18;g.style.left=cx+'px';g.style.top=cy+'px';requestAnimationFrame(tick);})();
  document.addEventListener('mouseover',e=>{g.classList.toggle('hovering',!!e.target.closest('button,a,[role="button"]'));});
}

function bootCanvas() {
  const canvas=$('hero-canvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d'); let W,H,pts=[];
  function resize(){W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;}
  class P {
    constructor(){this.r2(true);}
    r2(init){this.x=Math.random()*W;this.y=init?Math.random()*H:H+10;this.r=Math.random()*2+.5;this.vx=(Math.random()-.5)*.4;this.vy=-(Math.random()*.6+.2);this.a=Math.random()*.5+.1;this.col=Math.random()>.5?`rgba(255,191,52,${this.a})`:`rgba(255,255,255,${this.a*.55})`;}
    update(){this.x+=this.vx;this.y+=this.vy;if(this.y<-10)this.r2(false);}
    draw(){ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fillStyle=this.col;ctx.fill();}
  }
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  pts=Array.from({length:70},()=>new P());
  (function animate(){ctx.clearRect(0,0,W,H);pts.forEach(p=>{p.update();p.draw();});requestAnimationFrame(animate);})();
}

function bootNavScroll() {
  window.addEventListener('scroll',()=>{
    document.getElementById('navbar')?.classList.toggle('scrolled',window.scrollY>4);
    document.querySelector('.domain-bar')?.classList.toggle('stuck',window.scrollY>80);
    document.querySelector('.topics-bar')?.classList.toggle('stuck',window.scrollY>80);
  },{passive:true});
}

document.addEventListener('click', e=>{
  if(!e.target.closest('button,a')) return;
  const r=document.createElement('div');const sz=60;
  r.className='ripple';r.style.cssText=`width:${sz}px;height:${sz}px;left:${e.clientX-sz/2}px;top:${e.clientY-sz/2}px`;
  $('rpl-root')?.appendChild(r);r.addEventListener('animationend',()=>r.remove());
});

/* ═══════════════════════════════════════════════════════════
   SESSION
═══════════════════════════════════════════════════════════ */
function applySession(u) {
  currentUser=$id={...u,name:u.full_name||u.name,init:u.init||initials(u.full_name||u.name)};
  $('user-pill').style.display='flex';
  setText('pill-av',   currentUser.init);
  setText('pill-name', currentUser.name);
  $('btn-signin').style.display='none';
  $('notif-btn').style.display='flex';
  if (currentUser.role==='admin') $('btn-admin').style.display='flex';
  updatePillPts();
}

function updatePillPts() {
  if (!currentUser) return;
  const pts=currentUser.pts||0, title=getUserTitle(pts);
  setText('pill-pts',  `${pts} pts`);
  setText('pill-title',`${title.icon} ${title.label}`);
  updateBountyDisplay($('q-bounty')?.value||BOUNTY_MIN);
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════ */
function gotoPage(name) {
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.setAttribute('aria-hidden','true');});
  const t=$(`pg-${name}`); if(!t) return;
  t.classList.add('active'); t.removeAttribute('aria-hidden');
  document.querySelectorAll('.nl').forEach(a=>a.classList.remove('active'));
  $(`nl-${name}`)?.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if (name==='feed')        loadFeed();
  if (name==='ask')         updateBountyDisplay($('q-bounty')?.value||BOUNTY_MIN);
  if (name==='leaderboard') renderLeaderboard();
  if (name==='profile')     renderProfile();
  if (name==='admin')       renderAdmin();
}

function goBackToFeed() { activeQId=null; gotoPage('feed'); }

async function viewProfile(name) {
  if (currentUser && currentUser.name===name) { activeProfile=null; gotoPage('profile'); return; }
  try {
    const u=await apiGet(API.users,{action:'profile',name});
    activeProfile=name; renderProfileFor(u); gotoPage('profile');
  } catch(err) { showToast(err.message||'User not found.','error'); }
}

function toggleMob() {
  const mn=$('mob-nav'),bg=$('burger');
  const o=mn.classList.toggle('open');
  bg.classList.toggle('open',o); bg.setAttribute('aria-expanded',String(o));
}

/* ═══════════════════════════════════════════════════════════
   DOMAIN & TOPIC FILTER
═══════════════════════════════════════════════════════════ */
function setDomain(dom,btn) {
  activeDomain=dom; activeTopic='All';
  document.querySelectorAll('.domain-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderTopicPills(); loadFeed();
}
function renderTopicPills() {
  const inner=$('topics-inner'); if(!inner) return;
  const pills=TOPIC_PILLS[activeDomain]||TOPIC_PILLS.all;
  inner.innerHTML=pills.map((p,i)=>`<button class="tp${i===0?' active':''}" onclick="setTopic('${p}',this)">${p}</button>`).join('');
}
function setTopic(t,btn) {
  activeTopic=t;
  document.querySelectorAll('.tp').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  loadFeed();
}

/* ═══════════════════════════════════════════════════════════
   LIVE SEARCH
═══════════════════════════════════════════════════════════ */
function liveSearch() {
  const val=$('srch').value.trim().toLowerCase(), drop=$('srch-drop');
  if(!val){drop.classList.remove('open');return;}
  const hits=questions.filter(q=>!q.hidden&&(q.title.toLowerCase().includes(val)||q.body.toLowerCase().includes(val))).slice(0,5);
  if(!hits.length){drop.classList.remove('open');return;}
  drop.innerHTML=hits.map(q=>`<div class="sd-item" onclick="focusQ(${q.id})">${esc(q.title).replace(new RegExp('('+esc(val)+')','gi'),'<strong>$1</strong>')}</div>`).join('');
  drop.classList.add('open');
}
function focusQ(id) {
  $('srch-drop').classList.remove('open');$('srch').value='';
  gotoPage('feed');
  setTimeout(()=>{const c=document.querySelector(`.q-card[data-id="${id}"]`);if(c){c.scrollIntoView({behavior:'smooth',block:'center'});c.style.outline='2px solid var(--g)';setTimeout(()=>c.style.outline='',2000);}},350);
}
document.addEventListener('click',e=>{if(!e.target.closest('.nsearch'))$('srch-drop')?.classList.remove('open');});

/* ═══════════════════════════════════════════════════════════
   FEED
═══════════════════════════════════════════════════════════ */
async function loadFeed() {
  const feed=$('feed'),empty=$('empty-st'),cntEl=$('feed-cnt');
  if(!feed) return;
  activeSort=$('sort-sel')?.value||'newest';
  const params={action:'list',domain:activeDomain,sort:activeSort};
  if(activeTopic==='No Answer')     params.topic='unanswered';
  if(activeTopic==='Best Answered') params.topic='best_answered';
  try { questions=await apiGet(API.questions,params); }
  catch(_) { showToast('Could not load questions. Is the database connected?','error'); questions=[]; }

  feed.querySelectorAll('.q-card').forEach(c=>c.remove());
  let list=[...questions];
  if(activeTopic==='Most Voted') list.sort((a,b)=>b.votes-a.votes);
  if(cntEl) cntEl.textContent=`${list.length} question${list.length!==1?'s':''}`;
  if(list.length===0){empty.style.display='';return;}
  empty.style.display='none';
  list.forEach((q,i)=>{const c=buildCard(q);c.style.animationDelay=`${i*45}ms`;feed.appendChild(c);});
  updateStats();
}
function renderFeed() { loadFeed(); }

function buildCard(q) {
  const card=document.createElement('div');
  card.className='q-card'; card.dataset.id=q.id; card.setAttribute('role','listitem');
  const n=parseInt(q.answer_count)||0;
  const isOwner=currentUser?.name===q.author;
  const domIcon=q.domain==='animal'?'🐄':'🌾';
  const init=q.init||initials(q.author);
  card.innerHTML=`
    <div class="q-card-inner">
      <div class="vote-rail">
        <button class="vote-btn up" onclick="event.stopPropagation();voteQ(${q.id},1,this)" aria-label="Helpful">▲</button>
        <span class="vote-count" id="vc-${q.id}">${q.votes}</span>
        <button class="vote-btn down" onclick="event.stopPropagation();voteQ(${q.id},-1,this)" aria-label="Not helpful">▼</button>
        <span style="font-size:.9rem;margin-top:4px" title="${DOMAINS[q.domain]?.label||''}">${domIcon}</span>
      </div>
      <div class="q-card-body" onclick="openQuestion(${q.id})" style="cursor:pointer" role="button" tabindex="0" aria-label="View: ${esc(q.title)}">
        <div class="q-top-row">
          ${authorChip(q.author,init,q.author_role,true)}
          <span class="q-dot">·</span>
          <span class="q-time">${ago(q.created_at)}</span>
          <span class="cat-tag ct-${q.domain}">${esc(q.category)}</span>
          ${n===0?'<span class="q-unanswered">⚡ No answers yet</span>':''}
          <span class="pts-chip" id="pts-${q.id}">⭐ ${q.bounty} pts offered</span>
          ${!q.reported&&!isOwner?`<button class="q-report-btn" onclick="event.stopPropagation();reportItem(${q.id},'question')" title="Report">⚑</button>`:''}
        </div>
        <h3 class="q-title-txt">${esc(q.title)}</h3>
        <p class="q-body-txt">${esc(q.body)}</p>
        ${q.tags&&q.tags.length?`<div class="q-tags">${q.tags.map(t=>`<span class="q-tag-chip">#${esc(t)}</span>`).join('')}</div>`:''}
        ${q.image_url?`<div class="q-img-strip"><img src="${esc(q.image_url)}" alt="Question photo" loading="lazy"></div>`:''}
        <div class="q-card-cta">
          <span>${n} answer${n!==1?'s':''} ${q.best_ans_id?'· ✅ Best Answer':''}</span>
          <span class="q-read-more">Read &amp; Answer →</span>
        </div>
      </div>
    </div>`;
  return card;
}

/* ═══════════════════════════════════════════════════════════
   QUESTION DETAIL
═══════════════════════════════════════════════════════════ */
async function openQuestion(qId) {
  activeQId=qId;
  try { const q=await apiGet(API.questions,{action:'get',id:qId}); renderQuestionDetail(q); gotoPage('question'); }
  catch(err) { showToast('Could not load question.','error'); }
}

function renderQuestionDetail(q) {
  const card=$('qd-card'),meta=$('qd-meta-card'),list=$('qd-ans-list'),cnt=$('qd-ans-count'),best=$('qd-best-note');
  if(!card) return;
  const isOwner=currentUser?.name===q.author;
  const init=q.init||initials(q.author);

  card.innerHTML=`
    <div class="qd-header">
      <div class="qd-meta-row">
        <div class="qd-author-chip">${authorChip(q.author,init,q.author_role)}<span class="qd-author-role">${q.author_role==='farmer'?'Farmer':'Student'}</span></div>
        <span class="qd-time">${ago(q.created_at)}</span>
        <span class="cat-tag ct-${q.domain}">${esc(q.category)}</span>
        <span class="pts-chip">⭐ ${q.bounty} pts offered</span>
        ${!q.reported&&!isOwner?`<button class="q-report-btn" onclick="reportItem(${q.id},'question')">⚑ Report</button>`:''}
      </div>
      <h1 class="qd-title">${esc(q.title)}</h1>
      ${q.tags&&q.tags.length?`<div class="q-tags">${q.tags.map(t=>`<span class="q-tag-chip">#${esc(t)}</span>`).join('')}</div>`:''}
    </div>
    <div class="qd-body-text">${esc(q.body)}</div>
    ${q.image_url?`<div class="qd-image-wrap"><img src="${esc(q.image_url)}" alt="Question photo" loading="lazy"/></div>`:''}
    <div class="qd-vote-row">
      <button class="vote-pill up" onclick="voteQ(${q.id},1,this)">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14"><path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>Helpful
      </button>
      <span class="vote-num" id="qd-vc-${q.id}">${q.votes} votes</span>
      <button class="vote-pill down" onclick="voteQ(${q.id},-1,this)">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14"><path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Not helpful
      </button>
    </div>`;

  if(meta) {
    meta.innerHTML=`
      <div class="sb-head"><span>📋</span><h3>Question Info</h3></div>
      <div class="qd-info-list">
        <div class="qi-row"><span class="qi-lbl">Domain</span><span>${DOMAINS[q.domain]?.label||q.domain}</span></div>
        <div class="qi-row"><span class="qi-lbl">Category</span><span>${esc(q.category)}</span></div>
        <div class="qi-row"><span class="qi-lbl">Asked</span><span>${ago(q.created_at)}</span></div>
        <div class="qi-row"><span class="qi-lbl">Answers</span><span>${(q.answers||[]).length}</span></div>
        <div class="qi-row"><span class="qi-lbl">Votes</span><span>${q.votes}</span></div>
        <div class="qi-row"><span class="qi-lbl">Bounty</span><span>⭐ ${q.bounty} pts</span></div>
        <div class="qi-row"><span class="qi-lbl">Distributed</span><span>${q.pts_distributed||0} pts paid out</span></div>
      </div>`;
  }

  if(cnt) cnt.textContent=(q.answers||[]).length;
  if(best) best.style.display=q.best_ans_id?'':'none';
  setText('qda-av',   currentUser?currentUser.init:'?');
  setText('qda-name', currentUser?currentUser.name:'Sign in to answer');

  if(list) {
    list.innerHTML='';
    if(!q.answers||q.answers.length===0) {
      list.innerHTML='<div class="qd-no-ans">No answers yet. Be the first to help!</div>';
    } else {
      q.answers.forEach(a=>{
        const isBest=String(q.best_ans_id)===String(a.id);
        const canMark=isOwner&&!q.best_ans_id;
        const ainit=a.init||initials(a.author);
        const item=document.createElement('div');
        item.className='qd-ans-item'+(isBest?' qd-ans-best':'');
        item.innerHTML=`
          ${isBest?'<div class="qd-best-banner">✅ Best Answer — chosen by the question author</div>':''}
          <div class="qd-ans-body">
            <div class="qd-ans-av-col"><div class="qd-ans-av">${esc(ainit)}</div></div>
            <div class="qd-ans-content">
              <div class="qd-ans-author-row">
                ${authorChip(a.author,ainit,'',true)}
                <span class="qd-ans-time">${ago(a.created_at)}</span>
                ${a.pts_earned?`<span class="ans-pts-earned">+${a.pts_earned} pts earned</span>`:''}
                ${canMark?`<button class="mark-best-btn" onclick="markBest(${q.id},${a.id})">Mark as Best Answer ✓</button>`:''}
                ${isBest?'<span class="mark-best-btn marked">✅ Best Answer</span>':''}
                ${isOwner&&!isBest&&!a.reported_by?`<button class="ans-report-btn" onclick="event.stopPropagation();reportAnswer(${q.id},${a.id})">⚑ Report Answer</button>`:''}
                ${a.reported_by?`<span class="ans-reported-tag">${a.report_status==='approved'?'⛔ Penalised':a.report_status==='dismissed'?'✓ Reviewed':'⏳ Under Review'}</span>`:''}
              </div>
              <div class="qd-ans-text">${esc(a.text)}</div>
              <div class="qd-ans-vote-row"><button class="ans-vote-btn" onclick="voteAnswer(${q.id},${a.id},this)">▲ Helpful (${a.votes})</button></div>
            </div>
          </div>`;
        list.appendChild(item);
      });
    }
  }
}

async function voteAnswer(qId,aId,btn) {
  if(!currentUser){showToast('Please sign in to vote.','error');return;}
  try {
    const res=await apiPost(API.answers,{action:'vote',answer_id:aId,direction:1});
    btn.textContent=`▲ Helpful (${res.votes})`; btn.classList.toggle('voted');
  } catch(err){showToast(err.message,'error');}
}

async function submitQDAnswer() {
  const ta=$('qd-ans-input'); if(!ta) return;
  if(!currentUser){showToast('Please sign in to post an answer.','error');gotoPage('login');return;}
  const text=ta.value.trim();
  if(!text){shake(ta);showToast('Please write your answer.','error');return;}
  try {
    const res=await apiPost(API.answers,{action:'post',question_id:activeQId,text});
    ta.value='';
    currentUser.a_count=(currentUser.a_count||0)+1;
    currentUser.pts=(currentUser.pts||0)+(res.pts_earned||ANSWER_FLAT_PTS);
    updatePillPts();
    pushNotif(`💬 You answered a question! +${res.pts_earned} pts`,'answer');
    showToast(`Answer posted! +${res.pts_earned} pts earned ⭐`,'success');
    const q=await apiGet(API.questions,{action:'get',id:activeQId});
    renderQuestionDetail(q);
  } catch(err){showToast(err.message,'error');}
}

async function markBest(qId,aId) {
  try {
    const res=await apiPost(API.answers,{action:'mark_best',question_id:qId,answer_id:aId});
    currentUser.pts=(currentUser.pts||0)+ASKER_RETURN; updatePillPts();
    pushNotif('✅ You marked a Best Answer!','success');
    showToast(res.message||'Best Answer marked! 🏆','success');
    const q=await apiGet(API.questions,{action:'get',id:qId});
    renderQuestionDetail(q);
  } catch(err){showToast(err.message,'error');}
}

async function voteQ(qId,dir,btn) {
  if(!currentUser){showToast('Please sign in to vote.','error');return;}
  try {
    const res=await apiPost(API.questions,{action:'vote',question_id:qId,direction:dir});
    const rail=btn.closest('.vote-rail,.qd-vote-row');
    const up=rail?.querySelector('.vote-btn.up,.vote-pill.up');
    const dn=rail?.querySelector('.vote-btn.down,.vote-pill.down');
    if(up) up.classList.toggle('voted',res.your_vote===1);
    if(dn) dn.classList.toggle('voted',res.your_vote===-1);
    const vcF=$(`vc-${qId}`);    if(vcF) vcF.textContent=res.votes;
    const vcQ=$(`qd-vc-${qId}`); if(vcQ) vcQ.textContent=`${res.votes} votes`;
  } catch(err){showToast(err.message||'Could not vote.','error');}
}

/* ═══════════════════════════════════════════════════════════
   ASK FORM
═══════════════════════════════════════════════════════════ */
function updateCatOptions() {
  const dom=$('qdom')?.value||'farm', sel=$('qcat'); if(!sel) return;
  sel.innerHTML=DOMAINS[dom].cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

async function submitQ(e) {
  e.preventDefault();
  if(!currentUser){showToast('Please sign in to post a question.','error');gotoPage('login');return;}
  const title=$('qt').value.trim(), body=$('qb').value.trim();
  if(!title){shake($('qt'));showToast('Please enter a title.','error');return;}
  if(!body){shake($('qb'));showToast('Please describe your problem.','error');return;}
  const bounty=Math.min(BOUNTY_MAX,Math.max(BOUNTY_MIN,parseInt($('q-bounty')?.value)||BOUNTY_MIN));
  if((currentUser.pts||0)<bounty){showToast(`Not enough points. You have ${currentUser.pts||0} pts — need ${bounty}.`,'error');return;}

  let image_url=null;
  const fileInput=$('qimg');
  if(fileInput?.files?.[0]) {
    try {
      const fd=new FormData(); fd.append('image',fileInput.files[0]);
      const res=await fetch(API.upload,{method:'POST',credentials:'same-origin',body:fd});
      const json=await res.json();
      if(json.success) image_url=json.data.url;
    } catch(_){}
  }

  try {
    await apiPost(API.questions,{action:'post',title,body,domain:$('qdom')?.value||'farm',category:$('qcat')?.value||'General',tags:[...tagList],bounty,image_url});
    currentUser.pts=(currentUser.pts||0)-bounty;
    currentUser.q_count=(currentUser.q_count||0)+1;
    updatePillPts();
    tagList=[];$('tag-chips').innerHTML='';$('qt').value='';$('qb').value='';
    $('cct').textContent='0 / 1000'; if($('q-bounty'))$('q-bounty').value=BOUNTY_MIN; rmImg();
    showToast(`Question posted! −${bounty} pts offered as bounty 🌾`,'success');
    gotoPage('feed');
  } catch(err){showToast(err.message,'error');}
}

function updateBountyDisplay(val) {
  val=parseInt(val)||BOUNTY_MIN; setText('bounty-val',val);
  const slider=$('q-bounty');
  if(slider){const pct=((val-BOUNTY_MIN)/(BOUNTY_MAX-BOUNTY_MIN))*100;slider.style.setProperty('--val',pct+'%');}
  const balEl=$('ask-balance');
  if(balEl&&currentUser){
    const bal=currentUser.pts||0;
    balEl.textContent=bal<0?`${bal} (negative — answer to recover)`:bal;
    balEl.closest('.bounty-balance')?.classList.toggle('low',bal<val);
  } else if(balEl) balEl.textContent='Sign in to see';
}

/* ═══════════════════════════════════════════════════════════
   TAGS
═══════════════════════════════════════════════════════════ */
function bootTagInput() {
  const input=$('tag-in'); if(!input) return;
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===','){e.preventDefault();addTag(input.value.trim().replace(/,$/,''));input.value='';}
    if(e.key==='Backspace'&&!input.value&&tagList.length) removeTag(tagList[tagList.length-1]);
  });
  input.addEventListener('blur',()=>{if(input.value.trim()){addTag(input.value.trim());input.value='';}});
}
function addTag(t){if(!t||tagList.includes(t)||tagList.length>=5)return;tagList.push(t);renderTagChips();}
function removeTag(t){tagList=tagList.filter(x=>x!==t);renderTagChips();}
function renderTagChips(){const c=$('tag-chips');if(!c)return;c.innerHTML=tagList.map(t=>`<span class="tag-chip">#${esc(t)}<button onclick="removeTag('${esc(t)}')" aria-label="Remove tag">×</button></span>`).join('');}

/* ═══════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════ */
function updateStats() {
  const totalA=questions.reduce((s,q)=>s+(parseInt(q.answer_count)||0),0);
  animNum('hc-q',questions.length); animNum('hc-a',totalA);
  const fc=$('feed-cnt'); if(fc) fc.textContent=`${questions.length} question${questions.length!==1?'s':''}`;
}

/* ═══════════════════════════════════════════════════════════
   LEADERBOARD
═══════════════════════════════════════════════════════════ */
async function loadLeaderboardCache() {
  try { leaderboardCache=await apiGet(API.users,{action:'leaderboard'}); } catch(_){leaderboardCache=[];}
}

function renderSidebarLB() {
  const list=$('sb-lb'); if(!list) return;
  const sorted=[...leaderboardCache].filter(u=>!u.banned).sort((a,b)=>b.pts-a.pts);
  if(!sorted.length){list.innerHTML='<div style="padding:12px 0;font-size:.8rem;color:var(--n400)">No contributors yet.</div>';return;}
  list.innerHTML=sorted.slice(0,5).map((u,i)=>`
    <div class="sb-lb-row">
      <span class="sb-lb-rank">${['🥇','🥈','🥉'][i]??i+1}</span>
      <div class="sb-lb-av">${esc(u.init)}</div>
      <span class="sb-lb-name">${esc(u.name)}</span>
      <span class="sb-lb-pts">${u.pts} pts</span>
    </div>`).join('');
}

async function renderLeaderboard() {
  try { leaderboardCache=await apiGet(API.users,{action:'leaderboard'}); } catch(_){}
  const sorted=[...leaderboardCache].filter(u=>!u.banned).sort((a,b)=>b.pts-a.pts);
  const pod=$('lb-podium');
  if(pod&&sorted.length>=3){
    const order=[1,0,2],rankLabel=['1st','2nd','3rd'],barH=['pb1','pb2','pb3'];
    pod.innerHTML=order.map(i=>`
      <div class="podium-block">
        <div class="podium-av">${esc(sorted[i].init)}<div class="podium-rank-badge pr-${i}">${rankLabel[i]}</div></div>
        <div class="podium-name">${esc(sorted[i].name)}</div>
        <div class="podium-role-lbl">${sorted[i].role==='farmer'?'Farmer':'Student'}</div>
        <div class="podium-pts">${sorted[i].pts} pts</div>
        <div class="podium-bar ${barH[i]}">${rankLabel[i]}</div>
      </div>`).join('');
  } else if(pod) pod.innerHTML='';

  const tbl=$('lb-table'); if(!tbl) return;
  if(!sorted.length){tbl.innerHTML='<div style="padding:48px 24px;text-align:center;color:var(--n400)">No active members yet.</div>';return;}
  tbl.innerHTML='';
  sorted.forEach((u,i)=>{
    const earned=BADGES_DEF.filter(b=>b.check(u));
    const rankClass=['rank-1','rank-2','rank-3'][i]||'';
    const rankDisplay=['1st','2nd','3rd'][i]||(i+1);
    const row=document.createElement('div');row.className='lb-row';row.style.animationDelay=`${i*55}ms`;
    row.innerHTML=`
      <div class="lb-rank ${rankClass}">${rankDisplay}</div>
      <div class="lb-av">${esc(u.init)}</div>
      <div class="lb-info">
        <div class="lb-name">${esc(u.name)}</div>
        <div class="lb-role-badge">${u.role==='farmer'?'Farmer':'Student'}</div>
        <div style="display:flex;gap:4px;margin-top:3px">${earned.slice(0,3).map(b=>`<span class="lb-badge-ico" title="${b.label}">${b.icon}</span>`).join('')}</div>
      </div>
      <div style="text-align:right"><div class="lb-pts-big">${u.pts}</div><span class="lb-pts-unit">pts</span></div>`;
    tbl.appendChild(row);
  });
}

/* ═══════════════════════════════════════════════════════════
   PROFILE
═══════════════════════════════════════════════════════════ */
async function renderProfile() {
  if(activeProfile) {
    try {
      const u=await apiGet(API.users,{action:'profile',name:activeProfile});
      renderProfileFor(u);
    } catch(err){showToast(err.message,'error');gotoPage('feed');}
    return;
  }
  if(!currentUser){gotoPage('login');return;}
  document.querySelector('.prof-actions-col')&&(document.querySelector('.prof-actions-col').style.display='');
  try {
    const u=await apiGet(API.users,{action:'profile',name:currentUser.name});
    currentUser.pts=u.pts; currentUser.q_count=u.q_count; currentUser.a_count=u.a_count; currentUser.best_ans=u.best_ans;
    updatePillPts(); renderProfileFor(u);
  } catch(_){renderProfileFor(currentUser);}
}

function renderProfileFor(u) {
  const pts=parseInt(u.pts)||0, xp=getXPProgress(pts), title=getUserTitle(pts);
  const badge=u.active_badge?BADGES_DEF.find(b=>b.id===u.active_badge):null;
  const uname=u.full_name||u.name;
  const uinit=u.init||initials(uname);

  setText('prof-av',     uinit);
  setText('prof-name',   uname+(badge?' '+badge.icon:''));
  setText('prof-role-txt',u.role==='farmer'?'Agriculture Practitioner':'Agriculture Student');

  const tb=$('prof-title-badge');
  if(tb){tb.textContent=`${title.icon} ${title.label}`;tb.style.background=title.bg;tb.style.color=title.color;}

  const circle=$('xp-circle');
  if(circle){const c=2*Math.PI*44;circle.style.strokeDashoffset=c*(1-xp.pct/100);circle.style.stroke=title.color;const track=document.querySelector('.xp-track');if(track)track.style.stroke=title.bg;}
  const fill=$('prof-xp-fill');if(fill)fill.style.width=xp.pct+'%';
  setText('xp-cur',pts); setText('xp-next',xp.nextTitle?.minPts||pts);

  const myQ=u.questions||[], myA=u.answers||[];
  const bestA=myA.filter(a=>a.best_answer), totVotes=myA.reduce((s,a)=>s+(a.votes||0),0);
  setText('ps-pts',pts); setText('ps-q',myQ.length); setText('ps-a',myA.length); setText('ps-best',bestA.length); setText('ps-votes',totVotes);

  const cover=$('prof-cover');
  if(cover) cover.style.background=`linear-gradient(135deg, ${title.color}cc, ${title.color}55)`;

  const isOwn=!activeProfile||(currentUser&&currentUser.name===uname);
  const grid=$('badges-grid');
  if(grid) {
    grid.innerHTML=BADGES_DEF.map(b=>{
      const earned=b.check(u), isEquipped=earned&&u.active_badge===b.id;
      return `<div class="badge-cell${earned?' badge-earned':' badge-locked'}${isEquipped?' badge-equipped':''}" title="${b.desc}">
        <div class="badge-ico-wrap">${earned?b.icon:'🔒'}</div>
        <span class="badge-cell-label">${b.label}</span>
        <span class="badge-cell-desc">${b.desc}</span>
        ${earned&&isOwn?`<button class="badge-equip-btn${isEquipped?' equipped':''}" onclick="event.stopPropagation();equipBadge('${b.id}')" title="${isEquipped?'Currently displayed':'Show next to your name'}">${isEquipped?'✓ Displayed':'Display'}</button>`:''}
      </div>`;
    }).join('');
  }

  const ladder=$('prof-title-ladder');
  if(ladder){
    const curI=TITLES_DEF.indexOf(title), next=curI<TITLES_DEF.length-1?TITLES_DEF[curI+1]:null;
    let html=`<div class="ptl-row ptl-current">
      <div class="ptl-icon" style="background:${title.bg};border-color:${title.color}">${title.icon}</div>
      <div class="ptl-info"><span class="ptl-name" style="color:${title.color}">${title.label}</span><span class="ptl-req">${pts} pts — current title</span></div>
      <span class="ptl-cur-badge">Current</span>
    </div>`;
    if(next){
      html+=`<div class="ptl-divider"><span>Next title</span></div>
      <div class="ptl-row ptl-next">
        <div class="ptl-icon ptl-icon-next" style="background:${next.bg};border-color:${next.color}">${next.icon}</div>
        <div class="ptl-info"><span class="ptl-name" style="color:${next.color}">${next.label}</span><span class="ptl-req">${next.minPts} pts required — ${next.minPts-pts} pts to go</span></div>
        ${isOwn?`<div class="ptl-progress-mini"><div class="ptl-bar-mini"><div class="ptl-fill-mini" style="width:${xp.pct}%;background:${next.color}"></div></div><span class="ptl-pct">${xp.pct}%</span></div>`:''}
      </div>`;
    } else html+=`<div class="ptl-divider"><span>Maximum title reached 🏆</span></div>`;
    ladder.innerHTML=html;
  }

  const aqEl=$('act-questions');
  if(aqEl) aqEl.innerHTML=myQ.length?myQ.map(q=>`<div class="act-q-item" onclick="openQuestion(${q.id})" style="cursor:pointer"><div class="act-q-title">${esc(q.title)}</div><div class="act-q-meta">${q.answer_count||0} answer${q.answer_count!=1?'s':''} · ${ago(q.created_at)} · ⭐ ${q.bounty} pts</div></div>`).join(''):'<p style="color:var(--n400);font-size:.85rem;padding:16px 0">No questions posted yet.</p>';
  const aaEl=$('act-answers');
  if(aaEl) aaEl.innerHTML=myA.length?myA.map(a=>`<div class="act-a-item" onclick="openQuestion(${a.question_id})" style="cursor:pointer"><div class="act-q-title">${esc(a.text.slice(0,90))}…</div><div class="act-q-meta">On: "${esc((a.question_title||'').slice(0,55))}" · ${ago(a.created_at)}</div></div>`).join(''):'<p style="color:var(--n400);font-size:.85rem;padding:16px 0">No answers posted yet.</p>';

  if($('ob2'))$('ob2').classList.toggle('done',true);
  if($('ob3'))$('ob3').classList.toggle('done',myQ.length>0);
  if($('ob4'))$('ob4').classList.toggle('done',myA.length>0);
  if(!isOwn){const ac=document.querySelector('.prof-actions-col');if(ac)ac.style.display='none';}
}

function switchActTab(tab,btn) {
  document.querySelectorAll('.act-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  $('act-questions').style.display=tab==='questions'?'':'none';
  $('act-answers').style.display=tab==='answers'?'':'none';
}

async function equipBadge(badgeId) {
  if(!currentUser) return;
  try {
    const res=await apiPost(API.users,{action:'equip_badge',badge_id:badgeId});
    currentUser.active_badge=res.active_badge; showToast(res.message,'success'); renderProfile();
  } catch(err){showToast(err.message,'error');}
}

/* ═══════════════════════════════════════════════════════════
   REPORTS
═══════════════════════════════════════════════════════════ */
async function reportItem(id,type) {
  if(!currentUser){showToast('Please sign in to report content.','error');return;}
  const reason=prompt('Why are you reporting this? (spam / inappropriate / off-topic / other)');
  if(!reason) return;
  try { await apiPost(API.questions,{action:'report',id,reason}); showToast('Report submitted. Thank you for keeping the community safe. 🛡️','info'); }
  catch(err){showToast(err.message,'error');}
}

async function reportAnswer(qId,aId) {
  if(!currentUser){showToast('Please sign in to report.','error');return;}
  const reason=prompt('Why are you reporting this answer?\n\nOptions: irrelevant / spam / offensive / wrong information / other');
  if(!reason?.trim()) return;
  try {
    await apiPost(API.answers,{action:'report',question_id:qId,answer_id:aId,reason});
    showToast('Answer reported. An admin will review it — no points are changed yet.','info');
    const q=await apiGet(API.questions,{action:'get',id:qId}); renderQuestionDetail(q);
  } catch(err){showToast(err.message,'error');}
}

/* ═══════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════ */
function switchAuth(type) {
  const isLogin=type==='login';
  $('f-login').style.display=isLogin?'':'none'; $('f-reg').style.display=isLogin?'none':'';
  $('at-in').classList.toggle('active',isLogin); $('at-reg').classList.toggle('active',!isLogin);
  $('at-slider').classList.toggle('right',!isLogin);
}

async function doLogin(e) {
  e.preventDefault();
  const username=$('lu').value.trim(), password=$('lp').value;
  if(!username||!password){showToast('Please fill in all fields.','error');return;}
  try {
    const u=await apiPost(API.auth,{action:'login',username,password});
    applySession(u); pushNotif(`👋 Welcome back, ${u.full_name||u.name}!`,'info');
    showToast(`Welcome, ${u.full_name||u.name}! 🌱`,'success');
    await loadLeaderboardCache(); gotoPage('feed');
  } catch(err){showToast(err.message||'Login failed.','error');}
}

async function doRegister(e) {
  e.preventDefault();
  const full_name=$('rn').value.trim(), username=$('ru').value.trim(), password=$('rp').value;
  const role=document.querySelector('input[name="rr"]:checked')?.value||'student';
  if(!full_name||!username||!password){showToast('Please fill in all fields.','error');return;}
  if(full_name.length<2){showToast('Full name must be at least 2 characters.','error');return;}
  if(username.length<3){showToast('Username must be at least 3 characters.','error');return;}
  if(password.length<6){showToast('Password must be at least 6 characters.','error');return;}
  try {
    const u=await apiPost(API.auth,{action:'register',full_name,username,password,role});
    applySession(u); pushNotif('👋 Welcome to AgriHibalo! Start by browsing or asking a question.','info');
    showToast(`Welcome, ${u.full_name||u.name}! 🌱`,'success');
    await loadLeaderboardCache(); gotoPage('feed');
  } catch(err){showToast(err.message||'Registration failed.','error');}
}

async function signOut() {
  try { await apiPost(API.auth,{action:'logout'}); } catch(_){}
  currentUser=null; notifications=[];
  $('user-pill').style.display='none'; $('btn-signin').style.display='flex';
  $('btn-admin').style.display='none'; $('notif-btn').style.display='none';
  $('notif-badge').style.display='none';
  window.location.href='index.html';
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════════════════════ */
function pushNotif(text,type='info') { notifications.unshift({text,type,ts:new Date(),read:false}); updateNotifBadge(); }
function updateNotifBadge() { const unread=notifications.filter(n=>!n.read).length, badge=$('notif-badge'); if(badge){badge.textContent=unread;badge.style.display=unread>0?'flex':'none';} }
function toggleNotif() { const panel=$('notif-panel'),overlay=$('notif-overlay'); const open=panel.classList.toggle('open'); overlay.classList.toggle('open',open); panel.setAttribute('aria-hidden',String(!open)); if(open)renderNotifList(); }
function closeNotif() { $('notif-panel').classList.remove('open'); $('notif-overlay').classList.remove('open'); }
function renderNotifList() {
  const list=$('notif-list'); if(!list) return;
  if(!notifications.length){list.innerHTML='<div class="notif-empty">No notifications yet.</div>';return;}
  list.innerHTML=notifications.slice(0,15).map(n=>`<div class="notif-item${n.read?'':' unread'}"><span class="ni-ico">${n.type==='answer'?'💬':n.type==='badge'?'🏅':n.type==='success'?'✅':'🔔'}</span><div class="ni-body"><div class="ni-txt">${esc(n.text)}</div><div class="ni-time">${ago(n.ts)}</div></div><div class="ni-dot"></div></div>`).join('');
  notifications.forEach(n=>n.read=true); updateNotifBadge();
}
function clearNotifs() { notifications=[]; updateNotifBadge(); renderNotifList(); }

/* ═══════════════════════════════════════════════════════════
   ADMIN DASHBOARD
═══════════════════════════════════════════════════════════ */
async function renderAdmin() {
  if(currentUser?.role!=='admin'){showToast('Admin access required.','error');gotoPage('feed');return;}
  await Promise.all([renderAdminOverview(),renderAdminQTable(),renderAdminUTable(),renderAdminReports(),renderAdminLog()]);
  updateReportBadge();
}
function switchAdminTab(tab,btn) {
  document.querySelectorAll('.adm-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.adm-lnk').forEach(b=>b.classList.remove('active'));
  $(`admt-${tab}`)?.classList.add('active'); btn.classList.add('active');
}
async function adminLogout() {
  try{await apiPost(API.auth,{action:'logout'});}catch(_){}
  currentUser=null; $('user-pill').style.display='none'; $('btn-signin').style.display='flex';
  $('btn-admin').style.display='none'; $('notif-btn').style.display='none';
  showToast('Logged out of admin panel.','info'); gotoPage('feed');
}

async function renderAdminOverview() {
  let allQ=[],allU=[];
  try{allQ=await apiGet(API.questions,{action:'list',domain:'all',sort:'newest'});}catch(_){}
  try{allU=await apiGet(API.users,{action:'leaderboard'});}catch(_){}
  const totalA=allQ.reduce((s,q)=>s+(parseInt(q.answer_count)||0),0);
  const flagged=allQ.filter(q=>q.reported).length;
  const sc=$('adm-stats');if(!sc)return;
  sc.innerHTML=[
    {ico:'sc-ico-q',val:allQ.length,lbl:'Total Questions',delta:`+${allQ.filter(q=>new Date(q.created_at)>new Date(Date.now()-7*864e5)).length} this week`,up:true},
    {ico:'sc-ico-a',val:totalA,lbl:'Total Answers',delta:`+${Math.round(totalA*.1)} this week`,up:true},
    {ico:'sc-ico-u',val:allU.filter(u=>!u.banned).length,lbl:'Active Members',delta:`Total: ${allU.length}`,up:true},
    {ico:'sc-ico-r',val:flagged,lbl:'Pending Reports',delta:`${flagged} flagged posts`,up:false},
  ].map(c=>`<div class="sc"><div class="sc-ico ${c.ico}"></div><div class="sc-val">${c.val}</div><div class="sc-lbl">${c.lbl}</div><div class="sc-delta ${c.up?'up':'dn'}">${c.delta}</div></div>`).join('');
  const rq=$('adm-recent-q');if(rq)rq.innerHTML=allQ.slice(0,5).map(q=>`<div class="adm-q-row"><strong>${esc(q.title.slice(0,50))}…</strong>${DOMAINS[q.domain]?.label||''} · ${q.answer_count||0} answers · ${ago(q.created_at)}</div>`).join('');
  drawDonut(allQ);
}

function drawDonut(allQ=[]) {
  const canvas=$('donut-canvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const farmC=allQ.filter(q=>q.domain==='farm').length, animC=allQ.filter(q=>q.domain==='animal').length;
  const total=farmC+animC||1;
  const data=[{v:farmC,c:'#0f7436',l:'🌾 Farming'},{v:animC,c:'#f59e0b',l:'🐄 Animal Science'}];
  const cx=90,cy=90,R=72,r=44;let angle=-Math.PI/2;
  ctx.clearRect(0,0,180,180);
  data.forEach(d=>{if(!d.v)return;const arc=(d.v/total)*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,angle,angle+arc);ctx.closePath();ctx.fillStyle=d.c;ctx.fill();angle+=arc;});
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#f8fafb';ctx.fill();
  ctx.fillStyle='#374151';ctx.font='bold 14px Plus Jakarta Sans,sans-serif';ctx.textAlign='center';ctx.fillText(total,cx,cy+5);
  const leg=$('donut-legend');if(leg)leg.innerHTML=data.map(d=>`<div class="dl-item"><div class="dl-dot" style="background:${d.c}"></div>${d.l} (${d.v})</div>`).join('');
}

async function renderAdminQTable(filter='') {
  const tbody=$('adm-q-body');if(!tbody)return;
  let list=[];try{list=await apiGet(API.questions,{action:'list',domain:'all',sort:'newest'});}catch(_){}
  if(filter)list=list.filter(q=>q.title.toLowerCase().includes(filter.toLowerCase()));
  tbody.innerHTML=list.map(q=>`<tr>
    <td style="max-width:260px"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.title)}</div><div style="font-size:.72rem;color:var(--n400)">${(q.tags||[]).map(t=>'#'+t).join(' ')}</div></td>
    <td>${DOMAINS[q.domain]?.label||q.domain}</td><td>${esc(q.author)}</td><td>${q.answer_count||0}</td>
    <td><span class="status-pill ${q.hidden?'sp-hidden':q.reported?'sp-flagged':'sp-active'}">${q.hidden?'Hidden':q.reported?'Flagged':'Active'}</span></td>
    <td>
      <button class="adm-act-btn adm-hide" onclick="adminToggleQ(${q.id})">${q.hidden?'Restore':'Hide'}</button>
      <button class="adm-act-btn adm-del"  onclick="adminDelQ(${q.id})">Delete</button>
      ${q.reported?`<button class="adm-act-btn adm-restore" onclick="adminClearReport(${q.id})">Clear Flag</button>`:''}
    </td></tr>`).join('');
}
function adminSearchQ(v){renderAdminQTable(v);}
async function adminToggleQ(id){try{const r=await apiPost(API.questions,{action:'toggle_hide',id});showToast(r.hidden?'Question hidden.':'Question restored.','info');renderAdminQTable();loadFeed();}catch(err){showToast(err.message,'error');}}
async function adminDelQ(id){if(!confirm('Delete this question permanently?'))return;try{await apiPost(API.questions,{action:'delete',id});showToast('Question deleted.','info');renderAdminQTable();loadFeed();}catch(err){showToast(err.message,'error');}}
async function adminClearReport(id){try{await apiPost(API.questions,{action:'clear_report',id});showToast('Report cleared.','success');renderAdminQTable();updateReportBadge();}catch(err){showToast(err.message,'error');}}

async function renderAdminUTable(filter='') {
  const tbody=$('adm-u-body');if(!tbody)return;
  let list=[];try{list=await apiGet(API.users,{action:'leaderboard'});}catch(_){}
  if(filter)list=list.filter(u=>u.name.toLowerCase().includes(filter.toLowerCase()));
  tbody.innerHTML=list.map(u=>`<tr>
    <td><div style="display:flex;align-items:center;gap:8px"><div class="lb-av" style="width:28px;height:28px;font-size:.65rem">${esc(u.init)}</div><strong>${esc(u.name)}</strong></div></td>
    <td>${u.role==='farmer'?'👨‍🌾 Farmer':'🎓 Student'}</td>
    <td>${u.q_count||0}</td><td>${u.a_count||0}</td><td>${u.pts}</td>
    <td><span class="adm-title-pill">${getUserTitle(u.pts).icon} ${getUserTitle(u.pts).label}</span></td>
    <td><span class="status-pill ${u.banned?'sp-banned':'sp-active'}">${u.banned?'Banned':'Active'}</span></td>
    <td><button class="adm-act-btn adm-ban" onclick="adminToggleBan(${u.id})">${u.banned?'Unban':'Ban'}</button></td>
  </tr>`).join('');
}
function adminSearchU(v){renderAdminUTable(v);}
async function adminToggleBan(userId){try{const r=await apiPost(API.users,{action:'ban',user_id:userId});showToast(r.message,'info');renderAdminUTable();renderLeaderboard();renderSidebarLB();}catch(err){showToast(err.message,'error');}}

async function renderAdminReports() {
  const list=$('adm-reports-list');if(!list)return;
  let allQ=[];try{allQ=await apiGet(API.questions,{action:'list',domain:'all',sort:'newest'});}catch(_){}
  const flagged=allQ.filter(q=>q.reported&&!q.hidden);
  if(!flagged.length){list.innerHTML='<div style="text-align:center;padding:40px;color:var(--n400)">No pending reports. The community is clean!</div>';return;}
  list.innerHTML=flagged.map(q=>`<div class="rep-item">
    <div class="rep-head"><span class="rep-type">⚑ Question</span></div>
    <div class="rep-q">${esc(q.title)}</div>
    <div class="rep-actions">
      <button class="adm-act-btn adm-hide"    onclick="adminToggleQ(${q.id})">Hide Question</button>
      <button class="adm-act-btn adm-del"     onclick="adminDelQ(${q.id})">Delete Question</button>
      <button class="adm-act-btn adm-restore" onclick="adminClearReport(${q.id})">Dismiss</button>
    </div>
  </div>`).join('');
}

function updateReportBadge() { const b=$('report-badge'); if(b) b.textContent=questions.filter(q=>q.reported).length; }

async function renderAdminLog() {
  const log=$('act-log');if(!log)return;
  log.innerHTML='<div class="al-row"><div class="al-txt" style="color:var(--n500);padding:12px">Activity log will appear here once the database is connected.</div></div>';
}

async function adminResolveAnswer(reportId,action) {
  try {
    const res=await apiPost(API.answers,{action:'resolve_report',report_id:reportId,decision:action});
    showToast(res.message||'Done.',action==='approve'?'success':'info');
    renderAdminReports(); renderAdminUTable(); updateReportBadge();
  } catch(err){showToast(err.message,'error');}
}

/* ═══════════════════════════════════════════════════════════
   IMAGE UPLOAD
═══════════════════════════════════════════════════════════ */
function previewImg(e) {
  const f=e.target.files?.[0];if(!f)return;
  if(f.size>5*1024*1024){showToast('Image must be under 5 MB.','error');return;}
  const r=new FileReader();
  r.onload=ev=>{const p=$('img-prev'),idle=$('up-idle'),rm=$('rm-img'),z=$('upz');p.src=ev.target.result;p.style.display='block';idle.style.display='none';if(rm)rm.style.display='inline-flex';if(z)z.style.borderColor='var(--g)';};
  r.readAsDataURL(f);
}
function rmImg(){const p=$('img-prev'),idle=$('up-idle'),rm=$('rm-img'),inp=$('qimg'),z=$('upz');if(p){p.src='';p.style.display='none';}if(idle)idle.style.display='';if(rm)rm.style.display='none';if(inp)inp.value='';if(z)z.style.borderColor='';}
function bootDragDrop(){const z=$('upz');if(!z)return;['dragenter','dragover'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.style.borderColor='var(--g)';}));['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.style.borderColor='';}));z.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f&&f.type.startsWith('image/'))previewImg({target:{files:[f]}});});}
function bootCharCount(){const ta=$('qb'),ct=$('cct');if(!ta||!ct)return;ta.addEventListener('input',()=>{const n=ta.value.length;ct.textContent=`${n} / 1000`;ct.style.color=n>900?'#dc2626':'';});}
function toggleEye(id,btn){const inp=$(id),eo=btn.querySelector('.eo'),ec=btn.querySelector('.ec');const isP=inp.type==='password';inp.type=isP?'text':'password';if(eo)eo.style.display=isP?'none':'';if(ec)ec.style.display=isP?'':'none';}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
function showToast(msg,type='info'){const t=$('toast');if(!t)return;if(toastTimer)clearTimeout(toastTimer);t.textContent=msg;t.className=`toast t-${type} show`;toastTimer=setTimeout(()=>t.classList.remove('show'),3500);}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function $(id){return document.getElementById(id);}
function setText(id,v){const e=$(id);if(e)e.textContent=v;}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=String(s);return d.innerHTML;}
function initials(n){return n?.trim().split(/\s+/).map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||'AN';}
function ago(d){const s=Math.floor((Date.now()-new Date(d))/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;}
function shake(el){el.animate([{transform:'translateX(0)'},{transform:'translateX(-7px)'},{transform:'translateX(7px)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:320,easing:'ease-in-out'});el.style.borderColor='#dc2626';el.addEventListener('input',()=>el.style.borderColor='',{once:true});}
function animNum(id,target){const el=$(id);if(!el)return;const start=parseInt(el.textContent)||0;if(start===target)return;let t=0;const timer=setInterval(()=>{t+=16;const p=Math.min(t/600,1);el.textContent=Math.round(start+(target-start)*(1-Math.pow(1-p,3)));if(p>=1)clearInterval(timer);},16);}

/* Fix syntax error in applySession — remove stray assignment */
(function patchApplySession(){
  // applySession was written with a typo: currentUser=$id={...}
  // Redefine it cleanly here
  window.applySession=function(u){
    const name=u.full_name||u.name;
    const init_val=u.init||initials(name);
    currentUser={...u,name,init:init_val};
    $('user-pill').style.display='flex';
    setText('pill-av',init_val); setText('pill-name',name);
    $('btn-signin').style.display='none'; $('notif-btn').style.display='flex';
    if(currentUser.role==='admin')$('btn-admin').style.display='flex';
    updatePillPts();
  };
})();
