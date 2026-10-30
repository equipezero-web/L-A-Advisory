// Loads the Royal AI product-image uploader without changing the main application bundle.
(() => {
  const script = document.createElement('script');
  script.src = './js/royal-ai-image-upload.js?v=1';
  script.defer = true;
  document.head.appendChild(script);
})();
