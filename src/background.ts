// Background Service Worker
// Listen for extension icon clicks to toggle sidebar if needed, 
// though mostly we rely on the in-page button.

chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
    }
});
