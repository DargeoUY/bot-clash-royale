'use strict';
let session, registering = false, clanTag = '';
const $ = id => document.getElementById(id);
const notice = message => { $('notice').textContent = message; };
async function api(url, method = 'GET', body) {
  const response = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', 'x-csrf-token': session?.csrf || '' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar.');
  return data;
}
const clanUrl = suffix => '/clans/' + encodeURIComponent(clanTag) + suffix;
function formData(form) { return Object.fromEntries(new FormData(form)); }
function bindForm(id, fn) {
  $(id).addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; notice('');
    try { await fn(event.currentTarget); } catch (error) { notice(error.message); } finally { button.disabled = false; }
  });
}
function action(id, fn) { $(id).addEventListener('click', async () => { try { await fn(); } catch (error) { notice(error.message); } }); }
function selectAuth(mode) {
  registering = mode; $('nameLabel').hidden = !mode; $('registration').hidden = !mode;
  $('authSubmit').textContent = mode ? 'Crear cuenta' : 'Ingresar';
  $('registerTab').classList.toggle('active', mode); $('loginTab').classList.toggle('active', !mode);
  $('authForm').elements.password.autocomplete = mode ? 'new-password' : 'current-password';
}
action('loginTab', () => selectAuth(false)); action('registerTab', () => selectAuth(true));
bindForm('authForm', async form => { await api(registering ? '/register' : '/login', 'POST', formData(form)); form.reset(); await refreshSession(); });
action('logout', async () => { await api('/logout', 'POST', {}); location.reload(); });
async function refreshSession() {
  session = await api('/session');
  $('auth').hidden = !!session.user; $('workspace').hidden = !session.user; $('logout').hidden = !session.user;
  if (!session.user) return;
  $('clanSelect').replaceChildren();
  for (const clan of session.clans) {
    const option = document.createElement('option'); option.value = clan.tag; option.textContent = clan.name + ' · ' + clan.tag; $('clanSelect').append(option);
  }
  clanTag = session.clans.some(c => c.tag === clanTag) ? clanTag : session.clans[0]?.tag || '';
  $('clanSelect').value = clanTag;
  if (clanTag) await loadClan(); else showTab('newClan');
}
async function loadClan() {
  const clan = session.clans.find(c => c.tag === clanTag); const admin = clan.role === 'admin';
  document.querySelectorAll('[data-admin]').forEach(e => { e.hidden = !admin; });
  $('clanName').textContent = clan.name;
  const data = await api(clanUrl('/overview'));
  $('memberCount').textContent = data.players.length + ' / 50'; $('fame').textContent = (data.war?.fame || 0).toLocaleString('es-UY');
  $('players').replaceChildren();
  for (const player of data.players) {
    const tr = document.createElement('tr');
    for (const value of [player.nombre, player.tag, player.rol || 'miembro', player.trofeos || 0]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    $('players').append(tr);
  }
  if (!data.players.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4; td.textContent = 'Todavía no hay datos. Ejecutá /sync desde Consultas y acciones.'; tr.append(td); $('players').append(tr); }
  for (const key of ['discordEnabled', 'telegramEnabled', 'whatsappEnabled']) $('channelForm').elements[key].checked = data.clan[key];
  $('channelForm').elements.whatsappGroup.value = data.clan.whatsappGroup || '';
  $('export').href = '/api' + clanUrl('/export');
  $('waQR').hidden = true; $('waGroups').replaceChildren();
  showTab('overview');
}
$('clanSelect').addEventListener('change', async () => { clanTag = $('clanSelect').value; try { await loadClan(); } catch (e) { notice(e.message); } });
function showTab(id) {
  document.querySelectorAll('.panel').forEach(e => { e.hidden = e.id !== id; });
  document.querySelectorAll('#nav button').forEach(e => e.classList.toggle('active', e.dataset.tab === id));
}
$('nav').addEventListener('click', async event => {
  const id = event.target.dataset.tab; if (!id) return; showTab(id);
  try {
    if (id === 'audit') {
      const rows = await api(clanUrl('/audit')); $('auditList').replaceChildren();
      for (const row of rows) { const p = document.createElement('p'); p.textContent = new Date(row.createdAt).toLocaleString('es-UY') + ' · ' + row.action + ' · ' + row.detail; $('auditList').append(p); }
      if (!rows.length) $('auditList').textContent = 'No hay actividad registrada.';
    }
    if (id === 'access') await loadAccess();
  } catch (error) { notice(error.message); }
});
async function command(text) { $('commandResult').textContent = 'Consultando…'; const result = await api(clanUrl('/command'), 'POST', { command: text }); $('commandResult').textContent = result.text; }
bindForm('commandForm', form => command($('commandInput').value));
$('quickCommands').addEventListener('click', async event => { if (event.target.dataset.command) { $('commandInput').value = event.target.dataset.command; try { await command(event.target.dataset.command); } catch (e) { notice(e.message); $('commandResult').textContent = 'No se pudo completar la consulta.'; } } });
bindForm('channelForm', async form => {
  const body = formData(form); for (const key of ['discordEnabled', 'telegramEnabled', 'whatsappEnabled']) body[key] = form.elements[key].checked;
  await api(clanUrl('/channels'), 'PATCH', body); form.elements.telegramCode.value = ''; notice('Canales guardados.');
});
async function refreshWA() {
  const result = await api(clanUrl('/whatsapp')); $('waState').textContent = ({ connected: 'Conectado', connecting: 'Conectando…', qr: 'Escaneá el QR desde Dispositivos vinculados en WhatsApp.', disconnected: 'Desconectado' })[result.state];
  $('waQR').hidden = !result.qr; if (result.qr) $('waQR').src = result.qr;
  $('waGroups').replaceChildren();
  if (result.state === 'connected') {
    const groups = await api(clanUrl('/whatsapp/groups'));
    for (const group of groups) { const button = document.createElement('button'); button.textContent = group.name; button.addEventListener('click', () => { $('channelForm').elements.whatsappGroup.value = group.id; notice('Grupo seleccionado. Guardá los canales para confirmar.'); }); $('waGroups').append(button); }
  }
}
action('connectWA', async () => { await api(clanUrl('/whatsapp/connect'), 'POST', {}); notice('Conexión iniciada. Pulsá Ver estado / QR en unos segundos.'); await refreshWA(); });
action('refreshWA', refreshWA);
action('disconnectWA', async () => { await api(clanUrl('/whatsapp'), 'DELETE', {}); await refreshWA(); });
bindForm('linkPlayer', async form => { await api(clanUrl('/link-player'), 'POST', formData(form)); notice('Jugador vinculado.'); form.reset(); });
bindForm('inviteForm', async form => { const result = await api(clanUrl('/invite'), 'POST', formData(form)); $('inviteResult').textContent = 'Invitación de un solo uso (24 horas):\n' + result.token; });
async function loadAccess() {
  const rows = await api(clanUrl('/access')); $('accessList').replaceChildren();
  for (const row of rows) {
    const div = document.createElement('div'); div.className = 'access-row'; const span = document.createElement('span');
    span.textContent = row.account.name + ' · ' + row.account.email + ' · ' + row.role + (row.playerTag ? ' · ' + row.playerTag : '');
    const button = document.createElement('button'); button.textContent = 'Revocar'; button.addEventListener('click', async () => { try { await api(clanUrl('/access/' + row.id), 'DELETE', {}); await loadAccess(); } catch (error) { notice(error.message); } });
    div.append(span, button); $('accessList').append(div);
  }
}
bindForm('newClanForm', async form => { await api('/clans', 'POST', formData(form)); form.reset(); await refreshSession(); notice('Clan agregado.'); });
refreshSession().catch(error => notice(error.message));

action('discordCode', async () => { const result = await api(clanUrl('/discord-code'), 'POST', {}); $('discordCodeResult').hidden = false; $('discordCodeResult').textContent = 'Pegá este código en /auto-setup (vence en 10 minutos):\n' + result.token; });
