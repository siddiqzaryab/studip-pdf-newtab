(() => {
  "use strict";

  // ---- Is this page Stud.IP? (the script does nothing on other sites) ----
  function detectStudip() {
    return (
      /dispatch\.php|sendfile\.php/i.test(location.pathname) ||
      /studip/i.test(location.hostname) ||
      !!document.querySelector(
        'script[src*="studip" i], link[href*="studip" i], #layout_content, #layout-sidebar'
      )
    );
  }
  if (!detectStudip()) return;

  // ---- Helpers ----
  const PDF_RE = /\.pdf(?:$|[?&#/])/i;
  const DOWNLOAD_RE = /sendfile\.php|\/file\/download|\/download\//i;
  const recentlyOpened = new Map(); // url -> timestamp, avoids double tabs
  const handledEmbeds = new WeakSet();

  function toUrl(raw) {
    try {
      return new URL(raw, location.href);
    } catch {
      return null;
    }
  }

  function isPdfUrl(raw) {
    const u = toUrl(raw);
    if (!u || !/^https?:$/.test(u.protocol)) return false;
    let s = u.pathname + u.search;
    try {
      s = decodeURIComponent(s);
    } catch {}
    return PDF_RE.test(s);
  }

  function isPdfLink(a) {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return false;
    if (isPdfUrl(href)) return true;
    // Link text/title ends in .pdf and the link points to a download URL
    const label = (a.textContent || "") + " " + (a.title || "");
    return /\.pdf\b/i.test(label) && DOWNLOAD_RE.test(a.href);
  }

  function openInNewTab(url) {
    const now = Date.now();
    if (now - (recentlyOpened.get(url) || 0) < 1500) return;
    recentlyOpened.set(url, now);
    try {
      chrome.runtime.sendMessage({ type: "open-pdf", url });
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }

  // ---- 1) Intercept clicks on PDF links before Stud.IP's dialog code runs ----
  document.addEventListener(
    "click",
    (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("download") || !isPdfLink(a)) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openInNewTab(a.href);
    },
    true // capture phase: runs before Stud.IP's own click handlers
  );

  // ---- 2) Safety net: if a popup with an embedded PDF still appears,
  //         move the PDF to a new tab and close the popup ----
  const DIALOG_SEL = ".ui-dialog, [role='dialog'], .studip-dialog";

  function checkNode(root) {
    if (!(root instanceof Element)) return;
    const embeds = root.matches("iframe, embed, object") ? [root] : [];
    embeds.push(...root.querySelectorAll("iframe, embed, object"));

    for (const el of embeds) {
      if (handledEmbeds.has(el)) continue;
      const src = el.getAttribute("src") || el.getAttribute("data") || "";
      const isPdfType = (el.getAttribute("type") || "").toLowerCase() === "application/pdf";
      if (!src || !(isPdfUrl(src) || isPdfType)) continue;

      const dialog = el.closest(DIALOG_SEL);
      if (!dialog) continue; // only act on popups, not normal embedded PDFs

      handledEmbeds.add(el);
      const url = toUrl(src);
      if (!url) continue;
      openInNewTab(url.href);
      const closeBtn = dialog.querySelector(".ui-dialog-titlebar-close, [data-dialog-close]");
      if (closeBtn) closeBtn.click();
    }
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes") checkNode(m.target);
      else m.addedNodes.forEach(checkNode);
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "data"],
  });
})();
