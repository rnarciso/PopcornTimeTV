document.getElementById('activateButton').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content-script.js']
    }, () => {
      // Send a message to the content script to trigger the form filling action
      chrome.tabs.sendMessage(tabs[0].id, { action: "activateTelemedAssistant", targetFormId: "formPreencher" });
      window.close(); // Close the popup after activation
    });
  });
});