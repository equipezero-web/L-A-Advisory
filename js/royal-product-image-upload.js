/* Product photo upload to Supabase Storage (admin-only RLS).
 * Keep external URLs supported for existing products.
 */
(function () {
  'use strict';
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MIME_TYPES = ['image/jpeg','image/png','image/webp'];

  window.previewRoyalProductUploads = async function(input) {
    const files = Array.from(input?.files || []);
    const preview = document.getElementById('royalProductUploadPreview');
    if (!preview) return;
    preview.replaceChildren();
    if (files.length > 6) {
      input.value = '';
      preview.textContent = 'Selecione no máximo 6 fotos por envio.';
      return;
    }
    for (const file of files) {
      if (!MIME_TYPES.includes(file.type) || file.size > MAX_FILE_BYTES || file.size === 0) {
        input.value = '';
        preview.replaceChildren();
        preview.textContent = 'Use apenas JPG, PNG ou WebP de até 5 MB por imagem.';
        return;
      }
      // Decode only a validated raster image and paint pixels to canvas.
      // Do not assign user-controlled blob URLs to HTML image elements.
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Prévia: ' + file.name);
      canvas.className = 'royal-upload-preview-canvas';
      const ctx = canvas.getContext('2d');
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const width = bitmap.width * scale, height = bitmap.height * scale;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(bitmap,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
        bitmap.close();
        preview.appendChild(canvas);
      } catch (_) {
        input.value = '';
        preview.replaceChildren();
        preview.textContent = 'Não foi possível ler a imagem. Escolha um JPG, PNG ou WebP válido.';
        return;
      }
    }
  };

  window.uploadRoyalProductImages = async function(files) {
    const selected = Array.from(files || []);
    if (!selected.length || selected.length > 6) throw new Error('Envie de 1 a 6 imagens.');
    if (state.currentUser?.role !== 'admin' || !supabaseAuthUser) throw new Error('Apenas administradores podem enviar imagens.');
    const uploaded = [];
    for (const file of selected) {
      if (!MIME_TYPES.includes(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) {
        throw new Error('Imagem inválida ou maior que 5 MB: ' + file.name);
      }
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const name = 'catalog/' + crypto.randomUUID() + '.' + extension;
      const {error} = await supabaseClient.storage.from('product-images')
        .upload(name,file,{contentType:file.type,cacheControl:'3600',upsert:false});
      if (error) throw new Error('Falha no upload: ' + error.message);
      const {data} = supabaseClient.storage.from('product-images').getPublicUrl(name);
      if (!data?.publicUrl) throw new Error('Imagem enviada sem URL pública.');
      uploaded.push(data.publicUrl);
    }
    return uploaded;
  };
})();