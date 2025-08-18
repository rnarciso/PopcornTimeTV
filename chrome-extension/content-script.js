// This script now only handles the communication between the popup and the library.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "activateTelemedAssistant") {
    if (window.ClinicalFormAssistant) {
      const targetFormId = message.targetFormId || 'formPreencher';
      
      // 1. Save current form state
      window.ClinicalFormAssistant.originalFormData = window.ClinicalFormAssistant.extractFormData(targetFormId);
      console.log("Original form data saved:", window.ClinicalFormAssistant.originalFormData);

      // 2. Extract text from the page
      const pageText = document.body.innerText;

      // 3. Get AI-generated JSON and populate the form
      window.ClinicalFormAssistant.getJsonFromLlm(pageText)
          .then(aiGeneratedData => {
              if (aiGeneratedData) {
                window.ClinicalFormAssistant.populateForm(targetFormId, aiGeneratedData);
                console.log("Form populated with AI data.");
              }
          })
          .catch(error => {
              console.error("Error during AI form filling:", error);
              alert(`Erro ao preencher formulário: ${error.message}`);
          });
    }
  } else if (message.action === "undoFormFilling") {
    if (window.ClinicalFormAssistant && window.ClinicalFormAssistant.originalFormData) {
      const targetFormId = message.targetFormId || 'formPreencher';
      window.ClinicalFormAssistant.populateForm(targetFormId, window.ClinicalFormAssistant.originalFormData);
      console.log("Form restored to original state.");
      window.ClinicalFormAssistant.originalFormData = null; // Clear saved state after undo
    } else {
      alert("Nenhum estado anterior do formulário para restaurar.");
    }
  }
});