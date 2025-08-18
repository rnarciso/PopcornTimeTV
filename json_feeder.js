(function() {
    // =============== Funções Auxiliares e Principais ===============

    /**
     * NOVO E FINAL: Simula uma interação completa, incluindo posicionamento do cursor e o pressionar da tecla "End".
     * @param {HTMLInputElement|HTMLTextAreaElement} element O elemento do formulário a ser interagido.
     */
    async function simulateUltimateInteraction(element) {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const elementName = element.name || element.id || 'sem nome';

        const dispatchEvent = (eventName, eventType = 'Event', options = {}) => {
            console.log(`  -> Disparando '${eventName}' em: ${elementName}`);
            let event;
            const defaultOptions = { bubbles: true, cancelable: true, ...options };
            switch (eventType) {
                case 'KeyboardEvent':
                    event = new KeyboardEvent(eventName, defaultOptions);
                    break;
                case 'MouseEvent':
                    event = new MouseEvent(eventName, defaultOptions);
                    break;
                default:
                    event = new Event(eventName, defaultOptions);
                    break;
            }
            element.dispatchEvent(event);
        };

        // 1. Foco e clique
        element.focus();
        dispatchEvent('mousedown', 'MouseEvent');
        await delay(30);

        // 2. Mover o cursor para o final (AÇÃO-CHAVE)
        // Isso é crucial e simula o efeito inicial do "CMD+Right"
        try {
            element.selectionStart = element.selectionEnd = element.value.length;
        } catch (e) {
            console.warn("Não foi possível definir a seleção para o elemento", element);
        }

        // 3. Simular a tecla "End" (AÇÃO-CHAVE)
        const keyOptions = { key: 'End', code: 'End', keyCode: 35, which: 35 };
        dispatchEvent('keydown', 'KeyboardEvent', keyOptions);
        await delay(50); // Pausa entre pressionar e soltar a tecla
        dispatchEvent('keyup', 'KeyboardEvent', keyOptions);
        
        // 4. Disparar eventos finais de mudança e desfocar
        dispatchEvent('input');
        dispatchEvent('change');
        await delay(30);
        element.blur();
    }


    // --- extractFormData (Mantida) ---
    function extractFormData(formId) {
        const form = document.getElementById(formId); if (!form) { console.error(`Formulário #${formId} não encontrado.`); alert(`Erro: Formulário #${formId} não encontrado.`); return null; }
        const formData = {};
        const elements = form.querySelectorAll('input:not([type="button"]):not([type="submit"]):not([type="reset"]), select, textarea');
        elements.forEach(element => {
            const name = element.name; if (!name || element.disabled || (element.closest('[style*="display: none"]') && element.closest('[id*="template"]'))) return;
            let value; const type = element.type ? element.type.toLowerCase() : element.tagName.toLowerCase();
            switch (type) {
                case 'checkbox': if (name.endsWith('[]')) { const b = name.slice(0, -2); if (!formData[b]) formData[b] = []; if (element.checked) formData[b].push(element.value); } else { formData[name] = element.checked; } break;
                case 'radio': if (element.checked) formData[name] = element.value; else if (!(name in formData)) formData[name] = null; break;
                case 'select-multiple': formData[name] = []; for (const o of element.options) { if (o.selected) formData[name].push(o.value); } break;
                default: formData[name] = element.value; break;
            }
        });
        form.querySelectorAll('.selectMultText').forEach(comp => { const s = comp.querySelector('select'), t = comp.querySelector('input.multText'), b = comp.querySelector('[name$="[]"]'); if (s&&t&&b&&b.name){ const n=b.name.slice(0,-2); if(!formData[n]||!Array.isArray(formData[n])) formData[n]=[]; const sv=s.value, tv=t.value; if(sv||tv){formData[n].push([sv,tv]); if(s.name&&formData.hasOwnProperty(s.name)) delete formData[s.name]; if(t.name&&formData.hasOwnProperty(t.name)) delete formData[t.name];}}});
        form.querySelectorAll('.ng-matrix').forEach(matrix => { const inputs = matrix.querySelectorAll('input[name*="["][name*="]"]'); if(inputs.length===0) return; const matrixName = inputs[0].name.substring(0,inputs[0].name.indexOf('[')); let matrixData=[]; inputs.forEach(input => {const m=input.name.match(/\[(\d+)\]\[(\d+)\]/); if(m){const r=parseInt(m[1],10),c=parseInt(m[2],10); if(!matrixData[r]) matrixData[r]=[]; matrixData[r][c]=input.value;}}); matrixData=matrixData.filter(row=>row&&row.some(cell=>cell||cell===0||cell===false)); if(matrixData.length>0) formData[matrixName]=matrixData; else if(formData.hasOwnProperty(matrixName)) delete formData[matrixName];});
        for(const key in formData){if(formData.hasOwnProperty(key)){const v=formData[key]; if(v===null||v===undefined||v===""||(Array.isArray(v)&&v.length===0)||(Array.isArray(v)&&v.every(i=>i===null||i===undefined||i===""))){delete formData[key];}}}
        return formData;
    }

    // --- downloadJson (Mantida) ---
    function downloadJson(data, filename = 'formData.json') {
        if (!data || Object.keys(data).length === 0) { alert("Nada extraído."); return; } try { const s = JSON.stringify(data, null, 2); const b = new Blob([s], {type:'application/json'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); } catch (e) { console.error("Erro download:", e); alert("Erro download."); }
    }

    // --- populateForm (MODIFICADA para usar a simulação de teclado) ---
    function populateForm(formId, formDataToRestore) {
        const form = document.getElementById(formId); if (!form) { alert(`Erro: Form #${formId} ?`); return; } if (!formDataToRestore || typeof formDataToRestore !== 'object') { alert("Dados inválidos."); return; }
        const defaultValues = { "for_Admissa": "", "for_ProblemasAtivos": "", "for_SOFANeurologico": "10 a 12", "for_Sedacao": "Não", "for_PresencaDor": "Não", "for_DeliriumPresente": "Não há delirium", "for_UsoVasopressor": "Não", "for_UsoInotropicos": "Não", "for_Vasodilatador": "Não", "for_UsoAntiarritimicos": "Não", "for_SOFACardio": "Sem hipotensão", "for_SuporteVentilatorio": ["Ventilação mecânica invasiva"], "for_SOFARespiratorio": "200-299", "for_Nutrido": "Sim", "for_MetaAtingida": "Não", "for_MetaJustificativa": ["Em progressão"], "for_MetaJustificativaParenteral": ["Em progressão"], "for_Hipergl": "Não", "for_Hipogl": "Não", "for_SOFAHepatico": "< 1,2", "for_AlteracaoEletrolitica": "Não", "for_Dialise": "Não", "for_SOFARenal": "< 1,2", "for_OpInfeccao": "Não", "for_SOFAHemato": ">= 150", "for_DrogasAjustadas": "Não se aplica", "for_ReconciliacaoMedicamentosa": "Total", "for_SVD": "Sim", "for_CVC": "Sim", "for_CateterArterial": "Não", "for_Dreno": "Não", "for_PacienteMobilizado": "Não", "for_PeleIntegra": "Sim", "for_AltaPaciente": "Não", "for_ClassificaoRecomendacoes": [], "for_AtendimentoFarmacia": "Não", "for_PacienteWatcher": "Não" };
        for (const fieldName in defaultValues) { if (!formDataToRestore.hasOwnProperty(fieldName)) { formDataToRestore[fieldName] = defaultValues[fieldName]; } }
        
        form.querySelectorAll('.selectMultText').forEach(comp=>{const r=comp.querySelectorAll(':scope > div');for(let i=r.length-1;i>0;i--){const b=r[i].querySelector('button.btn-danger');if(b)b.click();else r[i].remove();}if(r[0]){const s=r[0].querySelector('select'),t=r[0].querySelector('input.multText');if(s)s.value='';if(t)t.value='';}});
        form.querySelectorAll('.ng-matrix').forEach(m=>{const r=m.querySelectorAll('tbody > tr');for(let i=r.length-1;i>0;i--){const b=r[i].querySelector('button.btn-danger');if(b)b.click();else r[i].remove();}if(r[0]){r[0].querySelectorAll('input').forEach(inp=>inp.value='');}});

        (async () => { 
            for (const name in formDataToRestore) {
                if (!formDataToRestore.hasOwnProperty(name)) continue;

                const value = formDataToRestore[name];
                const elements = form.querySelectorAll(`[name="${name}"], [name="${name}[]"]`);
                if (elements.length === 0) continue;

                if (name === 'for_ClassificaoRecomendacoes' && Array.isArray(value) && value.length > 0) {
                    console.log(`Populando com SIMULAÇÃO DE TECLADO: ${name}`);
                    const container = form.querySelector(`#default_${name}, [id*="${name}"]`);
                    if (!container) continue;

                    const addButton = container.querySelector('button.btn-success[onclick*="clonarCampo"]');
                    let currentRows = container.querySelectorAll(':scope > div.input-group, :scope > .selectMultText');
                    if (addButton) { for (let i = currentRows.length; i < value.length; i++) { addButton.click(); } }
                    
                    await new Promise(resolve => setTimeout(resolve, 500)); 

                    currentRows = container.querySelectorAll(':scope > div.input-group, :scope > .selectMultText');
                    for (let index = 0; index < value.length; index++) {
                        const pair = value[index];
                        if (currentRows[index]) {
                            const select = currentRows[index].querySelector('select');
                            const textInput = currentRows[index].querySelector('input.multText');
                            
                            if (select) {
                                select.value = pair?.[0] ?? '';
                                await simulateUltimateInteraction(select);
                                if (typeof $ !== 'undefined' && $(select).data('chosen')) { $(select).trigger('chosen:updated'); }
                            }
                            if (textInput) {
                                textInput.value = pair?.[1] ?? '';
                                await simulateUltimateInteraction(textInput);
                            }
                        }
                    }
                    continue; 
                }

                elements.forEach(element => {
                    const type = element.type ? element.type.toLowerCase() : element.tagName.toLowerCase();
                    switch (type) {
                        case 'checkbox': if(element.name===name+'[]'&&Array.isArray(value)){element.checked=value.map(v=>String(v).trim()).includes(String(element.value).trim());}else{element.checked=!!value;}break;
                        case 'radio': if(element.name===name){element.checked=(String(element.value).trim()===String(value).trim());}break;
                        case 'select-multiple': if(Array.isArray(value)){const sVals=value.map(v=>String(v));for(const o of element.options){o.selected=sVals.includes(o.value);}}break;
                        default: element.value=value??''; break;
                    }
                    element.dispatchEvent(new Event('input',{bubbles:true}));
                    element.dispatchEvent(new Event('change',{bubbles:true}));
                    if(type.startsWith('select')&&typeof $!=='undefined'&&$(element).data('chosen')){$(element).trigger('chosen:updated');}
                });
            }

            console.log("Acionando lógica dinâmica final da página...");
            if (typeof $ !== 'undefined' && typeof hideShowCampo === 'function') {
                try {
                    console.log("Executando hideShowCampo() com jQuery...");
                    $('*[data-condicao]').each(function() { hideShowCampo($(this)); });
                } catch (e) { console.error("Erro ao executar hideShowCampo:", e); }
            }
            if (typeof $ !== 'undefined' && $.fn.chosen) { $('select.chosen-select,select[class*="chosen"]').trigger('chosen:updated'); }
        })();
    }
    
    // --- createFormToolsUI (Mantida) ---
    function createFormToolsUI(targetFormId = 'formPreencher') {
        const containerId = 'form-tools-container-unique';
        if (document.getElementById(containerId)) document.getElementById(containerId).remove();
        const container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = `position:fixed;top:10px;right:10px;z-index:10001;background:#f0f0f0;border:1px solid #ccc;border-radius:8px;padding:15px;box-shadow:0 4px 8px rgba(0,0,0,0.2);font-family:Arial,sans-serif;font-size:14px;max-width:250px;`;
        const title = document.createElement('h4');
        title.textContent = 'Ferramentas Formulário';
        title.style.cssText = 'margin-top:0;margin-bottom:10px;text-align:center;color:#333;';
        
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Exportar Dados (Baixar JSON)';
        exportBtn.style.cssText = `display:block;width:100%;padding:8px 10px;margin-bottom:10px;cursor:pointer;background-color:#4CAF50;color:white;border:none;border-radius:4px;font-size:inherit;`;
        exportBtn.onclick = () => { const data = extractFormData(targetFormId); if (data) { const ts = new Date().toISOString().replace(/[:.]/g, '-'); downloadJson(data, `form_${targetFormId}_${ts}.json`); } };
        
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Importar Dados (Carregar JSON)';
        importBtn.style.cssText = `display:block;width:100%;padding:8px 10px;margin-bottom:10px;cursor:pointer;background-color:#008CBA;color:white;border:none;border-radius:4px;font-size:inherit;`;
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.style.display = 'none';
        importBtn.onclick = () => fileInput.click();
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => { try { const jsonData = JSON.parse(e.target.result); populateForm(targetFormId, jsonData); alert('Formulário populado via arquivo!'); } catch (error) { alert(`Erro ao processar o JSON do arquivo:\n${error.message}`); } finally { fileInput.value = ''; } };
            reader.readAsText(file);
        });

        const importClipboardBtn = document.createElement('button');
        importClipboardBtn.textContent = 'Importar do Clipboard';
        importClipboardBtn.style.cssText = `display:block;width:100%;padding:8px 10px;margin-bottom:10px;cursor:pointer;background-color:#f0ad4e;color:white;border:none;border-radius:4px;font-size:inherit;`;
        importClipboardBtn.onclick = () => {
            if (!navigator.clipboard?.readText) { alert('A API de clipboard não é suportada ou a página não é segura (HTTPS).'); return; }
            navigator.clipboard.readText().then(clipboardText => {
                if (!clipboardText) { alert('A área de transferência está vazia.'); return; }
                try { const jsonData = JSON.parse(clipboardText); populateForm(targetFormId, jsonData); alert('Formulário populado via clipboard!'); } catch (error) { alert(`Erro ao processar o JSON do clipboard:\n${error.message}`); }
            }).catch(err => { alert('Não foi possível ler da área de transferência. Verifique as permissões do navegador.'); });
        };

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Fechar Ferramentas';
        closeBtn.style.cssText = `display:block;width:100%;padding:6px 8px;margin-top:10px;cursor:pointer;background-color:#f44336;color:white;border:none;border-radius:4px;font-size:inherit;`;
        closeBtn.onclick = () => container.remove();
        
        container.appendChild(title); container.appendChild(exportBtn); container.appendChild(importBtn); container.appendChild(importClipboardBtn); container.appendChild(fileInput); container.appendChild(closeBtn);
        document.body.appendChild(container);
    }

    // --- Inicializa a UI ---
    createFormToolsUI('formPreencher');

})();