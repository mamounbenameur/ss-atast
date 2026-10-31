// ATAST Student Section - application logic.
// Firebase Auth (event manager login) + Realtime Database (events, club board and members).
import { FIREBASE_CONFIG, CLUBS, EVENT_CATEGORIES, STUDENT_BOARD } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
  reauthenticateWithCredential, EmailAuthProvider,
  indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, set, get, push, remove, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/* ------------------------------------------------------------------ setup */
const app = initializeApp(FIREBASE_CONFIG);
const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
});
const db = getDatabase(app);

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clubById = id => CLUBS.find(c => c.id === id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const prettyDate = s => { const [y, m, d] = s.split('-').map(Number); return d + ' ' + MONTHS[m - 1].slice(0, 3) + ' ' + y; };
const sortedKeys = o => Object.keys(o || {}).sort();

/* ------------------------------------------------------------------ state */
let session = null;                 // { email, clubId } for a signed-in event manager, else null
let events = {};                    // { 'YYYY-MM-DD': {clubId,title,...} }  one per date
let clubData = {};                  // { clubId: { board:{id:{name,role}}, members:{id:{name,role}} } }
let month = new Date(); month.setDate(1);
let dbError = '';

function clubForEmail(email) {
  const e = (email || '').trim().toLowerCase();
  return e ? CLUBS.find(c => (c.managerEmail || '').trim().toLowerCase() === e) || null : null;
}
const isMine = clubId => !!session && session.clubId === clubId;

/* ------------------------------------------------------------------ messages */
function authErrorText(e) {
  switch (e && e.code) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.';
    case 'auth/invalid-email': return 'That email address is not valid.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes or reset your password.';
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    case 'auth/user-disabled': return 'This account has been disabled.';
    default: return 'Sign-in failed (' + ((e && (e.code || e.message)) || 'unknown error') + ').';
  }
}
function dbErrorText(e) {
  const c = e && e.code;
  if (c === 'PERMISSION_DENIED' || /permission/i.test(e && e.message || ''))
    return 'Not saved. This date may have just been taken by another club, or the database rules do not allow this change.';
  if (c === 'db/timeout') return 'The database did not answer in time. Check your connection and try again.';
  return 'Not saved (' + ((e && (e.code || e.message)) || 'unknown error') + ').';
}
function toast(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
}
const withLimit = p => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'db/timeout' }), 12000))]);

/* ------------------------------------------------------------------ modal */
function openModal(html, onMount) {
  closeModal();
  const root = $('#modalRoot');
  root.innerHTML = '<div class="back"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
  const back = $('.back', root);
  back.addEventListener('mousedown', ev => { if (ev.target === back) closeModal(); });
  document.addEventListener('keydown', escClose);
  if (onMount) onMount($('.modal', root));
}
function escClose(ev) { if (ev.key === 'Escape') closeModal(); }
function closeModal() { $('#modalRoot').innerHTML = ''; document.removeEventListener('keydown', escClose); }
function showMsg(box, text, kind) { box.innerHTML = text ? '<div class="msg ' + (kind || 'err') + '">' + text + '</div>' : ''; }

/**
 * Confirmation screen that asks for the manager's password again before a change is saved.
 * action() runs only after Firebase accepts the password. It must throw on failure.
 */
function confirmWithPassword({ title, summaryHtml, confirmText, danger, action, onBack }) {
  if (!session) return;
  openModal(`
    <h3>${esc(title)}</h3>
    <div class="summary">${summaryHtml}</div>
    <label for="cpPass">Enter the password of ${esc(session.email)} to confirm</label>
    <input id="cpPass" type="password" autocomplete="current-password">
    <div id="cpMsg"></div>
    <div class="acts">
      <button class="btn ghost" id="cpCancel">${onBack ? 'Back' : 'Cancel'}</button>
      <button class="btn ${danger ? 'danger' : ''}" id="cpOk">${esc(confirmText)}</button>
    </div>`, m => {
    const pass = $('#cpPass', m), msg = $('#cpMsg', m), ok = $('#cpOk', m);
    pass.focus();
    $('#cpCancel', m).onclick = () => { closeModal(); if (onBack) onBack(); };
    const go = async () => {
      if (!pass.value) { showMsg(msg, 'Enter your password.'); return; }
      ok.disabled = true; showMsg(msg, '');
      const user = auth.currentUser;
      if (!user) { ok.disabled = false; showMsg(msg, 'You are signed out. Sign in again.'); return; }
      try {
        await withLimit(reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pass.value)));
      } catch (e) {
        ok.disabled = false; showMsg(msg, authErrorText(e)); return;
      }
      try {
        await action();
        closeModal();
      } catch (e) {
        ok.disabled = false; showMsg(msg, dbErrorText(e));
      }
    };
    ok.onclick = go;
    pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
  });
}

/* ------------------------------------------------------------------ login */
function openLogin() {
  openModal(`
    <h3>Event manager sign in</h3>
    <p class="sub">Only the event manager of a club can add or delete that club's events and people.</p>
    <label for="lgEmail">Email</label><input id="lgEmail" type="email" autocomplete="username">
    <label for="lgPass">Password</label><input id="lgPass" type="password" autocomplete="current-password">
    <div id="lgMsg"></div>
    <div class="acts" style="justify-content:space-between">
      <button class="btn ghost small" id="lgForgot">Forgot password?</button>
      <span><button class="btn ghost" id="lgCancel">Cancel</button> <button class="btn" id="lgOk">Sign in</button></span>
    </div>`, m => {
    const email = $('#lgEmail', m), pass = $('#lgPass', m), msg = $('#lgMsg', m), ok = $('#lgOk', m);
    email.focus();
    $('#lgCancel', m).onclick = closeModal;
    $('#lgForgot', m).onclick = () => openReset(email.value.trim());
    const go = async () => {
      if (!email.value.trim() || !pass.value) { showMsg(msg, 'Enter your email and password.'); return; }
      ok.disabled = true; ok.textContent = 'Signing in…'; showMsg(msg, '');
      try {
        const cred = await withLimit(signInWithEmailAndPassword(auth, email.value.trim(), pass.value));
        const club = clubForEmail(cred.user.email);
        if (!club) {
          await signOut(auth).catch(() => {});
          ok.disabled = false; ok.textContent = 'Sign in';
          showMsg(msg, 'This account is not registered as an event manager for any club.');
          return;
        }
        closeModal();
        location.hash = '#club/' + club.id;
      } catch (e) {
        ok.disabled = false; ok.textContent = 'Sign in'; showMsg(msg, authErrorText(e));
      }
    };
    ok.onclick = go;
    [email, pass].forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); }));
  });
}
function openReset(prefill) {
  openModal(`
    <h3>Reset your password</h3>
    <p class="sub">We will email you a link to choose a new password.</p>
    <label for="rsEmail">Email</label><input id="rsEmail" type="email" value="${esc(prefill || '')}">
    <div id="rsMsg"></div>
    <div class="acts"><button class="btn ghost" id="rsBack">Back</button><button class="btn" id="rsOk">Send reset link</button></div>`, m => {
    const email = $('#rsEmail', m), msg = $('#rsMsg', m), ok = $('#rsOk', m);
    $('#rsBack', m).onclick = openLogin;
    ok.onclick = async () => {
      if (!email.value.trim()) { showMsg(msg, 'Enter your email.'); return; }
      ok.disabled = true;
      try {
        await sendPasswordResetEmail(auth, email.value.trim());
        showMsg(msg, 'If this email has an account, a reset link is on its way. Check your inbox and spam folder.', 'ok');
      } catch (e) {
        ok.disabled = false;
        showMsg(msg, e && e.code === 'auth/invalid-email' ? 'That email address is not valid.' : 'Could not send the email. Try again later.');
      }
    };
  });
}

/* ------------------------------------------------------------------ events: add / view / delete */
const CATEGORY_OPTIONS = EVENT_CATEGORIES.map(c => '<option>' + esc(c) + '</option>').join('');

function openAddEvent(prefillDate) {
  if (!session) { openLogin(); return; }
  const club = clubById(session.clubId);
  openModal(`
    <h3>Add an event for ${esc(club.name)}</h3>
    <label for="aeTitle">Title</label><input id="aeTitle" maxlength="120">
    <label for="aeDate">Date</label><input id="aeDate" type="date" min="${today()}" value="${esc(prefillDate || '')}">
    <div id="aeAvail" style="font-size:13px;margin-top:4px"></div>
    <label for="aeCat">Category</label><select id="aeCat">${CATEGORY_OPTIONS}</select>
    <label for="aeLoc">Location (optional)</label><input id="aeLoc" maxlength="120">
    <label for="aeDesc">Description (optional)</label><textarea id="aeDesc" maxlength="300"></textarea>
    <div id="aeMsg"></div>
    <div class="acts"><button class="btn ghost" id="aeCancel">Cancel</button><button class="btn" id="aeNext">Review</button></div>`, m => {
    const title = $('#aeTitle', m), date = $('#aeDate', m), avail = $('#aeAvail', m), msg = $('#aeMsg', m);
    const check = () => {
      const d = date.value;
      if (!d) { avail.textContent = ''; return true; }
      const taken = events[d];
      if (taken) {
        avail.style.color = 'var(--danger)';
        avail.textContent = 'Not available: ' + clubById(taken.clubId)?.name + ' already has "' + taken.title + '" on ' + prettyDate(d) + '. Only one event per day.';
        return false;
      }
      avail.style.color = 'var(--ok)'; avail.textContent = 'This date is available.'; return true;
    };
    date.addEventListener('input', check); check();
    $('#aeCancel', m).onclick = closeModal;
    $('#aeNext', m).onclick = async () => {
      showMsg(msg, '');
      const rec = {
        kind: 'event', clubId: session.clubId, title: title.value.trim(), date: date.value,
        category: $('#aeCat', m).value, location: $('#aeLoc', m).value.trim(), desc: $('#aeDesc', m).value.trim(),
        createdBy: session.email, createdAt: Date.now()
      };
      if (!rec.title) { showMsg(msg, 'Enter a title.'); return; }
      if (!rec.date) { showMsg(msg, 'Pick a date.'); return; }
      if (rec.date < today()) { showMsg(msg, 'Pick a date that is today or later.'); return; }
      // Re-check against the live database right now, not just the copy in this page.
      try {
        const snap = await withLimit(get(ref(db, 'event/' + rec.date)));
        if (snap.exists()) { events[rec.date] = snap.val(); check(); showMsg(msg, 'That date was just taken. Choose another day.'); return; }
      } catch (e) { showMsg(msg, dbErrorText(e)); return; }
      confirmWithPassword({
        title: 'Confirm new event',
        summaryHtml: `<b>${esc(rec.title)}</b><br>${esc(prettyDate(rec.date))} · ${esc(rec.category)}<br>${esc(club.name)}${rec.location ? '<br>' + esc(rec.location) : ''}`,
        confirmText: 'Add event',
        onBack: () => openAddEvent(rec.date),
        action: async () => { await withLimit(set(ref(db, 'event/' + rec.date), rec)); toast('Event added'); }
      });
    };
  });
}

function openEventDetail(date) {
  const e = events[date]; if (!e) return;
  const club = clubById(e.clubId);
  openModal(`
    <h3>${esc(e.title)}</h3>
    <p class="sub"><span class="dot" style="background:${club ? club.color : '#999'}"></span>${esc(club ? club.name : 'Unknown club')}</p>
    <div class="summary">${esc(prettyDate(date))}${e.category ? ' · ' + esc(e.category) : ''}${e.location ? '<br>' + esc(e.location) : ''}${e.desc ? '<br><br>' + esc(e.desc) : ''}</div>
    <div class="acts">${isMine(e.clubId) ? '<button class="btn danger" id="edDel">Delete event</button>' : ''}<button class="btn ghost" id="edClose">Close</button></div>`, m => {
    $('#edClose', m).onclick = closeModal;
    const del = $('#edDel', m);
    if (del) del.onclick = () => confirmWithPassword({
      title: 'Delete this event?', danger: true, confirmText: 'Delete event',
      summaryHtml: `<b>${esc(e.title)}</b><br>${esc(prettyDate(date))}<br>This cannot be undone.`,
      action: async () => { await withLimit(remove(ref(db, 'event/' + date))); toast('Event deleted'); }
    });
  });
}

/* ------------------------------------------------------------------ club board / members: add / delete */
function openAddPerson(listName) {            // listName: 'board' | 'members'
  if (!session) return;
  const isBoard = listName === 'board';
  openModal(`
    <h3>Add ${isBoard ? 'a board member' : 'a member'}</h3>
    <label for="apName">Full name</label><input id="apName" maxlength="80">
    <label for="apRole">${isBoard ? 'Role (President, Treasurer…)' : 'Field / class (optional)'}</label><input id="apRole" maxlength="60">
    <div id="apMsg"></div>
    <div class="acts"><button class="btn ghost" id="apCancel">Cancel</button><button class="btn" id="apNext">Review</button></div>`, m => {
    $('#apName', m).focus();
    $('#apCancel', m).onclick = closeModal;
    $('#apNext', m).onclick = () => {
      const name = $('#apName', m).value.trim(), role = $('#apRole', m).value.trim();
      if (!name) { showMsg($('#apMsg', m), 'Enter a name.'); return; }
      if (isBoard && !role) { showMsg($('#apMsg', m), 'Enter the role.'); return; }
      confirmWithPassword({
        title: 'Confirm', confirmText: 'Add',
        summaryHtml: `Add <b>${esc(name)}</b>${role ? ' (' + esc(role) + ')' : ''} to the ${isBoard ? 'board' : 'members'} of ${esc(clubById(session.clubId).name)}.`,
        onBack: () => openAddPerson(listName),
        action: async () => {
          const r = push(ref(db, 'clubs/' + session.clubId + '/' + listName));
          await withLimit(set(r, { name, role }));
          toast('Added');
        }
      });
    };
  });
}
function askDeletePerson(clubId, listName, id) {
  const p = (((clubData[clubId] || {})[listName]) || {})[id]; if (!p) return;
  confirmWithPassword({
    title: 'Remove this person?', danger: true, confirmText: 'Remove',
    summaryHtml: `Remove <b>${esc(p.name)}</b>${p.role ? ' (' + esc(p.role) + ')' : ''} from the ${listName === 'board' ? 'board' : 'members'}.`,
    action: async () => { await withLimit(remove(ref(db, 'clubs/' + clubId + '/' + listName + '/' + id))); toast('Removed'); }
  });
}

/* ------------------------------------------------------------------ views */
function eventRow(date) {
  const e = events[date], c = clubById(e.clubId);
  return `<div class="ev"><div class="bar" style="background:${c ? c.color : '#999'}"></div>
    <div class="when">${esc(prettyDate(date))}</div>
    <div><div><b>${esc(e.title)}</b> ${e.category ? '<span class="pill">' + esc(e.category) + '</span>' : ''}</div>
    <div class="meta">${esc(c ? c.name : '')}${e.location ? ' · ' + esc(e.location) : ''}</div></div></div>`;
}
function viewHome() {
  const up = sortedKeys(events).filter(d => d >= today()).slice(0, 6);
  return `
    <div class="hero" style="background-image:url(images/student-board.jpg)"><div><h1>ATAST Student Section</h1><p style="margin:0">Events, clubs and student board in one place.</p></div></div>
    <h2>Upcoming events</h2>
    <div class="card">${up.length ? up.map(eventRow).join('') : '<div class="empty">No upcoming events yet.</div>'}</div>
    <p><a href="#calendar">Open the full calendar</a></p>
    <h2>Student Section board</h2>
    <div class="grid">${STUDENT_BOARD.map(m => `<div class="card board-m"><b>${esc(m.name)}</b><div class="role">${esc(m.role)}</div><a href="tel:${esc(m.phone.replace(/\s/g, ''))}">${esc(m.phone)}</a></div>`).join('')}</div>`;
}
function viewCalendar() {
  const y = month.getFullYear(), mo = month.getMonth();
  const first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
  const t = today();
  let cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div class="cell out"></div>';
  for (let d = 1; d <= days; d++) {
    const key = y + '-' + pad(mo + 1) + '-' + pad(d), e = events[key];
    const free = !e, can = free && session && key >= t;
    cells += `<div class="cell ${key === t ? 'today' : ''} ${free ? 'free' : ''} ${can ? 'can' : ''}" data-day="${key}" ${can ? 'title="Add an event on this day"' : ''}>
      <span class="n">${d}</span>
      ${e ? `<button class="chip" data-open="${key}" style="background:${(clubById(e.clubId) || {}).color || '#999'}">${esc(e.title)}</button>` : ''}</div>`;
  }
  const list = sortedKeys(events).filter(k => k.startsWith(y + '-' + pad(mo + 1)));
  return `
    <h1>Calendar</h1>
    <p class="sub">${session ? 'Click an empty day to add an event for ' + esc(clubById(session.clubId).name) + '. One event per day for the whole section.' : 'Everyone can see the events. Event managers sign in to add events for their club.'}</p>
    <div class="cal-head"><h2>${MONTHS[mo]} ${y}</h2>
      <button class="btn ghost small" id="prevM">‹ Prev</button><button class="btn ghost small" id="todayM">Today</button><button class="btn ghost small" id="nextM">Next ›</button>
      ${session ? '<button class="btn small" id="addEv">+ Add event</button>' : ''}</div>
    <div class="cal">${cells}</div>
    <div class="legend">${CLUBS.map(c => `<span><span class="dot" style="background:${c.color}"></span>${esc(c.name.replace('ATAST Club ', ''))}</span>`).join('')}</div>
    <h2>This month</h2><div class="card">${list.length ? list.map(eventRow).join('') : '<div class="empty">No events this month.</div>'}</div>`;
}
function viewClubs() {
  return `<h1>Clubs</h1><p class="sub">Nine clubs, each with its own board and members.</p>
    <div class="grid">${CLUBS.map(c => {
      const d = clubData[c.id] || {}, nM = Object.keys(d.members || {}).length;
      return `<a class="card club-card" href="#club/${c.id}" style="border-top:4px solid ${c.color}"><h3>${esc(c.name)}</h3>
        <div class="sub" style="margin:4px 0 0">${nM} member${nM === 1 ? '' : 's'}</div></a>`;
    }).join('')}</div>`;
}
function peopleList(clubId, listName, empty) {
  const items = (clubData[clubId] || {})[listName] || {};
  const ids = Object.keys(items).sort((a, b) => (items[a].name || '').localeCompare(items[b].name || ''));
  if (!ids.length) return '<div class="empty">' + empty + '</div>';
  return ids.map(id => `<div class="row"><div><b>${esc(items[id].name)}</b>${items[id].role ? '<div class="r">' + esc(items[id].role) + '</div>' : ''}</div>
    ${isMine(clubId) ? `<button class="btn danger small" data-delp="${listName}|${id}">Remove</button>` : ''}</div>`).join('');
}
function viewClub(id) {
  const c = clubById(id);
  if (!c) return '<h1>Club not found</h1><p><a href="#clubs">Back to clubs</a></p>';
  const mine = isMine(id);
  const evs = sortedKeys(events).filter(k => events[k].clubId === id && k >= today());
  return `
    <p><a href="#clubs">‹ All clubs</a></p>
    <h1><span class="dot" style="background:${c.color};width:16px;height:16px"></span>${esc(c.name)}</h1>
    <p class="sub">${c.managerName ? 'Event manager: ' + esc(c.managerName) : 'No event manager registered yet.'}${mine ? ' · <span class="pill">You manage this club</span>' : ''}</p>
    <div class="cols">
      <div class="card"><div class="row" style="border:0;padding-top:0"><h3>Board</h3>${mine ? '<button class="btn small" id="addBoard">+ Add</button>' : ''}</div>${peopleList(id, 'board', 'No board members listed yet.')}</div>
      <div class="card"><div class="row" style="border:0;padding-top:0"><h3>Members</h3>${mine ? '<button class="btn small" id="addMember">+ Add</button>' : ''}</div>${peopleList(id, 'members', 'No members listed yet.')}</div>
    </div>
    <h2>Upcoming events of this club</h2>
    <div class="card">${evs.length ? evs.map(k => eventRow(k) + (mine ? `<div style="text-align:right"><button class="btn danger small" data-delev="${k}">Delete</button></div>` : '')).join('') : '<div class="empty">No upcoming events.</div>'}</div>
    ${mine ? '<p><button class="btn" id="addEv">+ Add event</button></p>' : ''}`;
}

/* ------------------------------------------------------------------ router / render */
function route() {
  const h = (location.hash || '#home').slice(1).split('/');
  return { name: h[0] || 'home', param: h[1] };
}
function render() {
  const r = route();
  const view = $('#view');
  const html = r.name === 'calendar' ? viewCalendar() : r.name === 'clubs' ? viewClubs() : r.name === 'club' ? viewClub(r.param) : viewHome();
  view.innerHTML = (dbError ? '<div class="msg err" style="margin-bottom:12px">' + esc(dbError) + '</div>' : '') + html;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.route === (r.name === 'club' ? 'clubs' : r.name)));
  bindView(r);
  renderAuthBox();
}
function bindView(r) {
  const view = $('#view');
  const on = (sel, fn) => view.querySelectorAll(sel).forEach(el => el.addEventListener('click', ev => fn(el, ev)));
  on('[data-open]', (el, ev) => { ev.stopPropagation(); openEventDetail(el.dataset.open); });
  on('.cell.can', el => openAddEvent(el.dataset.day));
  on('[data-delp]', el => { const [l, id] = el.dataset.delp.split('|'); askDeletePerson(r.param, l, id); });
  on('[data-delev]', el => { openEventDetail(el.dataset.delev); });
  const bind = (id, fn) => { const b = view.querySelector(id); if (b) b.onclick = fn; };
  bind('#addEv', () => openAddEvent());
  bind('#addBoard', () => openAddPerson('board'));
  bind('#addMember', () => openAddPerson('members'));
  bind('#prevM', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); });
  bind('#nextM', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); });
  bind('#todayM', () => { month = new Date(); month.setDate(1); render(); });
}
function renderAuthBox() {
  const box = $('#authBox');
  if (session) {
    const c = clubById(session.clubId);
    box.innerHTML = `<a href="#club/${c.id}">${esc(c.name.replace('ATAST Club ', ''))} manager</a><button class="btn ghost small" id="outBtn">Sign out</button>`;
    $('#outBtn').onclick = () => signOut(auth);
  } else {
    box.innerHTML = '<button class="btn small" id="inBtn">Event manager sign in</button>';
    $('#inBtn').onclick = openLogin;
  }
}

/* ------------------------------------------------------------------ live data + auth */
window.addEventListener('hashchange', render);

onValue(ref(db, 'event'), snap => {
  const raw = snap.val() || {}, clean = {};
  Object.keys(raw).forEach(k => {      // ignore anything that is not a dated record of a known club
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && raw[k] && clubById(raw[k].clubId) && raw[k].title) clean[k] = raw[k];
  });
  events = clean; dbError = ''; render();
}, e => { dbError = 'Events could not be loaded (' + (e.code || e.message) + '). Check the database rules and your connection.'; render(); });

onValue(ref(db, 'clubs'), snap => { clubData = snap.val() || {}; render(); }, () => {});

onAuthStateChanged(auth, user => {
  const club = user ? clubForEmail(user.email) : null;
  if (user && !club) { signOut(auth).catch(() => {}); session = null; }
  else session = club ? { email: user.email, clubId: club.id } : null;
  render();
});

render();
