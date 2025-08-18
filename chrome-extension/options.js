document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const aiPromptInput = document.getElementById('aiPrompt');
    const clinicalAlertsInput = document.getElementById('clinicalAlerts');
    const aiModelsInput = document.getElementById('aiModels');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['openRouterApiKey', 'aiPrompt', 'clinicalAlerts', 'aiModels'], (data) => {
        if (data.openRouterApiKey) {
            apiKeyInput.value = data.openRouterApiKey;
        }
        if (data.aiPrompt) {
            aiPromptInput.value = data.aiPrompt;
        }
        if (data.clinicalAlerts) {
            clinicalAlertsInput.checked = data.clinicalAlerts;
        }
        if (data.aiModels) {
            aiModelsInput.value = data.aiModels.join(',');
        }
    });

    // Save settings
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const aiPrompt = aiPromptInput.value.trim();
        const clinicalAlerts = clinicalAlertsInput.checked;
        const aiModels = aiModelsInput.value.trim().split(',').map(s => s.trim()).filter(Boolean);

        if (apiKey) {
            chrome.storage.local.set({
                openRouterApiKey: apiKey,
                aiPrompt: aiPrompt,
                clinicalAlerts: clinicalAlerts,
                aiModels: aiModels
            }, () => {
                statusDiv.textContent = 'Settings saved successfully!';
                statusDiv.className = 'success';
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            });
        } else {
            statusDiv.textContent = 'API Key cannot be empty.';
            statusDiv.className = 'error';
        }
    });
});