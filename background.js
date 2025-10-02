// background.js
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extensão 'Teste Unitário' instalada ou atualizada.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SAVE_RESULTS") {
        chrome.storage.local.set({ 
            lastTestResults: message.data,
            lastExport: new Date().toISOString()
        }, () => {
            sendResponse({ status: "ok" });
        });
        return true;
    } else if (message.type === "GET_RESULTS") {
        chrome.storage.local.get("lastTestResults", (res) => {
            sendResponse({ status: "ok", data: res.lastTestResults || [] });
        });
        return true;
    } else if (message.type === "EXPORT_DATA") {
        // Lidar com exportações via background se necessário
        handleExport(message.data, sendResponse);
        return true;
    }
});

// Função para lidar com exportações complexas
function handleExport(data, sendResponse) {
    // Aqui você pode adicionar lógica adicional para exportações
    // que requerem processamento em background
    sendResponse({ status: "export_handled", data: data });
}