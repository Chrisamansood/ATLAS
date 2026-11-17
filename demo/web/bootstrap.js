(() => {
  const base = new URL('./', document.currentScript.src);
  const originalFetch = window.fetch.bind(window);
  let unblock, fail;
  const controlled = new Promise((resolve, reject) => { unblock = resolve; fail = reject; });
  controlled.catch(() => {});
  window.fetch = async (input, init) => { await controlled; return originalFetch(input, init); };
  const showError = () => {
    const box = document.createElement('div'); box.textContent = 'ATLAS needs browser storage to run this demo. Enable it for this site, then reload.';
    box.style.cssText = 'position:fixed;inset:0 0 auto;z-index:2147483647;background:#502020;color:white;padding:20px'; document.body.append(box);
  };
  const start = async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers unavailable');
    await navigator.serviceWorker.register(new URL('service-worker.mjs', base), {type:'module', scope:base.pathname});
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
      location.reload(); return;
    }
    unblock();
  };
  start().catch(error => { fail(error); document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', showError) : showError(); });
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.createElement('div'); label.textContent = 'SYNTHETIC DEMO · SAVED IN THIS BROWSER';
    label.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483001;background:#151b19e8;color:#9ab5aa;padding:5px 10px;font:10px ui-monospace,monospace;pointer-events:none'; document.body.append(label);
  });
})();
