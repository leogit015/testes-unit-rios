// Variável global para armazenar os resultados atuais
let currentTestResults = null;

document.getElementById("runTests").addEventListener("click", async () => {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "<p>Executando testes na página ativa...</p>";

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: collectVisibleComponents
        });

        if (!res || !res.result || res.result.length === 0) {
            resultsDiv.innerHTML = "<p>Não foi possível extrair componentes visíveis da página.</p>";
            return;
        }

        const components = res.result;

        // --- Ortografia via LanguageTool ---
// Ajustado: não verificar campos sem rótulo
for (let comp of components) {
    for (let field of comp.fields) {
        if (field.type === "input" || field.type === "button") {
            // 🚨 Se for rótulo genérico, não roda ortografia
            if (/^sem texto/i.test(field.label) || /^Campo \d+$/i.test(field.label)) {
                field.tests.push({
                    test: "Acessibilidade",
                    result: "FAIL",
                    details: "Componente sem rótulo textual ou descrição acessível"
                });
                continue;
            }

            // Caso normal → roda ortografia
            try {
                const response = await fetch("https://api.languagetool.org/v2/check", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({ text: field.label, language: "pt-BR" })
                });
                const result = await response.json();
                const incorrectWords = result.matches.map(m => m.context.text).filter(w => w.trim() !== "");
                field.tests.push({
                    test: "Ortografia",
                    result: incorrectWords.length > 0 ? "FAIL" : "PASS",
                    details: incorrectWords.length > 0 ? "Ortografias incorretas: " + incorrectWords.join(", ") : "Ortografia correta"
                });
            } catch (e) {
                field.tests.push({
                    test: "Ortografia",
                    result: "FAIL",
                    details: "Erro ao consultar API"
                });
            }
        }
    }
}


        // --- Alinhamento entre labels e campos ---
        components.forEach(comp => {
            comp.fields.forEach(field => {
                if (field.type === "input" && field.element) {
                    let relatedLabel = null;
                    const id = field.element.id;
                    if (id) relatedLabel = document.querySelector(`label[for="${id}"]`);
                    if (!relatedLabel && field.element.parentElement?.tagName.toLowerCase() === "label") {
                        relatedLabel = field.element.parentElement;
                    }
                    if (!relatedLabel) {
                        const prev = field.element.previousElementSibling;
                        if (prev && /label|span|div/i.test(prev.tagName)) relatedLabel = prev;
                    }

                    field.tests.push(checkLabelAlignment(field.element, relatedLabel));
                }
            });
        });

        // --- Ordem de tabulação ---
        const tabOrderResult = checkTabOrder(document);
        if (components.length > 0 && components[0].fields.length > 0) {
            components[0].fields[0].tests.push(tabOrderResult);
        }

        // Armazenar resultados globalmente
        currentTestResults = {
            components: components,
            tabulationCorrect: tabOrderResult.result === "PASS",
            timestamp: new Date().toISOString(),
            url: tab.url,
            summary: generateSummary(components)
        };

        // Mostrar resultados
        showComponentResults(components, tabOrderResult.result === "PASS");

        // Mostrar botões de exportação
        document.getElementById('exportButtons').style.display = 'flex';

        // Salvar resultados no storage
        chrome.runtime.sendMessage({
            type: "SAVE_RESULTS",
            data: currentTestResults
        });

    } catch (err) {
        resultsDiv.innerHTML = `<div style="color:red">Erro: ${err.message || err}</div>`;
    }
});

// Adicione os event listeners para exportação
document.getElementById("exportJSON").addEventListener("click", () => exportData('json'));
document.getElementById("exportCSV").addEventListener("click", () => exportData('csv'));
document.getElementById("exportHTML").addEventListener("click", () => exportData('html'));
document.getElementById("exportPDF").addEventListener("click", () => exportData('pdf'));

// Função para gerar resumo dos resultados
function generateSummary(components) {
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    components.forEach(comp => {
        comp.fields.forEach(field => {
            field.tests.forEach(test => {
                totalTests++;
                if (test.result === 'PASS') {
                    passedTests++;
                } else {
                    failedTests++;
                }
            });
        });
    });

    return {
        totalTests,
        passedTests,
        failedTests,
        successRate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0,
        totalComponents: components.length,
        totalFields: components.reduce((sum, comp) => sum + comp.fields.length, 0)
    };
}

// Função principal de exportação
async function exportData(format) {
    if (!currentTestResults) {
        alert('Nenhum resultado disponível para exportação. Execute os testes primeiro.');
        return;
    }

    try {
        let content, filename, mimeType;

        switch (format) {
            case 'json':
                const jsonData = exportAsJSON(currentTestResults);
                content = jsonData.content;
                filename = jsonData.filename;
                mimeType = jsonData.mimeType;
                break;

            case 'csv':
                const csvData = exportAsCSV(currentTestResults);
                content = csvData.content;
                filename = csvData.filename;
                mimeType = csvData.mimeType;
                break;

            case 'html':
                const htmlData = exportAsHTML(currentTestResults);
                content = htmlData.content;
                filename = htmlData.filename;
                mimeType = htmlData.mimeType;
                break;

            case 'pdf':
                await exportAsPDF(currentTestResults);
                return;

            default:
                throw new Error('Formato não suportado');
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        });

        setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (error) {
        console.error('Erro na exportação:', error);
        alert('Erro ao exportar dados: ' + error.message);
    }
}

// Exportar como JSON
function exportAsJSON(data) {
    const exportData = {
        metadata: {
            generatedAt: data.timestamp,
            url: data.url,
            tool: "Testes Unitários Extension"
        },
        summary: data.summary,
        components: data.components.map(comp => ({
            title: comp.title,
            fields: comp.fields.map(field => ({
                label: field.label,
                type: field.type,
                tests: field.tests
            }))
        }))
    };

    return {
        content: JSON.stringify(exportData, null, 2),
        filename: `testes-unitarios-${new Date().toISOString().split('T')[0]}.json`,
        mimeType: 'application/json'
    };
}

// Exportar como CSV
function exportAsCSV(data) {
    let csv = 'Componente,Campo,Tipo,Teste,Resultado,Detalhes\n';

    data.components.forEach(comp => {
        comp.fields.forEach(field => {
            field.tests.forEach(test => {
                csv += `"${comp.title}","${field.label}","${field.type}","${test.test}","${test.result}","${test.details}"\n`;
            });
        });
    });

    return {
        content: csv,
        filename: `testes-unitarios-${new Date().toISOString().split('T')[0]}.csv`,
        mimeType: 'text/csv'
    };
}

// Exportar como HTML
function exportAsHTML(data) {
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Testes Unitários</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { background: #e8f4fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .component { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .pass { color: green; font-weight: bold; }
        .fail { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Relatório de Testes Unitários</h1>
        <p><strong>Data de geração:</strong> ${new Date(data.timestamp).toLocaleString('pt-BR')}</p>
        <p><strong>URL:</strong> ${data.url}</p>
    </div>

    <div class="summary">
        <h2>Resumo Executivo</h2>
        <p><strong>Total de Testes:</strong> ${data.summary.totalTests}</p>
        <p><strong>Testes Aprovados:</strong> ${data.summary.passedTests}</p>
        <p><strong>Testes Reprovados:</strong> ${data.summary.failedTests}</p>
        <p><strong>Taxa de Sucesso:</strong> ${data.summary.successRate}%</p>
        <p><strong>Componentes Analisados:</strong> ${data.summary.totalComponents}</p>
        <p><strong>Campos Validados:</strong> ${data.summary.totalFields}</p>
    </div>

    ${data.components.map(comp => `
        <div class="component">
            <h3>${comp.title}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Campo</th>
                        <th>Tipo</th>
                        <th>Teste</th>
                        <th>Detalhes</th>
                        <th>Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    ${comp.fields.map(field =>
                        field.tests.map(test => `
                            <tr>
                                <td>${field.label}</td>
                                <td>${field.type}</td>
                                <td>${test.test}</td>
                                <td>${test.details}</td>
                                <td class="${test.result.toLowerCase()}">${test.result}</td>
                            </tr>
                        `).join('')
                    ).join('')}
                </tbody>
            </table>
        </div>
    `).join('')}
</body>
</html>`;

    return {
        content: html,
        filename: `relatorio-testes-${new Date().toISOString().split('T')[0]}.html`,
        mimeType: 'text/html'
    };
}

// Exportar como PDF
async function exportAsPDF(data) {
    const htmlData = exportAsHTML(data);
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(htmlData.content);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        setTimeout(() => printWindow.close(), 1000);
    }, 500);
}

/* ------------------------------------------------------------------
   FUNÇÃO AJUSTADA: COLETA DE COMPONENTES VISÍVEIS
-------------------------------------------------------------------*/
// --- COLETA DE COMPONENTES VISÍVEIS (rodando no contexto da página) ---
function collectVisibleComponents() {
    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style && style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    }

    function traverseFrame(doc) {
        const components = [];
        const forms = doc.querySelectorAll('form, [role="form"], div.component-container, .form-group, fieldset');

        forms.forEach((form, fidx) => {
            if (!isVisible(form)) return;

            const fields = [];
            let title = form.getAttribute('name') || form.getAttribute('id') || `Componente ${fidx + 1}`;

            // --- Botões ---
            const seenButtons = new Set();
            form.querySelectorAll('button, [role="button"]').forEach((btn, idx) => {
                if (!isVisible(btn)) return;
                const text = (btn.innerText || '').trim() || `sem texto ${idx + 1}`;
                if (!seenButtons.has(text)) {
                    seenButtons.add(text);
                    fields.push({
                        type: "button",
                        label: text,
                        rect: (() => { const r = btn.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; })(),
                        tests: [],
                        element: {
                            id: btn.id || null,
                            tabIndex: btn.tabIndex,
                            disabled: !!btn.disabled
                        }
                    });
                }
            });

            // --- Inputs ---
            const seenInputs = new Set();
            form.querySelectorAll('input, textarea, select, [role="textbox"]').forEach((input, idx) => {
                if (!isVisible(input)) return;

                // Encontrar label associado (várias estratégias)
                let labelEl = null;
                const id = input.id;
                if (id) labelEl = doc.querySelector(`label[for="${id}"]`);
                if (!labelEl && input.parentElement && input.parentElement.tagName.toLowerCase() === "label") {
                    labelEl = input.parentElement;
                }
                if (!labelEl) {
                    const prev = input.previousElementSibling;
                    if (prev && /label|span|div/i.test(prev.tagName) && isVisible(prev)) {
                        labelEl = prev;
                    } else {
                        // procurar label dentro do mesmo grupo (ex: form-group)
                        const group = input.closest('.form-group, fieldset, div');
                        if (group) {
                            const candidate = group.querySelector('label');
                            if (candidate && isVisible(candidate)) labelEl = candidate;
                        }
                    }
                }

                const ariaLabel = input.getAttribute('aria-label') || null;
                const ariaLabelledBy = input.getAttribute('aria-labelledby') || null;
                const placeholder = input.getAttribute('placeholder') || null;

                const accessible = !!(labelEl || ariaLabel || ariaLabelledBy || placeholder);

                const inRect = input.getBoundingClientRect();
                const labelRect = labelEl ? labelEl.getBoundingClientRect() : null;

                // Cálculo de alinhamento (centroide) se houver labelEl
                let alignmentTest;
                if (labelEl && labelRect) {
                    const centerInputX = inRect.left + inRect.width / 2;
                    const centerInputY = inRect.top + inRect.height / 2;
                    const centerLabelX = labelRect.left + labelRect.width / 2;
                    const centerLabelY = labelRect.top + labelRect.height / 2;

                    const alignedHorizontally = Math.abs(centerInputY - centerLabelY) <= 15;
                    const alignedVertically = Math.abs(centerInputX - centerLabelX) <= 15;

                    alignmentTest = {
                        test: "Alinhamento label",
                        result: (alignedHorizontally || alignedVertically) ? 'PASS' : 'FAIL',
                        details: (alignedHorizontally || alignedVertically) ? 'Label próximo e visualmente alinhado ao campo' : 'Label distante ou desalinhado'
                    };
                } else if (accessible) {
                    alignmentTest = {
                        test: "Alinhamento label",
                        result: 'PASS',
                        details: 'Campo sem <label>, mas possui descrição alternativa (placeholder/aria)'
                    };
                } else {
                    alignmentTest = {
                        test: "Alinhamento label",
                        result: 'FAIL',
                        details: 'Sem label ou descrição acessível'
                    };
                }

                // text label usado para LanguageTool: preferir texto do label, senão placeholder
                const labelText = labelEl ? labelEl.innerText.trim().replace(/\s*\*$/, '') : (placeholder || `Campo ${idx + 1}`);

                // Empacotar o campo com info serializável
                fields.push({
                    type: "input",
                    label: labelText,
                    rect: { top: inRect.top, left: inRect.left, width: inRect.width, height: inRect.height },
                    tests: [alignmentTest], // precomputado na página
                    element: {
                        id: input.id || null,
                        tabIndex: input.tabIndex,
                        disabled: !!input.disabled,
                        readOnly: !!input.readOnly,
                        placeholder: placeholder,
                        ariaLabel: ariaLabel,
                        ariaLabelledBy: ariaLabelledBy
                    },
                    _labelFound: !!labelEl,
                    _labelText: labelEl ? labelEl.innerText.trim().replace(/\s*\*$/, '') : null,
                    _labelRect: labelRect ? { top: labelRect.top, left: labelRect.left, width: labelRect.width, height: labelRect.height } : null
                });
            });

            components.push({ title, fields });
        });

        // --- Iframes (recursivo) ---
        doc.querySelectorAll('iframe').forEach(frame => {
            try {
                if (frame.contentDocument) {
                    const frameComps = traverseFrame(frame.contentDocument);
                    components.push(...frameComps);
                }
            } catch (e) {
                // cross-origin ou bloqueado
                console.warn("Iframe cross-origin bloqueado:", e);
            }
        });

        return components;
    }

    return traverseFrame(document);
}


/* ------------------------------------------------------------------
   ALINHAMENTO DE LABEL
-------------------------------------------------------------------*/
function checkLabelAlignment(input, label) {
    if (!input) {
        return { test: "Alinhamento label", result: 'FAIL', details: 'Campo inválido' };
    }

    // 🔹 Se não foi encontrado um <label>, tentamos alternativas
    if (!label) {
        let altLabel = null;

        // 1. Irmão anterior como label (ex: <span>Nome</span><input>)
        const prev = input.previousElementSibling;
        if (prev && /label|span|div/i.test(prev.tagName)) {
            altLabel = prev;
        }

        // 2. Placeholder ou atributos de acessibilidade
        if (input.placeholder || input.getAttribute?.("aria-label") || input.getAttribute?.("aria-labelledby")) {
            return {
                test: "Alinhamento label",
                result: 'PASS',
                details: 'Campo sem <label>, mas possui descrição alternativa'
            };
        }

        // 3. Se encontrou "label implícito"
        if (altLabel) {
            label = altLabel; // continua fluxo normal
        } else {
            return { test: "Alinhamento label", result: 'FAIL', details: 'Sem label ou descrição acessível' };
        }
    }

    // --- Comparação por centroide  ---
    const rectInput = input.getBoundingClientRect();
    const rectLabel = label.getBoundingClientRect();

    const centerInputX = rectInput.left + rectInput.width / 2;
    const centerInputY = rectInput.top + rectInput.height / 2;

    const centerLabelX = rectLabel.left + rectLabel.width / 2;
    const centerLabelY = rectLabel.top + rectLabel.height / 2;

    // Verifica proximidade dos centros
    const alignedHorizontally = Math.abs(centerInputY - centerLabelY) <= 15;
    const alignedVertically = Math.abs(centerInputX - centerLabelX) <= 15;

    if (alignedHorizontally || alignedVertically) {
        return {
            test: "Alinhamento label",
            result: 'PASS',
            details: 'Label próximo e visualmente alinhado ao campo'
        };
    }

    return {
        test: "Alinhamento label",
        result: 'FAIL',
        details: 'Label distante ou desalinhado'
    };
}




/* ------------------------------------------------------------------
   FUNÇÃO DE TABULAÇÃO 
-------------------------------------------------------------------*/
function getTabbableElements(root = document) {
    return Array.from(root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null)
        .sort((a, b) => {
            if (a.tabIndex !== b.tabIndex) return a.tabIndex - b.tabIndex;
            return 0;
        });
}

function checkTabOrder(container) {
    const tabbables = getTabbableElements(container);
    let valid = true;

    for (let i = 0; i < tabbables.length - 1; i++) {
        if (tabbables[i].tabIndex > tabbables[i + 1].tabIndex) {
            valid = false;
            break;
        }
    }

    return valid
        ? { test: "Ordem de tabulação", result: 'PASS', details: 'Ordem de tabulação correta' }
        : { test: "Ordem de tabulação", result: 'FAIL', details: 'Inconsistências na ordem de tabulação' };
}

/* ------------------------------------------------------------------
   EXIBIÇÃO E RECUPERAÇÃO DE RESULTADOS (PERMANECE A MESMA)
-------------------------------------------------------------------*/
function showComponentResults(components, tabulationCorrect) {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    const summary = generateSummary(components);
    const summaryHtml = `
        <h2>Resumo</h2>
        <p><strong>Total de Testes:</strong> ${summary.totalTests}</p>
        <p><strong>Aprovados:</strong> ${summary.passedTests}</p>
        <p><strong>Reprovados:</strong> ${summary.failedTests}</p>
        <p><strong>Taxa de Sucesso:</strong> ${summary.successRate}%</p>
    `;
    resultsDiv.innerHTML += summaryHtml;

    components.forEach(comp => {
        const compDiv = document.createElement("div");
        compDiv.innerHTML = `<h3>${comp.title}</h3>`;
        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Campo</th>
                    <th>Tipo</th>
                    <th>Teste</th>
                    <th>Detalhes</th>
                    <th>Resultado</th>
                </tr>
            </thead>
            <tbody>
                ${comp.fields.map(field =>
                    field.tests.map(test => `
                        <tr>
                            <td>${field.label}</td>
                            <td>${field.type}</td>
                            <td>${test.test}</td>
                            <td>${test.details}</td>
                            <td class="${test.result.toLowerCase()}">${test.result}</td>
                        </tr>
                    `).join("")
                ).join("")}
            </tbody>
        `;
        compDiv.appendChild(table);
        resultsDiv.appendChild(compDiv);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    chrome.runtime.sendMessage({ type: "GET_RESULTS" }, (response) => {
        if (response && response.status === "ok" && response.data && response.data.components) {
            currentTestResults = response.data;
            showComponentResults(currentTestResults.components, currentTestResults.tabulationCorrect);
            document.getElementById('exportButtons').style.display = 'flex';
        }
    });
});