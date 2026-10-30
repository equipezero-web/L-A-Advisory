(() => {
  const BUCKET_FUNCTION = 'royal-ai-image-upload';
  const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const MAX_BYTES = 5 * 1024 * 1024;
  let selectedImageUrl = '';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function addPreview(url, name) {
    const messages = document.getElementById('royalAiChatMessages');
    if (!messages) return;
    const card = document.createElement('div');
    card.className = 'flex justify-end mt-3';
    card.innerHTML = `<div class="max-w-[82%] rounded-2xl border border-amber-400/30 bg-white p-3 shadow-sm"><img src="${escapeHtml(url)}" alt="Imagem enviada para a Royal AI" class="max-h-52 w-auto rounded-xl object-contain ml-auto"><p class="text-xs text-slate-500 mt-2">${escapeHtml(name)} · imagem pronta para usar no produto</p></div>`;
    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
  }

  async function upload(file) {
    if (!file || !ACCEPTED.has(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
    if (file.size > MAX_BYTES) throw new Error('A imagem deve ter no máximo 5 MB.');
    if (!window.supabaseClient) throw new Error('Supabase não está disponível.');

    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Faça login como administrador novamente.');

    const form = new FormData();
    form.append('file', file, file.name);
    const response = await fetch(`${window.SUPABASE_URL}/functions/v1/${BUCKET_FUNCTION}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: window.SUPABASE_ANON_KEY },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.url) throw new Error(result?.error || 'Não foi possível enviar a imagem.');
    selectedImageUrl = result.url;
    addPreview(result.url, file.name);
    const prompt = document.getElementById('royalAiPrompt');
    if (prompt) {
      const instruction = `Use esta imagem no produto: ${result.url}`;
      prompt.value = prompt.value.trim() ? `${prompt.value.trim()}\n${instruction}` : instruction;
      prompt.focus();
    }
    return result.url;
  }

  function install() {
    const prompt = document.getElementById('royalAiPrompt');
    const send = document.getElementById('royalAiSendButton');
    if (!prompt || !send || document.getElementById('royalAiImageButton')) return false;

    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'royalAiImageInput';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.className = 'hidden';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'royalAiImageButton';
    button.title = 'Enviar imagem do produto';
    button.setAttribute('aria-label', 'Enviar imagem do produto');
    button.className = 'self-end w-12 h-12 rounded-xl border border-amber-400/40 text-amber-600 bg-white hover:bg-amber-50 transition flex items-center justify-center';
    button.innerHTML = '<i data-lucide="image-plus" class="w-5 h-5"></i>';
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      button.disabled = true;
      button.innerHTML = '<span class="animate-pulse text-xs font-bold">...</span>';
      try { await upload(file); }
      catch (error) { window.showToast ? window.showToast(error.message, 'error') : alert(error.message); }
      finally {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="image-plus" class="w-5 h-5"></i>';
        input.value = '';
        if (window.lucide) window.lucide.createIcons();
      }
    });

    prompt.parentElement?.insertBefore(input, prompt);
    prompt.parentElement?.insertBefore(button, prompt);
    if (window.lucide) window.lucide.createIcons();
    return true;
  }

  const observer = new MutationObserver(() => install());
  window.addEventListener('DOMContentLoaded', () => {
    install();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.RoyalAiImageUpload = { upload, install, getSelectedUrl: () => selectedImageUrl };
})();
