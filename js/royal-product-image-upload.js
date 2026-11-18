/* Product photo upload to Supabase Storage (admin-only RLS).
 * Keep external URLs supported for existing products.
 */
(function () {
  'use strict';
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MIME_TYPES = ['image/jpeg','image/png','image/webp'];

  window.previewRoyalProductUploads = function(input) {
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
      const url = URL.createObjectURL(file);
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Prévia: ' + file.name;
      img.onload = () => URL.revokeObjectURL(url);
      img.onerror = () => URL.revokeObjectURL(url);
      preview.appendChild(img);
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