// Opens the PDF in a new foreground tab right next to the Stud.IP tab.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "open-pdf") return;
  if (typeof msg.url !== "string" || !/^https?:\/\//i.test(msg.url)) return;

  const options = { url: msg.url, active: true };
  if (sender.tab) {
    options.index = sender.tab.index + 1;
    options.openerTabId = sender.tab.id;
  }
  chrome.tabs.create(options);
});
