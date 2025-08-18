(function() {
    // Evita a reinicialização se o script já estiver rodando
    if (window.ClinicalFormAssistant) {
        window.ClinicalFormAssistant.cleanup();
    }

    // =================================================================================
    // DEFINIÇÃO DAS CLASSES DE VALIDAÇÃO (CORREÇÃO DE ARQUITETURA)
    // =================================================================================
    const MedicalDataValidator = class {
        constructor() {
            this.criticalFields = ['for_SOFANeurologico', 'for_SOFACardio', 'for_SOFARespiratorio', 'for_SOFAHepatico', 'for_SOFARenal', 'for_SOFAHemato'];
            this.validRanges = {
                'for_PAMMin': { min: 50, max: 120, unit: 'mmHg' },
                'for_MetaMax': { min: 50, max: 120, unit: 'mmHg' },
                'for_SAVAS': { min: 0, max: 10, unit: 'score' }
            };
            this.requiredCombinations = [
                { condition: 'for_Sedacao', value: 'Sim', required: ['for_InterrupcaoDiaria'] },
                { condition: 'for_Dialise', value: 'Sim', required: ['for_MetodoDialise'] },
                { condition: 'for_PeleIntegra', value: 'Não', required: ['for_LesoesPele'] },
                { condition: 'for_PresencaDor', value: 'Sim', required: ['for_SAVAS'] }
            ];
            this.sofaConversions = {
                'for_SOFANeurologico': { '15': 0, '13 a 14': 1, '10 a 12': 2, '6 a 9': 3, '<6': 4 },
                'for_SOFACardio': { 'Sem hipotensão': 0, 'PAM < 70mmhg': 1, 'Dopa > 5 ou dobuta qq dose': 2, 'Dopa >15 ou Nora/Adr > 0.01': 3, 'Nora/Adr > 0.1': 4 },
                'for_SOFARespiratorio': { '>= 400': 0, '300-399': 1, '200-299': 2, '100-199 + suplem. Vent.': 3, '<100 + suplem. Vent.': 4 },
                'for_SOFAHepatico': { '< 1,2': 0, '1,2 - 1,9': 1, '2,0 - 5,9': 2, '6,0 - 11,9': 3, '>= 12': 4 },
                'for_SOFARenal': { '< 1,2': 0, '1,2 - 1,9': 1, '2,0 - 3,4': 2, '3,5 - 4,9 ou 500ml/24h': 3, '>= 5 ou <= 200ml/24h': 4 },
                'for_SOFAHemato': { '>= 150': 0, '100 - 149': 1, '50 - 99': 2, '20 - 49': 3, '<20': 4 }
            };
        }
        _validateFormData(formData) {
            const results = { errors: [], warnings: [], criticalAlerts: [] };
            if (!formData || typeof formData !== 'object') {
                results.errors.push({ field: 'Geral', message: 'Dados do formulário são inválidos.' });
                return results;
            }
            this.validateSofaScores(formData, results);
            this.validatePhysiologicalRanges(formData, results);
            this.validateRequiredCombinations(formData, results);
            this.checkCriticalConditions(formData, results);
            return results;
        }
        validatePage(text) {
            const results = { errors: [], warnings: [], criticalAlerts: [] };
            if (!text || typeof text !== 'string') {
                results.errors.push({ field: 'Geral', message: 'Texto de entrada é inválido.' });
                return results;
            }
            // Simple checks for keywords. This is a placeholder for more complex logic.
            if (text.toLowerCase().includes('parada cardiorrespiratória') || text.toLowerCase().includes('pcr')) {
                results.criticalAlerts.push({ message: 'Texto menciona PCR. Verificar status do paciente.' });
            }
            if (text.toLowerCase().includes('sepse') || text.toLowerCase().includes('choque séptico')) {
                results.warnings.push({ field: 'Geral', message: 'Texto menciona sepse. Confirmar diagnóstico e tratamento.' });
            }
            return results;
        }
        convertSofaToNumeric(value, field) { return this.sofaConversions[field]?.[value] ?? null; }
        validateSofaScores(formData, results) {
            const sofaScores = {};
            this.criticalFields.forEach(field => { if (formData[field]) { sofaScores[field] = this.convertSofaToNumeric(formData[field], field); } });
            if (sofaScores.for_SOFANeurologico <= 6 && formData.for_Sedacao === 'Não') { results.warnings.push({ field: 'for_SOFANeurologico', message: 'Glasgow ≤6 sem sedação pode indicar comprometimento neurológico grave.' }); }
            if (sofaScores.for_SOFACardio >= 3 && formData.for_UsoVasopressor === 'Não') { results.errors.push({ field: 'for_SOFACardio', message: 'SOFA cardiovascular alto inconsistente com não uso de vasopressor.' }); }
        }
        validatePhysiologicalRanges(formData, results) {
            Object.entries(this.validRanges).forEach(([field, range]) => {
                const value = formData[field];
                if (value !== undefined && value !== null && value !== '') {
                    const numValue = Number(String(value).replace(',', '.'));
                    if (isNaN(numValue)) { results.errors.push({ field, message: `Valor inválido para ${field}` }); } else if (numValue < range.min || numValue > range.max) { results.warnings.push({ field, message: `Valor ${numValue} ${range.unit} fora da faixa típica (${range.min}-${range.max})` }); }
                }
            });
            if (formData.for_PAMMin && formData.for_MetaMax) {
                const minPAM = Number(formData.for_PAMMin);
                const maxPAM = Number(formData.for_MetaMax);
                if (!isNaN(minPAM) && !isNaN(maxPAM) && minPAM > maxPAM) { results.errors.push({ field: 'for_PAMMin', message: 'PAM mínima não pode ser maior que a máxima.' }); }
            }
        }
        validateRequiredCombinations(formData, results) {
            this.requiredCombinations.forEach(c => {
                if (formData[c.condition] === c.value) {
                    c.required.forEach(requiredField => {
                        if (!formData[requiredField] || formData[requiredField] === '') { results.errors.push({ field: requiredField, message: `${requiredField} é obrigatório quando ${c.condition} é "${c.value}"` }); }
                    });
                }
            });
        }
        checkCriticalConditions(formData, results) {
            const ventSupportCheck = [].concat(formData.for_SuporteVentilatorio || []);
            if (formData.for_SOFANeurologico === '<6') { results.criticalAlerts.push({ message: 'CRÍTICO: Escala de Coma de Glasgow <6.' }); }
            if (formData.for_SOFARespiratorio === '<100 + suplem. Vent.' && ventSupportCheck.includes('Ventilação mecânica invasiva')) { results.criticalAlerts.push({ message: 'CRÍTICO: SDRA grave (PaO2/FiO2 <100) em ventilação mecânica.' }); }
            const highSofaFields = this.criticalFields.filter(field => (this.convertSofaToNumeric(formData[field], field) ?? 0) >= 3);
            if (highSofaFields.length >= 3) { results.criticalAlerts.push({ message: `Disfunção de múltiplos órgãos: ${highSofaFields.length} sistemas com SOFA ≥3.` }); }
        }
    };

    const EnhancedMedicalValidator = class extends MedicalDataValidator {
        constructor() {
            super();
            this.drugInteractions = {
                'for_UsoVasopressor': { 'Sim': { conflicts: ['for_Vasodilatador'], message: 'Uso simultâneo de vasopressor e vasodilatador requer cuidado especial' } },
                'for_Dialise': { 'Sim': { implications: ['for_DrogasAjustadas'], message: 'Paciente em diálise deve ter medicamentos ajustados para função renal' } }
            };
            this.ventilationChecks = { invasive: ['Ventilação mecânica invasiva'], noninvasive: ['VNI', 'CPAP'], oxygen: ['Cateter nasal', 'Máscara', 'Nebulização'] };
            this.nutritionSafety = { maxProtein: { nonObese: 2.0, obese: 2.0 } };
        }
        _validateFormData(formData) {
            const results = super.validate(formData);
            this.validateDrugInteractions(formData, results);
            this.validateVentilationSafety(formData, results);
            this.validateNutritionSafety(formData, results);
            this.validateInfectionControl(formData, results);
            this.calculateRiskScores(formData, results);
            return results;
        }

        validatePage(text) {
            const results = super.validatePage(text);
            // Check for contradictions that might be missed by JSON extraction
            const mentionsSedation = text.match(/sedação|sedativo/i);
            const mentionsAgitation = text.match(/agitação|agitado/i);

            if (mentionsSedation && mentionsAgitation) {
                results.warnings.push({ field: 'Geral', message: 'Texto menciona tanto sedação quanto agitação. Avaliar adequação da sedoanalgesia.' });
            }

            const mentionsDialysis = text.match(/diálise|hemodiálise|crrt/i);
            const mentionsNormalRenal = text.match(/função renal normal|diurese preservada/i);

            if (mentionsDialysis && mentionsNormalRenal) {
                 results.warnings.push({ field: 'Geral', message: 'Texto menciona diálise e função renal normal. Clarificar status renal.' });
            }
            return results;
        }
        validateDrugInteractions(formData, results) {
            Object.entries(this.drugInteractions).forEach(([field, rules]) => {
                const fieldValue = formData[field];
                if (!fieldValue) return;
                const rule = rules[fieldValue];
                if (!rule) return;
                if (rule.conflicts) { rule.conflicts.forEach(conflictField => { if (formData[conflictField] === 'Sim') { results.warnings.push({ field: `${field}+${conflictField}`, message: rule.message }); } }); }
                if (rule.implications) { rule.implications.forEach(implicationField => { if (formData[implicationField] === 'Não' || formData[implicationField] === 'Não se aplica') { results.warnings.push({ field: implicationField, message: rule.message }); } }); }
            });
        }
        validateVentilationSafety(formData, results) {
            const ventSupport = [].concat(formData.for_SuporteVentilatorio || []);
            const sofaResp = formData.for_SOFARespiratorio;
            if (ventSupport.some(v => this.ventilationChecks.oxygen.includes(v)) && ['100-199 + suplem. Vent.', '<100 + suplem. Vent.'].includes(sofaResp)) { results.warnings.push({ field: 'for_SuporteVentilatorio', message: 'SOFA respiratório sugere necessidade de ventilação mais invasiva' }); }
            if (ventSupport.includes('Ventilação mecânica invasiva') && formData.for_CandidatoTRE === 'Sim' && sofaResp && ['>= 400', '300-399'].includes(sofaResp)) { results.warnings.push({ field: 'for_CandidatoTRE', message: 'Paciente com bom SOFA respiratório - considerar desmame ventilatório' }); }
        }
        validateNutritionSafety(formData, results) {
            if (formData.for_Nutrido === 'Não') return;
            const isObese = formData.for_PacienteObeso === 'Sim';
            const proteinValue = isObese ? formData.for_ObesoProteina : formData.for_NaoObesoProteina;
            if (proteinValue) {
                const numericProtein = parseFloat(String(proteinValue).replace(',', '.'));
                const maxSafeProtein = this.nutritionSafety.maxProtein[isObese ? 'obese' : 'nonObese'];
                if (numericProtein > maxSafeProtein) { results.warnings.push({ field: isObese ? 'for_ObesoProteina' : 'for_NaoObesoProteina', message: `Proteína ${numericProtein}g/kg pode ser excessiva para paciente crítico` }); }
            }
            const metaJustParenteral = [].concat(formData.for_MetaJustificativaParenteral || []);
            if (formData.for_MetaAtingida === 'Não' && metaJustParenteral.includes('Risco de síndrome de realimentação')) { results.criticalAlerts.push({ message: 'Risco de síndrome de realimentação - monitorar eletrólitos rigorosamente' }); }
        }
        validateInfectionControl(formData, results) {
            const hasInfection = formData.for_OpInfeccao === 'Sim';
            const antibiotic = formData.for_AntiTerapia;
            const cultureGuided = formData.for_GuiadoCultura;
            const ventSupport = [].concat(formData.for_SuporteVentilatorio || []);
            if (hasInfection && antibiotic === 'Sem antibiótico') { results.errors.push({ field: 'for_AntiTerapia', message: 'Infecção presente mas sem antibioticoterapia' }); }
            if (hasInfection && antibiotic === 'Terapêutica' && cultureGuided === 'Não') { results.warnings.push({ field: 'for_GuiadoCultura', message: 'Terapia empírica - considerar coleta de culturas' }); }
            const invasiveDevices = [].concat(formData.for_CVC === 'Sim' ? 'CVC' : [], formData.for_SVD === 'Sim' ? 'SVD' : [], ventSupport.includes('Ventilação mecânica invasiva') ? 'VM' : []).filter(Boolean);
            if (invasiveDevices.length >= 2 && !hasInfection) { results.warnings.push({ field: 'for_OpInfeccao', message: `Múltiplos dispositivos invasivos (${invasiveDevices.join(', ')}) - risco aumentado de infecção` }); }
        }
        calculateRiskScores(formData, results) {
            const sofaComponents = this.criticalFields.map(field => (this.convertSofaToNumeric(formData[field], field))).filter(score => score !== null);
            if (sofaComponents.length >= 4) {
                const estimatedSOFA = sofaComponents.reduce((sum, score) => sum + score, 0);
                const mortality = this.estimateMortality(estimatedSOFA);
                if (estimatedSOFA >= 10) { results.criticalAlerts.push({ message: `SOFA estimado: ${estimatedSOFA} (mortalidade ~${mortality}) - Condição crítica` }); } else if (estimatedSOFA >= 6) { results.warnings.push({ field: 'SOFA_Total', message: `SOFA estimado: ${estimatedSOFA} (mortalidade ~${mortality}) - Monitorar evolução` }); }
            }
            const removableDevices = this.calculateRemovalOpportunities(formData);
            if (removableDevices.length > 0) { results.warnings.push({ field: 'Dispositivos', message: `Dispositivos possivelmente removíveis: ${removableDevices.join(', ')}` }); }
        }
        estimateMortality(sofaScore) { const mortalityMap = { 0: '<1%', 1: '<1%', 2: '2%', 3: '3%', 4: '5%', 5: '7%', 6: '9%', 7: '12%', 8: '15%', 9: '20%', 10: '25%', 11: '32%', 12: '40%', 13: '50%', 14: '60%', 15: '70%', 16: '80%', 17: '85%', 18: '90%', 19: '95%', 20: '>95%' }; return mortalityMap[Math.min(sofaScore, 20)] || '>95%'; }
        calculateRemovalOpportunities(formData) {
            const removable = [];
            if (formData.for_SVD === 'Sim' && formData.for_SVDRemocao === 'Sim') { removable.push('SVD'); }
            if (formData.for_CVC === 'Sim' && formData.for_CVCRemocao === 'Sim') { removable.push('CVC'); }
            if (formData.for_CateterArterial === 'Sim' && formData.for_ArterialRemocao === 'Sim') { removable.push('Cateter Arterial'); }
            if (formData.for_Dreno === 'Sim' && formData.for_DrenoRemocao === 'Sim') { removable.push('Dreno'); }
            return removable;
        }
    };

    const ClinicalFormAssistant = {
        MedicalDataValidator: MedicalDataValidator,
        EnhancedMedicalValidator: EnhancedMedicalValidator,
        originalFormData: null, // To store the form state for undo

        async simulateUltimateInteraction(element) {
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
        },

        extractFormData(formId) {
            const form = document.getElementById(formId);
            if (!form) return null;
            const formData = {};
            const elements = form.querySelectorAll('input:not([type="button"]), select, textarea');
            elements.forEach(element => {
                const name = element.name;
                if (!name || element.disabled) return;
                const type = element.type ? element.type.toLowerCase() : element.tagName.toLowerCase();
                switch (type) {
                    case 'checkbox':
                        if (name.endsWith('[]')) {
                            const baseName = name.slice(0, -2);
                            if (!formData[baseName]) formData[baseName] = [];
                            if (element.checked) formData[baseName].push(element.value);
                        } else {
                            formData[name] = element.checked;
                        }
                        break;
                    case 'radio':
                        if (element.checked) formData[name] = element.value;
                        else if (!(name in formData)) formData[name] = null;
                        break;
                    case 'select-multiple':
                        formData[name] = [];
                        for (const o of element.options) {
                            if (o.selected) formData[name].push(o.value);
                        }
                        break;
                    default:
                        formData[name] = element.value;
                        break;
                }
            });
            form.querySelectorAll('.selectMultText').forEach(comp => {
                const s = comp.querySelector('select'), t = comp.querySelector('input.multText'), b = comp.querySelector('[name$="[]"]');
                if (s && t && b && b.name) {
                    const n = b.name.slice(0, -2);
                    if (!formData[n] || !Array.isArray(formData[n])) formData[n] = [];
                    const sv = s.value, tv = t.value;
                    if (sv || tv) {
                        formData[n].push([sv, tv]);
                        if (s.name && formData.hasOwnProperty(s.name)) delete formData[s.name];
                        if (t.name && formData.hasOwnProperty(t.name)) delete formData[t.name];
                    }
                }
            });
            return formData;
        },

        downloadJson(data, filename = 'formData.json') {
            if (!data || Object.keys(data).length === 0) { return alert("Nada extraído."); }
            try {
                const s = JSON.stringify(data, null, 2);
                const b = new Blob([s], { type: 'application/json' });
                const u = URL.createObjectURL(b);
                const a = document.createElement('a');
                a.href = u; a.download = filename;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(u);
            } catch (e) {
                console.error("Erro no download:", e);
                alert("Erro no download.");
            }
        },

        getApiKey() {
            return new Promise((resolve) => {
                chrome.storage.local.get('openRouterApiKey', (data) => {
                    resolve(data.openRouterApiKey || null);
                });
            });
        },

        async getJsonFromLlm(textToProcess) {
            const settings = await new Promise(resolve => {
                chrome.storage.local.get(['aiPrompt', 'aiModels', 'openRouterApiKey'], (data) => {
                    resolve(data);
                });
            });

            const masterPrompt = settings.aiPrompt || `Você é um assistente de IA especializado em extrair informações clínicas estruturadas de texto não estruturado. Sua tarefa é analisar a história clínica do paciente que será fornecida no próximo prompt e gerar um objeto JSON que resuma os dados do paciente e as recomendações clínicas relevantes.`;

            const models = settings.aiModels && settings.aiModels.length > 0 ? settings.aiModels : ['openai/gpt-3.5-turbo', 'mistralai/mistral-7b-instruct:free'];

            let apiKey = settings.openRouterApiKey;
            if (!apiKey) {
                alert("Chave da API não encontrada. Por favor, configure-a na página de opções.");
                return null;
            }

            for (let i = 0; i < models.length; i++) {
                const model = models[i];
                try {
                    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.href, 'X-Title': document.title, },
                        body: JSON.stringify({ model: model, messages: [{ role: "system", content: masterPrompt }, { role: "user", content: textToProcess }] })
                    });

                    if (!response.ok) {
                        const errorBody = await response.json();
                        const errorMessage = errorBody.error?.message || JSON.stringify(errorBody);
                        if (response.status === 401) {
                            throw new Error(`Erro de Autenticação (401): A chave da API é inválida ou foi revogada. Verifique suas configurações.`);
                        }
                        throw new Error(`Erro na API com o modelo ${model}: ${response.status}\n${errorMessage}`);
                    }
                    
                    const data = await response.json();
                    let jsonString = data.choices[0].message.content;
                    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
                    if (jsonMatch) { 
                        return JSON.parse(jsonMatch[0]);
                    }
                } catch (error) {
                    console.error(`Falha com o modelo ${model}:`, error);
                    if (i === models.length - 1) { // Se for o último modelo
                        throw new Error(`Todos os modelos falharam. Último erro: ${error.message}`);
                    }
                }
            }
        },

        populateForm(formId, formDataToRestore, callback) {
            const form = document.getElementById(formId);
            if (!form) {
                console.error(`Formulário #${formId} não encontrado.`);
                if (callback) callback(false);
                return;
            }
            if (!formDataToRestore || typeof formDataToRestore !== 'object') {
                console.error("Dados para restaurar são inválidos.");
                if (callback) callback(false);
                return;
            }

            console.log("Populando formulário com:", formDataToRestore);

            // Limpa componentes complexos antes de popular
            this.resetComplexComponents(form);

            // Itera sobre os dados e preenche os campos
            (async () => {
                for (const name in formDataToRestore) {
                    if (!formDataToRestore.hasOwnProperty(name)) continue;

                    const value = formDataToRestore[name];
                    const elements = form.querySelectorAll(`[name="${name}"], [name^="${name}["]`);

                    if (elements.length > 0) {
                        await this.populateElements(elements, value);
                    } else if (name === 'for_ClassificaoRecomendacoes' && Array.isArray(value)) {
                        await this.handleRecommendationsField(form, name, value);
                    }
                }

                console.log("Acionando lógica dinâmica final da página...");
                await this.updateConditionalFields(form);
                
                // Show clinical alerts if enabled
                const settings = await new Promise(resolve => {
                    chrome.storage.local.get('clinicalAlerts', (data) => {
                        resolve(data);
                    });
                });
                if (settings.clinicalAlerts) {
                    const validator = new this.EnhancedMedicalValidator();
                    const validationResults = validator.validate(formDataToRestore);
                    this.displayClinicalAlerts(validationResults);
                }


                if (callback) callback(true);
            })();
        },

        resetComplexComponents(form) {
            // Limpa selectMultText
            form.querySelectorAll('.selectMultText').forEach(comp => {
                const rows = comp.querySelectorAll(':scope > div');
                for (let i = rows.length - 1; i > 0; i--) {
                    const removeButton = rows[i].querySelector('button.btn-danger');
                    if (removeButton) removeButton.click();
                    else rows[i].remove();
                }
                if (rows[0]) {
                    const select = rows[0].querySelector('select');
                    const textInput = rows[0].querySelector('input.multText');
                    if (select) select.value = '';
                    if (textInput) textInput.value = '';
                }
            });

            // Limpa ng-matrix
            form.querySelectorAll('.ng-matrix').forEach(matrix => {
                const rows = matrix.querySelectorAll('tbody > tr');
                for (let i = rows.length - 1; i > 0; i--) {
                    const removeButton = rows[i].querySelector('button.btn-danger');
                    if (removeButton) removeButton.click();
                    else rows[i].remove();
                }
                if (rows[0]) {
                    rows[0].querySelectorAll('input').forEach(inp => inp.value = '');
                }
            });
        },

        async populateElements(elements, value) {
            for (const element of elements) {
                const type = element.type ? element.type.toLowerCase() : element.tagName.toLowerCase();
                switch (type) {
                    case 'checkbox':
                        if (element.name.endsWith('[]') && Array.isArray(value)) {
                            element.checked = value.map(v => String(v).trim()).includes(String(element.value).trim());
                        } else {
                            element.checked = !!value;
                        }
                        break;
                    case 'radio':
                        element.checked = (String(element.value).trim() === String(value).trim());
                        break;
                    case 'select-multiple':
                        if (Array.isArray(value)) {
                            const stringValues = value.map(v => String(v));
                            for (const option of element.options) {
                                option.selected = stringValues.includes(option.value);
                            }
                        }
                        break;
                    default:
                        element.value = value ?? '';
                        break;
                }
                await this.simulateUltimateInteraction(element);
            }
        },

        async handleRecommendationsField(form, fieldName, value) {
            const container = form.querySelector(`#default_${fieldName}, [id*="${fieldName}"]`);
            if (!container) return;

            const addButton = container.querySelector('button.btn-success[onclick*="clonarCampo"]');
            let currentRows = this.getDynamicRows(container).rows;

            if (addButton) {
                for (let i = currentRows.length; i < value.length; i++) {
                    addButton.click();
                }
                await new Promise(resolve => setTimeout(resolve, 100)); // Aguarda a renderização das novas linhas
            }

            currentRows = this.getDynamicRows(container).rows;

            for (let index = 0; index < value.length; index++) {
                const pair = value[index];
                if (currentRows[index]) {
                    const select = currentRows[index].querySelector('select');
                    const textInput = currentRows[index].querySelector('input.multText');

                    if (select) {
                        select.value = pair?.[0] ?? '';
                        await this.simulateUltimateInteraction(select);
                    }
                    if (textInput) {
                        textInput.value = pair?.[1] ?? '';
                        await this.simulateUltimateInteraction(textInput);
                    }
                }
            }
        },

        getDynamicRows(container) {
            // Cache para evitar re-query
            if (container._cachedRows && (Date.now() - container._cachedRows.timestamp < 200)) {
                return container._cachedRows;
            }
            const rows = container.querySelectorAll(':scope > div.input-group, :scope > .selectMultText');
            container._cachedRows = { rows: rows, timestamp: Date.now() };
            return { rows: rows };
        },

        async updateConditionalFields(form) {
            // Aciona a lógica de visibilidade condicional da página
            if (typeof $ !== 'undefined' && typeof hideShowCampo === 'function') {
                try {
                    console.log("Executando hideShowCampo() com jQuery...");
                    $('*[data-condicao]').each(function() {
                        hideShowCampo($(this));
                    });
                } catch (e) {
                    console.error("Erro ao executar hideShowCampo:", e);
                }
            }
            // Atualiza os selects 'chosen'
            if (typeof $ !== 'undefined' && $.fn.chosen) {
                $('select.chosen-select,select[class*="chosen"]').trigger('chosen:updated');
            }
        },

        displayClinicalAlerts(validationResults) {
            const containerId = 'clinical-alerts-container';
            let container = document.getElementById(containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = containerId;
                document.body.appendChild(container);
            }

            const createAlertList = (title, items, colorClass) => {
                if (!items || items.length === 0) return '';
                return `
                    <div class="alert-group ${colorClass}">
                        <strong>${title}</strong>
                        <ul>
                            ${items.map(item => `<li>${item.field ? `<strong>${item.field}:</strong> ` : ''}${item.message}</li>`).join('')}
                        </ul>
                    </div>
                `;
            };

            container.innerHTML = `
                <style>
                    #${containerId} {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                            width: 300px;
                            background: #fff;
                            border: 1px solid #ccc;
                            z-index: 10002;
                            padding: 10px;
                            box-shadow: 0 0 10px rgba(0,0,0,0.1);
                        }
                        .alert-group { margin: 10px 0; padding: 10px; border-radius: 4px; }
                        .alert-group.errors { background-color: #f8d7da; color: #721c24; }
                        .alert-group.warnings { background-color: #fff3cd; color: #856404; }
                        .alert-group.critical { background-color: #f5c6cb; color: #721c24; font-weight: bold; }
                        .alert-group ul { margin: 5px 0 0 20px; padding: 0; }
                    </style>
                    <h3>Alertas Clínicos</h3>
                    ${createAlertList('Erros Críticos', validationResults.criticalAlerts, 'critical')}
                    ${createAlertList('Erros de Preenchimento', validationResults.errors, 'errors')}
                    ${createAlertList('Avisos Clínicos', validationResults.warnings, 'warnings')}
                    <button onclick="this.parentElement.remove()">Fechar</button>
                `;
            }
        };
    
        window.ClinicalFormAssistant = ClinicalFormAssistant;
    })();