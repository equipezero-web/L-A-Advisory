/* L&A Royal Advisory — comunicação e solicitações de afiliados */
(() => {
  'use strict';
  const ENDPOINT = 'https://fqisewatypluagngmgka.supabase.co/functions/v1/affiliate-communication';
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selectedAffiliateId = '';
  let refreshTimer = null;

  async function getToken() {
    if (window.state?.currentUser?.role === 'affiliate' && typeof affiliateSessionToken !== 'undefined' && affiliateSessionToken) return affiliateSessionToken;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      return data?.session?.access_token || '';
    }
    return '';
  }
  async function api(action, payload = {}) {
    const token = await getToken();
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const key = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + token, 'apikey':key },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  }
  function toast(message, isError = false) {
    if (typeof window.showSiteAlert === 'function') window.showSiteAlert(message);
    else if (typeof window.showAlert === 'function') window.showAlert(message);
    else alert(message);
  }
  function isAffiliate() {
    const user = window.state?.currentUser;
    if (user?.role !== 'affiliate') return false;
    const affiliates = Array.isArray(window.state?.affiliates) ? window.state.affiliates : [];
    const affiliate = affiliates.find(a => String(a.id) === String(user.id) || String(a.userId) === String(user.id));
    return user.affiliateStatus === 'active' || affiliate?.status === 'active';
  }
  function isAdmin() {
    // A visibilidade do botão é apenas interface; a Edge Function valida a sessão
    // e a função administrativa no servidor antes de permitir qualquer operação.
    return window.state?.currentUser?.role === 'admin';
  }
  function ensureStyles() {
    if ($('laAffiliateCommunicationStyles')) return;
    const style = document.createElement('style');
    style.id = 'laAffiliateCommunicationStyles';
    style.textContent = `
      #laAffiliateMessageFab{position:fixed;right:22px;bottom:24px;z-index:100020;width:58px;height:58px;border:0;border-radius:9999px;background:#16a34a;color:#fff;box-shadow:0 10px 30px #0003;display:none;align-items:center;justify-content:center;cursor:pointer}
      #laAffiliateMessageFab:hover{background:#15803d;transform:translateY(-2px)}
      #laAffiliateMessageFab svg{width:27px;height:27px}
      #laAffiliateCommunicationModal{position:fixed;inset:0;z-index:100030;background:#020617b8;display:none;align-items:center;justify-content:center;padding:14px}
      #laAffiliateCommunicationModal.open{display:flex}
      #laAffiliateCommunicationModal .la-comm-panel{width:min(100%,760px);max-height:90dvh;overflow:auto;background:#0c1933;color:#fff;border:1px solid #d4af3766;border-radius:18px;box-shadow:0 25px 80px #0008;padding:20px}
      #laAffiliateCommunicationModal input,#laAffiliateCommunicationModal textarea{width:100%;border:1px solid #64748b;background:#07101f;color:#fff;border-radius:10px;padding:10px;margin-top:5px}
      .la-comm-btn{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}
      .la-comm-gold{background:#d4af37;color:#07101f}.la-comm-green{background:#16a34a;color:white}.la-comm-muted{background:#334155;color:white}
      .la-comm-list{display:flex;flex-direction:column;gap:8px}.la-comm-person{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:10px;border:1px solid #334155;border-radius:12px;background:#111f38;color:#fff;cursor:pointer}
      .la-comm-person img,.la-comm-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#d4af37;color:#07101f;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0}
      .la-comm-bubble{max-width:88%;padding:10px 12px;border-radius:14px;margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}
      .la-comm-bubble.affiliate{background:#1e293b;margin-right:auto}.la-comm-bubble.admin{background:#14532d;margin-left:auto}
      .la-comm-small{font-size:12px;color:#cbd5e1}.la-comm-section{border:1px solid #d4af374d;border-radius:12px;padding:12px;margin-top:12px}
      @media(max-width:640px){#laAffiliateMessageFab{right:15px;bottom:18px;width:54px;height:54px}#laAffiliateCommunicationModal .la-comm-panel{padding:14px;max-height:94dvh}}
    `;
    document.head.appendChild(style);
  }
  function ensureModal() {
    if ($('laAffiliateCommunicationModal')) return;
    const modal = document.createElement('div');
    modal.id = 'laAffiliateCommunicationModal';
    modal.innerHTML = `<section class="la-comm-panel" role="dialog" aria-modal="true" aria-labelledby="laCommTitle">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
        <h2 id="laCommTitle" style="font-size:22px;font-weight:800">Mensagens</h2>
        <button type="button" id="laCommClose" class="la-comm-btn la-comm-muted" aria-label="Fechar">✕</button>
      </div>
      <div id="laCommContent"></div>
    </section>`;
    document.body.appendChild(modal);
    $('laCommClose').onclick = closeModal;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  }
  function openModal(title, html) {
    ensureModal();
    $('laCommTitle').textContent = title;
    $('laCommContent').innerHTML = html;
    $('laAffiliateCommunicationModal').classList.add('open');
    document.body.dataset.laCommPreviousOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('laAffiliateCommunicationModal')?.classList.remove('open');
    document.body.style.overflow = document.body.dataset.laCommPreviousOverflow || '';
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }
  function formatDate(value) {
    try { return new Date(value).toLocaleString('pt-BR', {dateStyle:'short',timeStyle:'short'}); } catch { return ''; }
  }
  function profileChangeForm() {
    openModal('Solicitar alteração de dados', `
      <p class="la-comm-small" style="margin-bottom:12px">Preencha somente os campos que deseja alterar. A mudança só será aplicada após a aprovação do administrador. CPF e telefone também precisam de aprovação.</p>
      <form id="laCommProfileRequest" style="display:grid;gap:10px">
        <label>Nome completo<input name="name" maxlength="160" autocomplete="name"></label>
        <label>Instagram<input name="instagram" maxlength="200" placeholder="@seu perfil"></label>
        <label>Site<input name="website" maxlength="300" placeholder="https://"></label>
        <label>Número de telefone<input name="phone" maxlength="30" autocomplete="tel"></label>
        <label>CPF<input name="cpf" maxlength="14" inputmode="numeric"></label>
        <label>Tipo de chave Pix<input name="pix_type" maxlength="30" placeholder="CPF, e-mail, telefone ou aleatória"></label>
        <label>Chave Pix<input name="pix_key" maxlength="200"></label>
        <button class="la-comm-btn la-comm-gold" type="submit">Enviar para aprovação</button>
      </form>`);
    $('laCommProfileRequest').onsubmit = async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const changes = {};
      for (const key of ['name','instagram','website','phone','cpf','pix_type','pix_key']) {
        const value = String(form.get(key) || '').trim();
        if (value) changes[key] = value;
      }
      if (!Object.keys(changes).length) return toast('Preencha pelo menos um campo.', true);
      try {
        await api('request_profile_change', { changes });
        toast('Solicitação enviada. Aguarde a análise do administrador.');
        closeModal();
      } catch (err) { toast(err.message, true); }
    };
  }
  async function openAffiliateChat() {
    openModal('Fale com o administrador', '<p>Carregando conversa…</p>');
    try {
      const result = await api('list_messages');
      renderAffiliateMessages(result.messages || []);
    } catch (err) {
      $('laCommContent').innerHTML = '<p style="color:#fecaca"></p>'.replace('</p>', escapeHtml(err.message) + '</p>');
    }
  }
  function renderAffiliateMessages(messages) {
    $('laCommContent').innerHTML = `
      <div id="laCommMessages" style="max-height:52dvh;overflow:auto;padding:4px 2px">
        ${messages.length ? messages.map(m => `<div class="la-comm-bubble ${m.sender_role === 'admin' ? 'admin' : 'affiliate'}">${escapeHtml(m.message)}<div class="la-comm-small" style="margin-top:5px">${formatDate(m.created_at)} · ${m.sender_role === 'admin' ? 'Administrador' : 'Você'}</div></div>`).join('') : '<p class="la-comm-small">Ainda não há mensagens. Envie a primeira mensagem abaixo.</p>'}
      </div>
      <form id="laCommSendMessage" style="display:grid;gap:8px;margin-top:12px">
        <label>Mensagem<textarea name="message" rows="3" maxlength="4000" required placeholder="Escreva sua mensagem para o administrador…"></textarea></label>
        <button class="la-comm-btn la-comm-green" type="submit">Enviar mensagem</button>
      </form>`;
    const scroller = $('laCommMessages'); if (scroller) scroller.scrollTop = scroller.scrollHeight;
    $('laCommSendMessage').onsubmit = async e => {
      e.preventDefault();
      const input = e.currentTarget.elements.message;
      const message = input.value.trim();
      if (!message) return;
      input.disabled = true;
      try { await api('send_message', { message }); await openAffiliateChat(); }
      catch (err) { toast(err.message, true); input.disabled = false; }
    };
  }
  async function openAdminMessages() {
    openModal('Mensagens dos afiliados', '<p>Carregando afiliados ativos…</p>');
    try {
      const result = await api('admin_list_conversations');
      const affiliates = result.affiliates || [];
      $('laCommContent').innerHTML = `
        <div class="la-comm-section"><h3 style="font-weight:800;margin-bottom:10px">Conversas por afiliado ativo</h3>
          <div class="la-comm-list">${affiliates.length ? affiliates.map(a => `
            <button class="la-comm-person" type="button" data-affiliate-id="${escapeHtml(a.id)}">
              ${a.avatar_url ? `<img src="${escapeHtml(a.avatar_url)}" alt="Foto de ${escapeHtml(a.name)}">` : `<span class="la-comm-avatar">${escapeHtml((a.name || '?').slice(0,1).toUpperCase())}</span>`}
              <span style="min-width:0;flex:1"><strong style="display:block">${escapeHtml(a.name || 'Afiliado')}</strong><span class="la-comm-small">${escapeHtml(a.affiliate_email || '')}</span>${a.last_message ? `<span class="la-comm-small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.last_message.message)}</span>` : '<span class="la-comm-small" style="display:block">Sem mensagens</span>'}</span>
              ${a.unread_count ? `<span style="background:#16a34a;border-radius:999px;padding:3px 8px;font-size:12px">${a.unread_count}</span>` : ''}
            </button>`).join('') : '<p class="la-comm-small">Nenhum afiliado ativo encontrado.</p>'}</div>
        </div>
        <div class="la-comm-section"><h3 style="font-weight:800;margin-bottom:8px">Solicitações de alteração de dados</h3><div id="laCommRequests">Carregando solicitações…</div></div>`;
      document.querySelectorAll('[data-affiliate-id]').forEach(button => button.onclick = () => openAdminConversation(button.dataset.affiliateId, affiliates.find(a => String(a.id) === button.dataset.affiliateId)));
      await loadAdminRequests();
    } catch (err) { $('laCommContent').innerHTML = '<p style="color:#fecaca">' + escapeHtml(err.message) + '</p>'; }
  }
  async function loadAdminRequests() {
    const container = $('laCommRequests');
    if (!container) return;
    try {
      const result = await api('admin_list_profile_requests');
      const requests = result.requests || [];
      container.innerHTML = requests.length ? requests.map(r => `
        <article style="border-top:1px solid #334155;padding:12px 0">
          <strong>${escapeHtml(r.affiliate?.name || 'Afiliado')}</strong><div class="la-comm-small">${escapeHtml(r.affiliate?.affiliate_email || '')} · ${formatDate(r.requested_at)}</div>
          <div style="font-size:13px;margin:8px 0;overflow-wrap:anywhere">${Object.entries(r.proposed_changes || {}).map(([k,v]) => `<div><b>${escapeHtml(({name:'Nome',instagram:'Instagram',website:'Site',phone:'Telefone',cpf:'CPF',pix_type:'Tipo de Pix',pix_key:'Chave Pix'}[k] || k))}:</b> ${escapeHtml(v)}</div>`).join('')}</div>
          <label class="la-comm-small">Observação do administrador<textarea data-note-for="${escapeHtml(r.id)}" rows="2" maxlength="1000" placeholder="Opcional"></textarea></label>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="la-comm-btn la-comm-green" data-review-id="${escapeHtml(r.id)}" data-decision="approved">Aprovar</button><button class="la-comm-btn la-comm-muted" data-review-id="${escapeHtml(r.id)}" data-decision="rejected">Recusar</button></div>
        </article>`).join('') : '<p class="la-comm-small">Não há solicitações pendentes.</p>';
      container.querySelectorAll('[data-review-id]').forEach(button => button.onclick = async () => {
        const request_id = button.dataset.reviewId, decision = button.dataset.decision;
        button.disabled = true;
        try {
          await api('admin_review_profile_request', { request_id, decision, admin_note: container.querySelector('[data-note-for="' + request_id + '"]')?.value || '' });
          toast(decision === 'approved' ? 'Alteração aprovada e aplicada.' : 'Solicitação recusada.');
          await openAdminMessages();
        } catch (err) { toast(err.message, true); button.disabled = false; }
      });
    } catch (err) { container.textContent = err.message; }
  }
  async function openAdminConversation(affiliateId, affiliate) {
    selectedAffiliateId = affiliateId;
    openModal('Conversa com ' + (affiliate?.name || 'afiliado'), '<p>Carregando mensagens…</p>');
    try {
      const result = await api('list_messages', { affiliate_id: affiliateId });
      const messages = result.messages || [];
      $('laCommContent').innerHTML = `
        <button type="button" id="laCommBack" class="la-comm-btn la-comm-muted" style="margin-bottom:10px">← Lista de afiliados</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">${affiliate?.avatar_url ? `<img class="la-comm-avatar" src="${escapeHtml(affiliate.avatar_url)}" alt="">` : `<span class="la-comm-avatar">${escapeHtml((affiliate?.name || '?').slice(0,1).toUpperCase())}</span>`}<div><strong>${escapeHtml(affiliate?.name || 'Afiliado')}</strong><div class="la-comm-small">${escapeHtml(affiliate?.affiliate_email || '')}</div></div></div>
        <div id="laCommMessages" style="max-height:50dvh;overflow:auto;padding:4px 2px">${messages.length ? messages.map(m => `<div class="la-comm-bubble ${m.sender_role === 'admin' ? 'admin' : 'affiliate'}">${escapeHtml(m.message)}<div class="la-comm-small" style="margin-top:5px">${formatDate(m.created_at)} · ${m.sender_role === 'admin' ? 'Você' : 'Afiliado'}</div></div>`).join('') : '<p class="la-comm-small">Nenhuma mensagem enviada ainda.</p>'}</div>
        <form id="laCommAdminReply" style="display:grid;gap:8px;margin-top:12px"><label>Responder<textarea name="message" rows="3" maxlength="4000" required placeholder="Escreva sua resposta…"></textarea></label><button class="la-comm-btn la-comm-green" type="submit">Enviar resposta</button></form>`;
      $('laCommBack').onclick = openAdminMessages;
      const scroller = $('laCommMessages'); if (scroller) scroller.scrollTop = scroller.scrollHeight;
      $('laCommAdminReply').onsubmit = async e => {
        e.preventDefault();
        const input = e.currentTarget.elements.message, message = input.value.trim();
        if (!message) return;
        input.disabled = true;
        try { await api('admin_reply', { affiliate_id: selectedAffiliateId, message }); await openAdminConversation(selectedAffiliateId, affiliate); }
        catch (err) { toast(err.message, true); input.disabled = false; }
      };
    } catch (err) { $('laCommContent').innerHTML = '<p style="color:#fecaca">' + escapeHtml(err.message) + '</p>'; }
  }
  function addFloatingButton() {
    if (!$('laAffiliateMessageFab')) {
      const button = document.createElement('button');
      button.id = 'laAffiliateMessageFab';
      button.type = 'button';
      button.title = 'Enviar mensagem ao administrador';
      button.setAttribute('aria-label','Enviar mensagem ao administrador');
      button.innerHTML = '<i data-lucide="message-circle"></i>';
      button.onclick = openAffiliateChat;
      document.body.appendChild(button);
    }
    $('laAffiliateMessageFab').style.display = isAffiliate() ? 'flex' : 'none';
  }
  function addEntryButtons() {
    const adminModal = $('adminDashboardModal');
    if (adminModal && !adminModal.querySelector('#laAdminCommunicationEntry')) {
      const panel = adminModal.querySelector('.bg-white, .admin-dashboard-content, [class*="rounded"]') || adminModal.firstElementChild;
      const button = document.createElement('button');
      button.id = 'laAdminCommunicationEntry';
      button.type = 'button';
      button.className = 'la-comm-btn la-comm-green';
      button.style.cssText = 'position:sticky;top:0;z-index:5;margin:10px;box-shadow:0 4px 18px #0002';
      button.textContent = 'Mensagens e solicitações de afiliados';
      button.onclick = openAdminMessages;
      (panel || adminModal).prepend(button);
    }
    const affiliateModal = $('affiliateDashboardModal') || $('affiliateProfileModal');
    if (affiliateModal && !affiliateModal.querySelector('#laAffiliateChangeRequestEntry')) {
      const button = document.createElement('button');
      button.id = 'laAffiliateChangeRequestEntry';
      button.type = 'button';
      button.className = 'la-comm-btn la-comm-gold';
      button.style.cssText = 'display:block;margin:12px auto;max-width:100%';
      button.textContent = 'Solicitar alteração de dados';
      button.onclick = profileChangeForm;
      affiliateModal.appendChild(button);
    }
  }
  function apply() {
    ensureStyles();
    ensureModal();
    addFloatingButton();
    addEntryButtons();
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true }); else apply();
  // Observe somente a criação dos painéis relevantes. Observar todas as alterações
  // do site e executar apply() a cada mutação deixa a página pesada durante a renderização.
  const relevantModalIds = new Set(['adminDashboardModal', 'affiliateDashboardModal', 'affiliateProfileModal']);
  const modalObserver = new MutationObserver(records => {
    const relevantModalAdded = records.some(record => Array.from(record.addedNodes).some(node => {
      if (node.nodeType !== 1) return false;
      if (relevantModalIds.has(node.id)) return true;
      return Array.from(relevantModalIds).some(id => node.querySelector?.('#' + id));
    }));
    if (relevantModalAdded) apply();
  });
  modalObserver.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('pageshow', apply);
})();
