/* MuseNex — 启动 */
(async function () {
  const P = window.PRCYQ;
  const capi = window.musenex;

  // 先注册文件打开回调，避免冷启动消息丢失
  const pendingOpen = [];
  try {
    capi.onOpenPath((p) => {
      if (!p) return;
      if (P.uiReady) P.handleOpenPath(p);
      else pendingOpen.push(p);
    });
  } catch {}

  try {
    P.appInfo = await capi.app.info();
  } catch { P.appInfo = { userData: '' }; }

  let saved = {};
  try { saved = await capi.settings.get(); } catch { saved = {}; }

  P.init(saved || {});

  P.initRender();
  P.initInteract();
  await P.initUI();
  P.uiReady = true;

  // 启动逻辑
  let recovered = false;
  try { recovered = await P.checkRecovery(); } catch (e) { console.warn(e); }

  if (!recovered) {
    const last = P.settings.lastScene;
    const autoOpen = P.settings.autoOpenLast;
    if (autoOpen && last) {
      try {
        const st = await capi.fs.stat(last);
        if (st && st.ok) {
          await P.loadSceneFromPath(last);
        }
      } catch (e) { console.warn('打开上次场景失败', e); }
    }
  }

  for (const p of pendingOpen) { try { await P.handleOpenPath(p); } catch (e) { console.warn(e); } }
  P.renderAll();
  P.refreshChrome();
  if (S_hasItems()) P.fitAll();
  P.scheduleAutosave();
  P.log('启动完成');

  function S_hasItems() { return P.S.items.length > 0; }

  // 兜底：未捕获错误提示
  window.addEventListener('error', (e) => {
    P.log('错误：' + (e.message || e.error));
  });
})();
