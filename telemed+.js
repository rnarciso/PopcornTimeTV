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
            const invasiveDevices = [formData.for_CVC === 'Sim' ? 'CVC' : null, formData.for_SVD === 'Sim' ? 'SVD' : null, ventSupport.includes('Ventilação mecânica invasiva') ? 'VM' : null].filter(Boolean);
            if (invasiveDevices.length >= 2 && !hasInfection) { results.warnings.push({ field: 'for_OpInfeccao', message: `Múltiplos dispositivos invasivos (${invasiveDevices.join(', ')}) - risco aumentado de infecção` }); }
        }
        calculateRiskScores(formData, results) {
            const sofaComponents = this.criticalFields.map(field => this.convertSofaToNumeric(formData[field], field)).filter(score => score !== null);
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
            try {
                // Check preferred storage first
                const preference = localStorage.getItem('apiKeyStoragePreference') || 'local';
                if (preference === 'local') {
                    const localKey = localStorage.getItem('openRouterApiKey');
                    if (localKey) return localKey;
                }
                
                // Fallback to session storage
                const sessionKey = sessionStorage.getItem('openRouterApiKey');
                if (sessionKey) return sessionKey;
                
                // Final fallback to volatile memory
                return (window.ClinicalFormAssistant && window.ClinicalFormAssistant._volatileKey) || null;
            } catch (e) {
                // Storage may be blocked; fall back to volatile memory
                return (window.ClinicalFormAssistant && window.ClinicalFormAssistant._volatileKey) || null;
            }
        },

        async getJsonFromLlm(textToProcess) {
            const masterPrompt = `Você é um assistente de IA especializado em extrair informações clínicas estruturadas de texto não estruturado. Sua tarefa é analisar a história clínica do paciente que será fornecida no próximo prompt e gerar um objeto JSON que resuma os dados do paciente e as recomendações clínicas relevantes.

Instruções Detalhadas:

1.  Análise do Texto: Leia atentamente a história clínica completa do paciente fornecida. Extraia informações demográficas, detalhes da admissão, histórico médico, narrativa clínica, medicamentos, funcionalidade e outros dados pertinentes.
2.  Geração do JSON: Crie um objeto JSON usando os nomes de campo do formulário fornecidos abaixo (prefixados com \`for_\`).
3.  Campos obrigatórios: A resposta JSON DEVE conter obrigatoriamente os seguintes campos: for_Admissa, for_ProblemasAtivos, for_SOFANeurologico, for_Sedacao, for_PresencaDor, for_DeliriumPresente, for_UsoVasopressor, for_UsoInotropicos, for_Vasodilatador, for_UsoAntiarritimicos, for_SOFACardio, for_SuporteVentilatorio, for_SOFARespiratorio, for_Nutrido, for_Hipergl, for_Hipogl, for_SOFAHepatico, for_AlteracaoEletrolitica, for_Dialise, for_SOFARenal, for_OpInfeccao, for_SOFAHemato, for_DrogasAjustadas, for_ReconciliacaoMedicamentosa, for_SVD, for_CVC, for_CateterArterial, for_Dreno, for_PacienteMobilizado, for_PeleIntegra, for_AltaPaciente, for_ClassificaoRecomendacoes (esta precisa obrigatoriamente ser preenchida para cada recomendação), for_AtendimentoFarmacia e for_PacienteWatcher,
4.  Formato Simplificado: Inclua todo os campos que são mandatórios SOMENTE os campos para os quais há informações relevantes na história clínica. NÃO inclua campos que seriam nulos, vazios ou "Não aplicável" com base no texto fornecido.
5.  Adesão aos Valores Permitidos: Para campos com opções predefinidas, você DEVE selecionar o valor mais apropriado clinicamente dentre as opções válidas listadas abaixo para esse campo específico. Se a informação exata não estiver presente, faça a melhor estimativa clínica com base no contexto (por exemplo, "responsiva" geralmente implica Glasgow 15) e, se apropriado, indique que é uma estimativa (ex: "(estimado)").
6.  Campos Condicionais: Preencha os campos condicionais apenas se a condição especificada for atendida pelo valor do campo pai. Por exemplo, \`for_SAVAS\` só deve ser incluído se \`for_PresencaDor\` for "Sim".
7.  Síntese e Resumo: Para campos como \`for_Admissa\`, \`for_FatosRelevantes\`, \`for_ProblemasAtivos\`, \`for_ComentarioSA\`, \`for_MetaHemodinamica\`, etc., sintetize as informações relevantes da história em um texto conciso e clinicamente apropriado.
8.  Recomendações Clínicas: Gere recomendações clínicas pertinentes com base na condição do paciente. Use o campo \`for_ClassificaoRecomendacoes\` para isso. Este campo deve ser um array de arrays, onde cada subarray contém dois strings: \`["Categoria da Recomendação", "Texto da Recomendação"]\`. Utilize exclusivamente as categorias listadas abaixo na seção "Restrições de Campos".
9.  Estimativas de SOFA: Se os dados exatos para calcular um componente do escore SOFA (Cardiovascular, Respiratório, Hepático, Renal, Hemato, Neurológico) não estiverem explicitamente declarados (ex: valor de bilirrubina, contagem de plaquetas, PaO2/FiO2), estime a categoria SOFA mais provável com base nos achados clínicos descritos (ex: icterícia, anúria, necessidade de O2, sangramento) e use a opção de valor correspondente da lista abaixo.
10.  Saída Final: A saída deve ser apenas o objeto JSON formatado corretamente, sem nenhum texto explicativo adicional, markdown ou comentários ao redor dele. Retorne APENAS o JSON válido.

Restrições de Campos e Opções Válidas:

* Escala Visual Analógica (for_SAVAS): (Aparece se for_PresencaDor="Sim") Opções: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
* Meta de PAM (Mínima) (for_PAMMin): Opções: 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120
* Meta de PAM (Máxima) (for_MetaMax): Opções: 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120
* Proteína (g/kg) (Não Obeso) (for_NaoObesoProteina): (Aparece se for_PacienteObeso="Não") Opções: 1,2, 1,3, 1,4, 1,5, 1,6, 1,7, 1,8, 1,9, 2,0
* Proteína (g/kg) (Obeso) (for_ObesoProteina): (Aparece se for_PacienteObeso="Sim") Opções: 1,2, 1,3, 1,4, 1,5, 1,6, 1,7, 1,8, 1,9, 2,0
* Justificativa enteral (for_MetaJustificativa): (Aparece se for_MetaAtingida="Não" e via enteral presente) Opções Múltiplas: Em progressão, Intolerância por naúsea e/ou vômitos, Distenção abdominal AE, Íleo adinâmico / Metabólico, Contraindicação cirúrgica, Outros
* Justificativa parenteral (for_MetaJustificativaParenteral): (Aparece se for_MetaAtingida="Não" e via parenteral presente) Opções Múltiplas: Em progressão, Distúrbio metabólico / Eletrolítico, Risco de síndrome de realimentação, Outros
* Recomendações (Classificação) (for_ClassificaoRecomendacoes): (Campo de texto livre após selecionar uma das categorias abaixo)
    * Categorias Válidas:
        * Balanço de fluidos, eletrólitos e função renal - Exames
        * Balanço de fluidos, eletrólitos e função renal - Medicamentos
        * Balanço de fluidos, eletrólitos e função renal - Orientações
        * Condições da pele - Exames
        * Condições da pele - Medicamentos
        * Condições da pele - Orientações
        * Dispositivos e procedimentos - Exames
        * Dispositivos e procedimentos - Medicamentos
        * Dispositivos e procedimentos - Orientações
        * Farmacologia clínica - Exames
        * Farmacologia clínica - Medicamentos
        * Farmacologia clínica - Orientações
        * Fluxo do paciente - Exames
        * Fluxo do paciente - Medicamentos
        * Fluxo do paciente - Orientações
        * Hematológico e infecção - Exames
        * Hematológico e infecção - Medicamentos
        * Hematológico e infecção - Orientações
        * Hemodinâmica - Exames
        * Hemodinâmica - Medicamentos
        * Hemodinâmica - Orientações
        * Mobilização - Exames
        * Mobilização - Medicamentos
        * Mobilização - Orientações
        * Neurológico - Exames
        * Neurológico - Medicamentos
        * Neurológico - Orientações
        * Profilaxias - Exames
        * Profilaxias - Medicamentos
        * Profilaxias - Orientações
        * Respiratório - Exames
        * Respiratório - Medicamentos
        * Respiratório - Orientações
        * Sedação, analgesia e delirium - Exames
        * Sedação, analgesia e delirium - Medicamentos
        * Sedação, analgesia e delirium - Orientações
        * Suporte e gerenciamento de conflito - Exames
        * Suporte e gerenciamento de conflito - Medicamentos
        * Suporte e gerenciamento de conflito - Orientações
        * Suporte nutricional e controle glicêmico - Exames
        * Suporte nutricional e controle glicêmico - Medicamentos
        * Suporte nutricional e controle glicêmico - Orientações
* SOFA Neuro (for_SOFANeurologico): Opções: 15, 13 a 14, 10 a 12, 6 a 9, <6
* Sedação (for_Sedacao): Opções: Sim, Não
* Interrupção/ajuste diária (for_InterrupcaoDiaria): (Aparece se for_Sedacao="Sim") Opções: Sim, Não
* Presença de dor (for_PresencaDor): Opções: Sim, Não
* Delirium Presente? (for_DeliriumPresente): Opções: Não há delirium, Delirium presente
* Uso de vasopressor (for_UsoVasopressor): Opções: Sim, Não
* Uso de Inotrópicos (for_UsoInotropicos): Opções: Sim, Não
* Uso de vasodilatador (for_Vasodilatador): Opções: Sim, Não
* Uso de Antiarritimicos (for_UsoAntiarritimicos): Opções: Sim, Não
* SOFA Cardiovascular (for_SOFACardio): Opções: Sem hipotensão, PAM < 70mmhg, Dopa > 5 ou dobuta qq dose, Dopa >15 ou Nora/Adr > 0.01, Nora/Adr > 0.1
* Candidato a teste respiração espontânea (for_CandidatoTRE): (Aparece se for_SuporteVentilatorio incluir "Ventilação mecânica invasiva") Opções: Sim, Não
* SOFA Respiratória (for_SOFARespiratorio): Opções: >= 400, 300-399, 200-299, 100-199 + suplem. Vent., <100 + suplem. Vent.
* O paciente está sendo nutrido (for_Nutrido): Opções: Sim, Não
* Paciente obeso (for_PacienteObeso): (Aparece se for_ViaNutricao for Enteral/Parenteral) Opções: Sim, Não
* Dieta disponível (densidade calórica) (Não Obeso) (for_NaoObesoDieta): (Aparece se for_PacienteObeso="Não") Opções: 1,0, 1,5
* Dieta disponível (densidade calórica) (Obeso) (for_ObesoDieta): (Aparece se for_PacienteObeso="Sim") Opções: 1,0, 1,5
* Meta atingida (for_MetaAtingida): (Aparece se for_Nutrido="Sim") Opções: Sim, Não
* Eliminações intestinais (for_EliminacoesIntestinais): Opções: Presente, Ausente
* Característica (Eliminações Intestinais) (for_Eliminacoes): (Aparece se for_EliminacoesIntestinais="Presente") Opções: Normal, Fezes líquidas, Melena, Enterorragia
* Quantas dias sem evacuação (for_QuantasSemEvacuacao): (Aparece se for_EliminacoesIntestinais="Ausente") Opções: >= 3 dias, < 3 dias
* O paciente apresentou dois ou mais glicemias > 180 mg/dl em 24 horas? (for_Hipergl): Opções: Sim, Não
* Protocolo de insulina (for_ProtocoloInsulinico): (Aparece se for_Hipergl="Sim") Opções: Subcutâneo, Intravenoso, Nenhum
* Um ou mais controles glicêmicos < 60 mg/dl (for_Hipogl): Opções: Sim, Não
* SOFA Hepático (for_SOFAHepatico): Opções: < 1,2, 1,2 - 1,9, 2,0 - 5,9, 6,0 - 11,9, >= 12
* Alteração Eletrolítica (for_AlteracaoEletrolitica): Opções: Sim, Não
* Em diálise (for_Dialise): Opções: Sim, Não
* Qual o método (Diálise) (for_MetodoDialise): (Aparece se for_Dialise="Sim") Opções: Continua, Intermitente, CAPD
* SOFA Renal (for_SOFARenal): Opções: < 1,2, 1,2 - 1,9, 2,0 - 3,4, 3,5 - 4,9 ou 500ml/24h, >= 5 ou <= 200ml/24h
* Antibioticoterapia (for_AntiTerapia): Opções: Terapêutica, Profilática, Sem antibiótico
* Infecção (for_OpInfeccao): Opções: Sim, Não
* Guiado por cultura? (for_GuiadoCultura): (Aparece se for_OpInfeccao="Sim") Opções: Sim, Não
* SOFA Hemato (for_SOFAHemato): Opções: >= 150, 100 - 149, 50 - 99, 20 - 49, <20
* As drogas foram ajustadas para funçao renal (for_DrogasAjustadas): Opções: Sim, Não, Não se aplica
* Reconciliação medicamentosa (for_ReconciliacaoMedicamentosa): Opções: Total, Parcial, Não, Não se aplica
* Interação Medicamentosa (for_TipoReconciliacaoMedicamentosa): (Aparece se for_ReconciliacaoMedicamentosa="Total" ou "Parcial") Opções: Sim, Não, Não se aplica
* Sonda vesical de demora (for_SVD): Opções: Sim, Não
* Pode ser removido (SVD) (for_SVDRemocao): (Aparece se for_SVD="Sim") Opções: Sim, Não
* Cateter Venoso Central (for_CVC): Opções: Sim, Não
* Pode ser removido (CVC) (for_CVCRemocao): (Aparece se for_CVC="Sim") Opções: Sim, Não
* Há cateter arterial (for_CateterArterial): Opções: Sim, Não
* Pode ser removido (Cateter Arterial) (for_ArterialRemocao): (Aparece se for_CateterArterial="Sim") Opções: Sim, Não
* Há dreno(s) (for_Dreno): Opções: Sim, Não
* Pode ser removido (Dreno) (for_DrenoRemocao): (Aparece se for_Dreno="Sim") Opções: Sim, Não
* Tem indicação de profilaxia gástrica? (for_ProfilaxiaGastrica): Opções: Sim, Não
* Está em uso? (Profilaxia Gástrica) (for_ProfilaxiaEmUSO): Opções: Sim, Não
* Tem indicação de profilaxia de TEV? (for_ProfilaxiaTEV): Opções: Sim, Não
* Está em uso? (Profilaxia TEV) (for_ProfilaxiaTEVEmUSO): Opções: Sim, Não, Contra-indicado
* Paciente pode ser mobilizado? (for_PacienteMobilizado): Opções: Sim, Não
* Pele íntegra (for_PeleIntegra): Opções: Sim, Não
* Lesões de pele (for_LesoesPele): (Aparece se for_PeleIntegra="Não") Opções Múltiplas: UP - Úlcera de pressão, DAI - Dermatite associada a incontinência, Deiscência de ferida operatória, Outro (especificar no texto)
* Limitação terapêutica (for_Limitacao): Opções: Sim, Não
* Paciente pode receber alta (for_AltaPaciente): Opções: Sim, Não
* Paciente necessita de atendimento com a equipe da farmácia? (for_AtendimentoFarmacia): Opções: Sim, Não
* Paciente watcher (for_PacienteWatcher): Opções: Sim, Não`;

            // Resolve model list from the preferred storage, with fallback to the other storage and a safe default
            const preferredStorageObj = localStorage.getItem('apiKeyStoragePreference') === 'local' ? localStorage : sessionStorage;
            const modelsRaw = preferredStorageObj.getItem('llmModels')
                || localStorage.getItem('llmModels')
                || sessionStorage.getItem('llmModels');
            const models = JSON.parse(modelsRaw || '[]');
            if (!Array.isArray(models) || models.length === 0) {
                // default fallbacks
                models.splice(0, models.length, 'openai/gpt-3.5-turbo', 'mistralai/mistral-7b-instruct:free');
            }

            let apiKey = this.getApiKey();
            if (!apiKey) {
                this.updateStatus('Chave da API não configurada.', 'error');
                alert("Chave da API não encontrada. Por favor, configure-a.");
                return null;
            }

            for (let i = 0; i < models.length; i++) {
                const model = models[i];
                this.updateStatus(`Tentando modelo ${i + 1}/${models.length}: ${model}...`, 'loading');
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
                    
                    this.updateStatus('Sucesso! Processando JSON...', 'success');
                    const data = await response.json();
                    let jsonString = data.choices[0].message.content;
                    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
                    if (jsonMatch) { jsonString = jsonMatch[0]; }
                    
                    setTimeout(() => this.updateStatus('', 'idle'), 2500);
                    return JSON.parse(jsonString);

                } catch (error) {
                    console.error(error);
                    if (i < models.length - 1) {
                        this.updateStatus(`Falha com ${model}. Tentando próximo...`, 'loading');
                    } else {
                        const finalErrorMessage = error.message.includes('401') ? error.message : `Todos os modelos falharam. Erro final: ${error.message.substring(0, 150)}...`;
                        this.updateStatus(finalErrorMessage, 'error');
                        alert(finalErrorMessage);
                        return null;
                    }
                }
            }
        },

        populateForm(formId, formDataToRestore, callback) {
            return new Promise((resolve, reject) => {
                const form = document.getElementById(formId);
                if (!form) {
                    const error = `Erro: Form #${formId} ?`;
                    alert(error);
                    if (callback) callback(false, error);
                    reject(error);
                    return;
                }
                if (!formDataToRestore || typeof formDataToRestore !== 'object') {
                    const error = "Dados inválidos.";
                    alert(error);
                    if (callback) callback(false, error);
                    reject(error);
                    return;
                }
                
                const defaultValues = { "for_Admissa": "", "for_ProblemasAtivos": "", "for_SOFANeurologico": "10 a 12", "for_Sedacao": "Não", "for_PresencaDor": "Não", "for_DeliriumPresente": "Não há delirium", "for_UsoVasopressor": "Não", "for_UsoInotropicos": "Não", "for_Vasodilatador": "Não", "for_UsoAntiarritimicos": "Não", "for_SOFACardio": "Sem hipotensão", "for_SuporteVentilatorio": ["Ventilação mecânica invasiva"], "for_SOFARespiratorio": "200-299", "for_Nutrido": "Sim", "for_MetaAtingida": "Não", "for_MetaJustificativa": ["Em progressão"], "for_MetaJustificativaParenteral": ["Em progressão"], "for_Hipergl": "Não", "for_Hipogl": "Não", "for_SOFAHepatico": "< 1,2", "for_AlteracaoEletrolitica": "Não", "for_Dialise": "Não", "for_SOFARenal": "< 1,2", "for_OpInfeccao": "Não", "for_SOFAHemato": ">= 150", "for_DrogasAjustadas": "Não se aplica", "for_ReconciliacaoMedicamentosa": "Total", "for_SVD": "Sim", "for_CVC": "Sim", "for_CateterArterial": "Não", "for_Dreno": "Não", "for_PacienteMobilizado": "Não", "for_PeleIntegra": "Sim", "for_AltaPaciente": "Não", "for_ClassificaoRecomendacoes": [], "for_AtendimentoFarmacia": "Não", "for_PacienteWatcher": "Não" };
                for (const fieldName in defaultValues) { if (!formDataToRestore.hasOwnProperty(fieldName)) { formDataToRestore[fieldName] = defaultValues[fieldName]; } }
                
                form.querySelectorAll('.selectMultText').forEach(comp=>{const r=comp.querySelectorAll(':scope > div');for(let i=r.length-1;i>0;i--){const b=r[i].querySelector('button.btn-danger');if(b)b.click();else r[i].remove();}if(r[0]){const s=r[0].querySelector('select'),t=r[0].querySelector('input.multText');if(s)s.value='';if(t)t.value='';}});
                form.querySelectorAll('.ng-matrix').forEach(m=>{const r=m.querySelectorAll('tbody > tr');for(let i=r.length-1;i>0;i--){const b=r[i].querySelector('button.btn-danger');if(b)b.click();else r[i].remove();}if(r[0]){r[0].querySelectorAll('input').forEach(inp=>inp.value='');}});

                (async () => {
                    try {
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
                                            await this.simulateUltimateInteraction(select);
                                            if (typeof $ !== 'undefined' && $(select).data('chosen')) { $(select).trigger('chosen:updated'); }
                                        }
                                        if (textInput) {
                                            textInput.value = pair?.[1] ?? '';
                                            await this.simulateUltimateInteraction(textInput);
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
                        
                        // Success - call callback and resolve promise
                        if (callback) callback(true, "Formulário populado com sucesso!");
                        resolve("Formulário populado com sucesso!");
                    } catch (error) {
                        // Error - call callback and reject promise
                        if (callback) callback(false, error.message);
                        reject(error);
                    }
                })();
            });
        },

        extractFormFields(formId) {
            const form = document.getElementById(formId);
            if (!form) return { fields: [], requiredFields: [] };
            
            const fields = [];
            const requiredFields = [];
            
            const elements = form.querySelectorAll('input:not([type="button"]), select, textarea');
            elements.forEach(element => {
                const name = element.name;
                if (!name || element.disabled) return;
                
                fields.push(name);
                
                // Check if element has fb-required attribute
                if (element.hasAttribute('fb-required') ||
                    element.getAttribute('required') === 'required' ||
                    element.getAttribute('aria-required') === 'true') {
                    requiredFields.push(name);
                }
            });
            
            return { fields, requiredFields };
        },

        showUnifiedImportModal(targetFormId) {
            const modal = this.createModalContainer('unified-import-modal', '500px');
            const { contentArea, footer, setProcessing } = this.createModalLayout(modal, "Importar Dados");
            
            // Scrollable content area
            const scrollableContent = document.createElement('div');
            scrollableContent.style.maxHeight = '400px';
            scrollableContent.style.overflowY = 'auto';
            scrollableContent.style.paddingRight = '10px';
            scrollableContent.style.marginBottom = '15px';
            
            // Import options container
            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'cfa-import-options';
            optionsContainer.style.display = 'flex';
            optionsContainer.style.flexDirection = 'column';
            optionsContainer.style.gap = '10px';
            
            // Option 1: Import from clipboard
            const clipboardOption = document.createElement('div');
            clipboardOption.className = 'cfa-import-option';
            clipboardOption.innerHTML = `
                <button type="button" class="cfa-button cfa-button-secondary" id="importFromClipboardBtn">
                    📋 Importar da Área de Transferência
                </button>
            `;
            optionsContainer.appendChild(clipboardOption);
            
            // Option 2: Import from text window
            const textWindowOption = document.createElement('div');
            textWindowOption.className = 'cfa-import-option';
            textWindowOption.innerHTML = `
                <button type="button" class="cfa-button cfa-button-secondary" id="openTextWindowBtn">
                    📝 Importar de Caixa de Texto
                </button>
            `;
            optionsContainer.appendChild(textWindowOption);
            
            // Option 3: Import from JSON file
            const jsonFileOption = document.createElement('div');
            jsonFileOption.className = 'cfa-import-option';
            jsonFileOption.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="file" id="jsonFileInput" accept=".json" style="display: none;">
                    <button type="button" class="cfa-button cfa-button-secondary" onclick="document.getElementById('jsonFileInput').click()">
                        📁 Importar de Arquivo JSON
                    </button>
                </div>
                <div id="jsonFileName" style="margin-top: 5px; font-size: 12px; color: #666;"></div>
            `;
            optionsContainer.appendChild(jsonFileOption);
            
            scrollableContent.appendChild(optionsContainer);
            contentArea.appendChild(scrollableContent);
            
            // Text area for text window input (initially hidden)
            const textArea = document.createElement('textarea');
            textArea.id = 'importTextArea';
            textArea.placeholder = "Digite ou cole o texto do paciente aqui...";
            textArea.className = 'cfa-textarea';
            textArea.style.display = 'none';
            textArea.style.minHeight = '200px';
            textArea.style.resize = 'vertical';
            contentArea.appendChild(textArea);
            
            // Process button (initially hidden)
            const btnProcess = this.createButton('Processar', 'primary', async () => {
                const text = textArea.value;
                if (!text.trim()) return alert("Área de texto vazia.");
                
                setProcessing(true);
                let jsonData;
                try {
                    jsonData = JSON.parse(text);
                } catch (e) {
                    // Extract form field information for AI prompt
                    const formInfo = this.extractFormFields(targetFormId);
                    const useAdaptivePrompt = localStorage.getItem('adaptivePrompt') !== 'false';
                    const enhancedPrompt = this.createEnhancedPrompt(text, formInfo, useAdaptivePrompt);
                    jsonData = await this.getJsonFromLlmWithPrompt(enhancedPrompt);
                    
                    // Check if JSON preview should be shown
                    const showJsonPreview = localStorage.getItem('showAiJson') !== 'false';
                    
                    if (showJsonPreview) {
                        // Show JSON before applying
                        const jsonPreview = confirm(`JSON gerado pela IA:\n\n${JSON.stringify(jsonData, null, 2)}\n\nDeseja aplicar este JSON ao formulário?`);
                        if (!jsonPreview) {
                            jsonData = null; // Don't apply if user cancels
                        }
                    }
                }
                
                if (jsonData) {
                    try {
                        this.populateForm(targetFormId, jsonData, (success, message) => {
                            if (success) {
                                alert(message);
                            } else {
                                alert(`Erro ao popular o formulário: ${message}`);
                            }
                        }).catch(error => {
                            alert(`Erro ao popular o formulário: ${error.message}`);
                        });
                    } catch (populateError) {
                        alert(`Erro ao popular o formulário: ${populateError.message}`);
                    }
                }
                setProcessing(false);

                // Conditionally validate medical data if the option is enabled
                const enableMedicalValidator = localStorage.getItem('enableMedicalValidator') !== 'false';
                if (jsonData && enableMedicalValidator) {
                    const validator = new this.EnhancedMedicalValidator();
                    const validationResults = validator.validate(jsonData); // Use jsonData as it contains the form data
                    this.showConfirmationScreen(targetFormId, jsonData, validationResults, modal, text);
                }
            });
            btnProcess.style.display = 'none';
            footer.appendChild(this.createButton('Fechar', 'secondary', () => modal.remove()));
            footer.appendChild(btnProcess);
            
            document.body.appendChild(modal);
            
            // Event handlers (after modal is added to DOM)
            setTimeout(() => {
                const jsonFileInput = document.getElementById('jsonFileInput');
                const jsonFileName = document.getElementById('jsonFileName');
                const importFromClipboardBtn = document.getElementById('importFromClipboardBtn');
                const openTextWindowBtn = document.getElementById('openTextWindowBtn');
                const importTextArea = document.getElementById('importTextArea');
                
                if (jsonFileInput) {
                    // JSON file import
                    jsonFileInput.addEventListener('change', async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        
                        if (jsonFileName) jsonFileName.textContent = `Arquivo selecionado: ${file.name}`;
                        const text = await file.text();
                        try {
                            const jsonData = JSON.parse(text);
                            this.populateForm(targetFormId, jsonData, (success, message) => {
                                modal.remove();
                                if (success) {
                                    alert(message);
                                } else {
                                    alert(`Erro ao popular o formulário: ${message}`);
                                }
                                const enableMedicalValidator = localStorage.getItem('enableMedicalValidator') !== 'false';
                                if (enableMedicalValidator) {
                                    const validator = new this.EnhancedMedicalValidator();
                                    const validationResults = validator._validateFormData(jsonData);
                                    this.showConfirmationScreen(targetFormId, jsonData, validationResults, null, text);
                                }
                            }).catch(error => {
                                modal.remove();
                                alert(`Erro ao popular o formulário: ${error.message}`);
                            });
                        } catch (e) {
                            alert(`Erro ao processar o arquivo JSON: ${e.message}`);
                        }
                    });
                }
                
                if (importFromClipboardBtn) {
                    // Clipboard import - automatically read from clipboard
                    importFromClipboardBtn.addEventListener('click', async () => {
                        try {
                            const text = await navigator.clipboard.readText();
                            if (text.trim()) {
                                try {
                                    // Try to parse as JSON first
                                    const jsonData = JSON.parse(text);
                                    this.populateForm(targetFormId, jsonData, (success, message) => {
                                        modal.remove();
                                        if (success) {
                                            alert(message);
                                        } else {
                                            alert(`Erro ao popular o formulário: ${message}`);
                                        }
                                        const enableMedicalValidator = localStorage.getItem('enableMedicalValidator') !== 'false';
                                        if (enableMedicalValidator) {
                                            const validator = new this.EnhancedMedicalValidator();
                                            const validationResults = validator._validateFormData(jsonData);
                                            this.showConfirmationScreen(targetFormId, jsonData, validationResults, null, text);
                                        }
                                    }).catch(error => {
                                        modal.remove();
                                        alert(`Erro ao popular o formulário: ${error.message}`);
                                    });
                                } catch (e) {
                                    // If not JSON, offer AI transformation
                                    if (confirm('O conteúdo da área de transferência não parece ser JSON. Deseja usar IA para transformar em JSON?')) {
                                        try {
                                            const formInfo = this.extractFormFields(targetFormId);
                                            const useAdaptivePrompt = localStorage.getItem('adaptivePrompt') !== 'false';
                                            const enhancedPrompt = this.createEnhancedPrompt(text, formInfo, useAdaptivePrompt);
                                            const jsonData = await this.getJsonFromLlmWithPrompt(enhancedPrompt);
                                            
                                            // Check if JSON preview should be shown
                                            const showJsonPreview = localStorage.getItem('showAiJson') !== 'false';
                                            
                                            if (showJsonPreview) {
                                                // Show JSON before applying
                                                const jsonPreview = confirm(`JSON gerado pela IA:\n\n${JSON.stringify(jsonData, null, 2)}\n\nDeseja aplicar este JSON ao formulário?`);
                                                if (jsonPreview) {
                                                    try {
                                                        try {
                                                            this.populateForm(targetFormId, jsonData, (success, message) => {
                                                                modal.remove();
                                                                if (success) {
                                                                    alert(message);
                                                                } else {
                                                                    alert(`Erro ao popular o formulário: ${message}`);
                                                                }
                                                                const enableMedicalValidator = localStorage.getItem('enableMedicalValidator') !== 'false';
                                                                if (enableMedicalValidator) {
                                                                    const validator = new this.EnhancedMedicalValidator();
                                                                    const validationResults = validator._validateFormData(jsonData);
                                                                    this.showConfirmationScreen(targetFormId, jsonData, validationResults, null, text);
                                                                }
                                                            }).catch(error => {
                                                                modal.remove();
                                                                alert(`Erro ao popular o formulário: ${error.message}`);
                                                            });
                                                        } catch (populateError) {
                                                            alert(`Erro ao popular o formulário: ${populateError.message}`);
                                                        }
                                                    } catch (populateError) {
                                                        alert(`Erro ao popular o formulário: ${populateError.message}`);
                                                    }
                                                }
                                            } else {
                                                // Apply JSON directly without preview
                                                this.populateForm(targetFormId, jsonData, (success, message) => {
                                                    modal.remove();
                                                    if (success) {
                                                        alert(message);
                                                    } else {
                                                        alert(`Erro ao popular o formulário: ${message}`);
                                                    }
                                                    const enableMedicalValidator = localStorage.getItem('enableMedicalValidator') !== 'false';
                                                    if (enableMedicalValidator) {
                                                        const validator = new this.EnhancedMedicalValidator();
                                                        const validationResults = validator._validateFormData(jsonData);
                                                        this.showConfirmationScreen(targetFormId, jsonData, validationResults, null, text);
                                                    }
                                                }).catch(error => {
                                                    modal.remove();
                                                    alert(`Erro ao popular o formulário: ${error.message}`);
                                                });
                                            }
                                        } catch (aiError) {
                                            alert(`Erro ao processar com IA: ${aiError.message}`);
                                        }
                                    }
                                }
                            } else {
                                alert('A área de transferência está vazia.');
                            }
                        } catch (clipboardError) {
                            alert('Não foi possível acessar a área de transferência. Por favor, use a opção de janela de texto.');
                        }
                    });
                }
                
                if (openTextWindowBtn) {
                    // Text window import
                    openTextWindowBtn.addEventListener('click', () => {
                        textArea.style.display = 'block';
                        btnProcess.style.display = 'inline-block';
                        textArea.focus();
                    });
                }
            }, 100);
        },

        getStandard2025Fields() {
            return {
                fields: [
                    'Admissa', 'ProblemasAtivos', 'SOFANeurologico', 'Sedacao', 'PresencaDor',
                    'DeliriumPresente', 'UsoVasopressor', 'UsoInotropicos', 'Vasodilatador',
                    'UsoAntiarritimicos', 'SOFACardio', 'SuporteVentilatorio', 'SOFARespiratorio',
                    'Nutrido', 'Hipergl', 'Hipogl', 'SOFAHepatico', 'AlteracaoEletrolitica',
                    'Dialise', 'SOFARenal', 'OpInfeccao', 'SOFAHemato', 'DrogasAjustadas',
                    'ReconciliacaoMedicamentosa', 'SVD', 'CVC', 'CateterArterial', 'Dreno',
                    'PacienteMobilizado', 'PeleIntegra', 'AltaPaciente', 'ClassificaoRecomendacoes',
                    'AtendimentoFarmacia', 'PacienteWatcher'
                ],
                requiredFields: [
                    'Admissa', 'ProblemasAtivos', 'SOFANeurologico', 'Sedacao', 'PresencaDor',
                    'DeliriumPresente', 'UsoVasopressor', 'UsoInotropicos', 'Vasodilatador',
                    'UsoAntiarritimicos', 'SOFACardio', 'SuporteVentilatorio', 'SOFARespiratorio',
                    'Nutrido', 'Hipergl', 'Hipogl', 'SOFAHepatico', 'AlteracaoEletrolitica',
                    'Dialise', 'SOFARenal', 'OpInfeccao', 'SOFAHemato', 'DrogasAjustadas',
                    'ReconciliacaoMedicamentosa', 'SVD', 'CVC', 'CateterArterial', 'Dreno',
                    'PacienteMobilizado', 'PeleIntegra', 'AltaPaciente', 'ClassificaoRecomendacoes',
                    'AtendimentoFarmacia', 'PacienteWatcher'
                ]
            };
        },

        createEnhancedPrompt(text, formInfo, useAdaptive = true) {
            const fieldsList = useAdaptive ? formInfo.fields.join(', ') : this.getStandard2025Fields().fields.join(', ');
            const requiredFieldsList = useAdaptive ? formInfo.requiredFields.join(', ') : this.getStandard2025Fields().requiredFields.join(', ');
            
            let enhancedPrompt = `Você é um assistente de IA especializado em extrair informações clínicas estruturadas de texto não estruturado. Sua tarefa é analisar a história clínica do paciente que será fornecida no próximo prompt e gerar um objeto JSON que resuma os dados do paciente e as recomendações clínicas relevantes.

Campos disponíveis no formulário: ${fieldsList}

Campos obrigatórios: ${requiredFieldsList || 'Nenhum campo obrigatório identificado'}

Instruções Detalhadas:

1.  Análise do Texto: Leia atentamente a história clínica completa do paciente fornecida. Extraia informações demográficas, detalhes da admissão, histórico médico, narrativa clínica, medicamentos, funcionalidade e outros dados pertinentes.
2.  Geração do JSON: Crie um objeto JSON usando os nomes de campo do formulário fornecidos acima (prefixados com \`for_\`).
3.  Campos obrigatórios: A resposta JSON DEVE conter obrigatoriamente os seguintes campos: for_Admissa, for_ProblemasAtivos, for_SOFANeurologico, for_Sedacao, for_PresencaDor, for_DeliriumPresente, for_UsoVasopressor, for_UsoInotropicos, for_Vasodilatador, for_UsoAntiarritimicos, for_SOFACardio, for_SuporteVentilatorio, for_SOFARespiratorio, for_Nutrido, for_Hipergl, for_Hipogl, for_SOFAHepatico, for_AlteracaoEletrolitica, for_Dialise, for_SOFARenal, for_OpInfeccao, for_SOFAHemato, for_DrogasAjustadas, for_ReconciliacaoMedicamentosa, for_SVD, for_CVC, for_CateterArterial, for_Dreno, for_PacienteMobilizado, for_PeleIntegra, for_AltaPaciente, for_ClassificaoRecomendacoes (esta precisa obrigatoriamente ser preenchida para cada recomendação), for_AtendimentoFarmacia e for_PacienteWatcher,
4.  Formato Simplificado: Inclua todo os campos que são mandatórios SOMENTE os campos para os quais há informações relevantes na história clínica. NÃO inclua campos que seriam nulos, vazios ou "Não aplicável" com base no texto fornecido.
5.  Adesão aos Valores Permitidos: Para campos com opções predefinidas, você DEVE selecionar o valor mais apropriado clinicamente dentre as opções válidas listadas abaixo para esse campo específico. Se a informação exata não estiver presente, faça a melhor estimativa clínica com base no contexto (por exemplo, "responsiva" geralmente implica Glasgow 15) e, se apropriado, indique que é uma estimativa (ex: "(estimado)").
6.  Campos Condicionais: Preencha os campos condicionais apenas se a condição especificada for atendida pelo valor do campo pai. Por exemplo, \`for_SAVAS\` só deve ser incluído se \`for_PresencaDor\` for "Sim".
7.  Síntese e Resumo: Para campos como \`for_Admissa\`, \`for_FatosRelevantes\`, \`for_ProblemasAtivos\`, \`for_ComentarioSA\`, \`for_MetaHemodinamica\`, etc., sintetize as informações relevantes da história em um texto conciso e clinicamente apropriado.
8.  Recomendações Clínicas: Gere recomendações clínicas pertinentes com base na condição do paciente. Use o campo \`for_ClassificaoRecomendacoes\` para isso. Este campo deve ser um array de arrays, onde cada subarray contém dois strings: \`["Categoria da Recomendação", "Texto da Recomendação"]\`. Utilize exclusivamente as categorias listadas abaixo na seção "Restrições de Campos".
9.  Estimativas de SOFA: Se os dados exatos para calcular um componente do escore SOFA (Cardiovascular, Respiratório, Hepático, Renal, Hemato, Neurológico) não estiverem explicitamente declarados (ex: valor de bilirrubina, contagem de plaquetas, PaO2/FiO2), estime a categoria SOFA mais provável com base nos achados clínicos descritos (ex: icterícia, anúria, necessidade de O2, sangramento) e use a opção de valor correspondente da lista abaixo.
10.  Saída Final: A saída deve ser apenas o objeto JSON formatado corretamente, sem nenhum texto explicativo adicional, markdown ou comentários ao redor dele. Retorne APENAS o JSON válido.

Restrições de Campos e Opções Válidas:

* Escala Visual Analógica (for_SAVAS): (Aparece se for_PresencaDor="Sim") Opções: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
* Meta de PAM (Mínima) (for_PAMMin): Opções: 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120
* Meta de PAM (Máxima) (for_MetaMax): Opções: 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120
* Proteína (g/kg) (Não Obeso) (for_NaoObesoProteina): (Aparece se for_PacienteObeso="Não") Opções: 1,2, 1,3, 1,4, 1,5, 1,6, 1,7, 1,8, 1,9, 2,0
* Proteína (g/kg) (Obeso) (for_ObesoProteina): (Aparece se for_PacienteObeso="Sim") Opções: 1,2, 1,3, 1,4, 1,5, 1,6, 1,7, 1,8, 1,9, 2,0
* Justificativa enteral (for_MetaJustificativa): (Aparece se for_MetaAtingida="Não" e via enteral presente) Opções Múltiplas: Em progressão, Intolerância por naúsea e/ou vômitos, Distenção abdominal AE, Íleo adinâmico / Metabólico, Contraindicação cirúrgica, Outros
* Justificativa parenteral (for_MetaJustificativaParenteral): (Aparece se for_MetaAtingida="Não" e via parenteral presente) Opções Múltiplas: Em progressão, Distúrbio metabólico / Eletrolítico, Risco de síndrome de realimentação, Outros
* Recomendações (Classificação) (for_ClassificaoRecomendacoes): (Campo de texto livre após selecionar uma das categorias abaixo)
    * Categorias Válidas:
        * Balanço de fluidos, eletrólitos e função renal - Exames
        * Balanço de fluidos, eletrólitos e função renal - Medicamentos
        * Balanço de fluidos, eletrólitos e função renal - Orientações
        * Condições da pele - Exames
        * Condições da pele - Medicamentos
        * Condições da pele - Orientações
        * Dispositivos e procedimentos - Exames
        * Dispositivos e procedimentos - Medicamentos
        * Dispositivos e procedimentos - Orientações
        * Farmacologia clínica - Exames
        * Farmacologia clínica - Medicamentos
        * Farmacologia clínica - Orientações
        * Fluxo do paciente - Exames
        * Fluxo do paciente - Medicamentos
        * Fluxo do paciente - Orientações
        * Hematológico e infecção - Exames
        * Hematológico e infecção - Medicamentos
        * Hematológico e infecção - Orientações
        * Hemodinâmica - Exames
        * Hemodinâmica - Medicamentos
        * Hemodinâmica - Orientações
        * Mobilização - Exames
        * Mobilização - Medicamentos
        * Mobilização - Orientações
        * Neurológico - Exames
        * Neurológico - Medicamentos
        * Neurológico - Orientações
        * Profilaxias - Exames
        * Profilaxias - Medicamentos
        * Profilaxias - Orientações
        * Respiratório - Exames
        * Respiratório - Medicamentos
        * Respiratório - Orientações
        * Sedação, analgesia e delirium - Exames
        * Sedação, analgesia e delirium - Medicamentos
        * Sedação, analgesia e delirium - Orientações
        * Suporte e gerenciamento de conflito - Exames
        * Suporte e gerenciamento de conflito - Medicamentos
        * Suporte e gerenciamento de conflito - Orientações
        * Suporte nutricional e controle glicêmico - Exames
        * Suporte nutricional e controle glicêmico - Medicamentos
        * Suporte nutricional e controle glicêmico - Orientações
* SOFA Neuro (for_SOFANeurologico): Opções: 15, 13 a 14, 10 a 12, 6 a 9, <6
* Sedação (for_Sedacao): Opções: Sim, Não
* Interrupção/ajuste diária (for_InterrupcaoDiaria): (Aparece se for_Sedacao="Sim") Opções: Sim, Não
* Presença de dor (for_PresencaDor): Opções: Sim, Não
* Delirium Presente? (for_DeliriumPresente): Opções: Não há delirium, Delirium presente
* Uso de vasopressor (for_UsoVasopressor): Opções: Sim, Não
* Uso de Inotrópicos (for_UsoInotropicos): Opções: Sim, Não
* Uso de vasodilatador (for_Vasodilatador): Opções: Sim, Não
* Uso de Antiarritimicos (for_UsoAntiarritimicos): Opções: Sim, Não
* SOFA Cardiovascular (for_SOFACardio): Opções: Sem hipotensão, PAM < 70mmhg, Dopa > 5 ou dobuta qq dose, Dopa >15 ou Nora/Adr > 0.01, Nora/Adr > 0.1
* Candidato a teste respiração espontânea (for_CandidatoTRE): (Aparece se for_SuporteVentilatorio incluir "Ventilação mecânica invasiva") Opções: Sim, Não
* SOFA Respiratória (for_SOFARespiratorio): Opções: >= 400, 300-399, 200-299, 100-199 + suplem. Vent., <100 + suplem. Vent.
* O paciente está sendo nutrido (for_Nutrido): Opções: Sim, Não
* Paciente obeso (for_PacienteObeso): (Aparece se for_ViaNutricao for Enteral/Parenteral) Opções: Sim, Não
* Dieta disponível (densidade calórica) (Não Obeso) (for_NaoObesoDieta): (Aparece se for_PacienteObeso="Não") Opções: 1,0, 1,5
* Dieta disponível (densidade calórica) (Obeso) (for_ObesoDieta): (Aparece se for_PacienteObeso="Sim") Opções: 1,0, 1,5
* Meta atingida (for_MetaAtingida): (Aparece se for_Nutrido="Sim") Opções: Sim, Não
* Eliminações intestinais (for_EliminacoesIntestinais): Opções: Presente, Ausente
* Característica (Eliminações Intestinais) (for_Eliminacoes): (Aparece se for_EliminacoesIntestinais="Presente") Opções: Normal, Fezes líquidas, Melena, Enterorragia
* Quantas dias sem evacuação (for_QuantasSemEvacuacao): (Aparece se for_EliminacoesIntestinais="Ausente") Opções: >= 3 dias, < 3 dias
* O paciente apresentou dois ou mais glicemias > 180 mg/dl em 24 horas? (for_Hipergl): Opções: Sim, Não
* Protocolo de insulina (for_ProtocoloInsulinico): (Aparece se for_Hipergl="Sim") Opções: Subcutâneo, Intravenoso, Nenhum
* Um ou mais controles glicêmicos < 60 mg/dl (for_Hipogl): Opções: Sim, Não
* SOFA Hepático (for_SOFAHepatico): Opções: < 1,2, 1,2 - 1,9, 2,0 - 5,9, 6,0 - 11,9, >= 12
* Alteração Eletrolítica (for_AlteracaoEletrolitica): Opções: Sim, Não
* Em diálise (for_Dialise): Opções: Sim, Não
* Qual o método (Diálise) (for_MetodoDialise): (Aparece se for_Dialise="Sim") Opções: Continua, Intermitente, CAPD
* SOFA Renal (for_SOFARenal): Opções: < 1,2, 1,2 - 1,9, 2,0 - 3,4, 3,5 - 4,9 ou 500ml/24h, >= 5 ou <= 200ml/24h
* Antibioticoterapia (for_AntiTerapia): Opções: Terapêutica, Profilática, Sem antibiótico
* Infecção (for_OpInfeccao): Opções: Sim, Não
* Guiado por cultura? (for_GuiadoCultura): (Aparece se for_OpInfeccao="Sim") Opções: Sim, Não
* SOFA Hemato (for_SOFAHemato): Opções: >= 150, 100 - 149, 50 - 99, 20 - 49, <20
* As drogas foram ajustadas para funçao renal (for_DrogasAjustadas): Opções: Sim, Não, Não se aplica
* Reconciliação medicamentosa (for_ReconciliacaoMedicamentosa): Opções: Total, Parcial, Não, Não se aplica
* Interação Medicamentosa (for_TipoReconciliacaoMedicamentosa): (Aparece se for_ReconciliacaoMedicamentosa="Total" ou "Parcial") Opções: Sim, Não, Não se aplica
* Sonda vesical de demora (for_SVD): Opções: Sim, Não
* Pode ser removido (SVD) (for_SVDRemocao): (Aparece se for_SVD="Sim") Opções: Sim, Não
* Cateter Venoso Central (for_CVC): Opções: Sim, Não
* Pode ser removido (CVC) (for_CVCRemocao): (Aparece se for_CVC="Sim") Opções: Sim, Não
* Há cateter arterial (for_CateterArterial): Opções: Sim, Não
* Pode ser removido (Cateter Arterial) (for_ArterialRemocao): (Aparece se for_CateterArterial="Sim") Opções: Sim, Não
* Há dreno(s) (for_Dreno): Opções: Sim, Não
* Pode ser removido (Dreno) (for_DrenoRemocao): (Aparece se for_Dreno="Sim") Opções: Sim, Não
* Tem indicação de profilaxia gástrica? (for_ProfilaxiaGastrica): Opções: Sim, Não
* Está em uso? (Profilaxia Gástrica) (for_ProfilaxiaEmUSO): Opções: Sim, Não
* Tem indicação de profilaxia de TEV? (for_ProfilaxiaTEV): Opções: Sim, Não
* Está em uso? (Profilaxia TEV) (for_ProfilaxiaTEVEmUSO): Opções: Sim, Não, Contra-indicado
* Paciente pode ser mobilizado? (for_PacienteMobilizado): Opções: Sim, Não
* Pele íntegra (for_PeleIntegra): Opções: Sim, Não
* Lesões de pele (for_LesoesPele): (Aparece se for_PeleIntegra="Não") Opções Múltiplas: UP - Úlcera de pressão, DAI - Dermatite associada a incontinência, Deiscência de ferida operatória, Outro (especificar no texto)
* Limitação terapêutica (for_Limitacao): Opções: Sim, Não
* Paciente pode receber alta (for_AltaPaciente): Opções: Sim, Não
* Paciente necessita de atendimento com a equipe da farmácia? (for_AtendimentoFarmacia): Opções: Sim, Não
* Paciente watcher (for_PacienteWatcher): Opções: Sim, Não
`;

            return enhancedPrompt + "\n\nHistória clínica do paciente:\n" + text;
        },

        async getJsonFromLlmWithPrompt(prompt) {
            const masterPrompt = prompt;

            // Resolve model list from the preferred storage, with fallback to the other storage and a safe default
            const preferredStorageObj = localStorage.getItem('apiKeyStoragePreference') === 'local' ? localStorage : sessionStorage;
            const modelsRaw = preferredStorageObj.getItem('llmModels')
                || localStorage.getItem('llmModels')
                || sessionStorage.getItem('llmModels');
            const models = JSON.parse(modelsRaw || '[]');
            if (!Array.isArray(models) || models.length === 0) {
                // default fallbacks
                models.splice(0, models.length, 'openai/gpt-3.5-turbo', 'mistralai/mistral-7b-instruct:free');
            }

            let apiKey = this.getApiKey();
            if (!apiKey) {
                this.updateStatus('Chave da API não configurada.', 'error');
                alert("Chave da API não encontrada. Por favor, configure-a.");
                return null;
            }

            for (let i = 0; i < models.length; i++) {
                const model = models[i];
                this.updateStatus(`Tentando modelo ${i + 1}/${models.length}: ${model}...`, 'loading');
                try {
                    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.href, 'X-Title': document.title, },
                        body: JSON.stringify({ model: model, messages: [{ role: "system", content: masterPrompt }] })
                    });

                    if (!response.ok) {
                        const errorBody = await response.json();
                        const errorMessage = errorBody.error?.message || JSON.stringify(errorBody);
                        if (response.status === 401) {
                            throw new Error(`Erro de Autenticação (401): A chave da API é inválida ou foi revogada. Verifique suas configurações.`);
                        }
                        throw new Error(`Erro na API com o modelo ${model}: ${response.status}\n${errorMessage}`);
                    }
                    
                    this.updateStatus('Sucesso! Processando JSON...', 'success');
                    const data = await response.json();
                    let jsonString = data.choices[0].message.content;
                    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
                    if (jsonMatch) { jsonString = jsonMatch[0]; }
                    
                    setTimeout(() => this.updateStatus('', 'idle'), 2500);
                    return JSON.parse(jsonString);

                } catch (error) {
                    console.error(error);
                    if (i < models.length - 1) {
                        this.updateStatus(`Falha com ${model}. Tentando próximo...`, 'loading');
                    } else {
                        const finalErrorMessage = error.message.includes('401') ? error.message : `Todos os modelos falharam. Erro final: ${error.message.substring(0, 150)}...`;
                        this.updateStatus(finalErrorMessage, 'error');
                        alert(finalErrorMessage);
                        return null;
                    }
                }
            }
        },

        showConfirmationScreen(targetFormId, jsonData, validationResults, modal, originalText) {
            const { contentArea, footer } = this.createModalLayout(modal, "Revisão e Validação dos Dados");

            // --- Helper Functions ---
            const createAlertList = (title, items, colorClass) => {
                if (!items || items.length === 0) return '';
                let list = `<div class="cfa-alert ${colorClass}"><strong>${title}:</strong><ul>`;
                items.forEach(item => {
                    list += `<li>${item.field ? `<strong>${item.field}:</strong> ` : ''}${item.message}</li>`;
                });
                list += '</ul></div>';
                return list;
            };

            const renderValidation = (results, container) => {
                let html = createAlertList('⚠️ Alertas Críticos', results.criticalAlerts, 'critical');
                html += createAlertList('❌ Erros de Consistência', results.errors, 'error');
                html += createAlertList('⚡ Avisos e Oportunidades', results.warnings, 'warning');
                if (html === '') {
                    html = '<div class="cfa-alert success"><strong>✅ Nenhum problema de validação encontrado.</strong></div>';
                }
                container.innerHTML = html;
            };

            // --- Main Layout ---
            const tabContainer = document.createElement('div');
            tabContainer.className = 'cfa-tab-container';
            const tabContentContainer = document.createElement('div');
            tabContentContainer.className = 'cfa-tab-content-container';

            const createTab = (name, contentEl, isDefault = false) => {
                const tab = document.createElement('button');
                tab.textContent = name;
                tab.className = 'cfa-tab';
                tab.onclick = () => {
                    Array.from(tabContainer.children).forEach(t => t.classList.remove('active'));
                    Array.from(tabContentContainer.children).forEach(c => c.style.display = 'none');
                    tab.classList.add('active');
                    contentEl.style.display = 'flex';
                };
                tabContainer.appendChild(tab);
                contentEl.className = 'cfa-tab-content';
                tabContentContainer.appendChild(contentEl);
                if (isDefault) { setTimeout(() => tab.click(), 0); }
            };

            // --- Validation Tab ---
            const validationContainer = document.createElement('div');
            validationContainer.style.cssText = 'display: flex; flex-direction: column; width: 100%;';
            
            const validationToggleContainer = document.createElement('div');
            validationToggleContainer.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px; background: #f0f0f0; border-radius: 5px; margin-bottom: 10px;';
            
            const validator = new this.EnhancedMedicalValidator();
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'validatePageToggle';
            checkbox.checked = false; // Default to JSON validation
            
            const label = document.createElement('label');
            label.textContent = 'Validar texto completo (beta)';
            label.htmlFor = 'validatePageToggle';

            validationToggleContainer.append(checkbox, label);

            const validationContent = document.createElement('div');
            renderValidation(validationResults, validationContent); // Initial render with JSON results

            checkbox.addEventListener('change', () => {
                const isPageValidation = checkbox.checked;
                const results = isPageValidation ? validator.validatePage(originalText) : validationResults;
                renderValidation(results, validationContent);
            });
            
            validationContainer.append(validationToggleContainer, validationContent);


            // --- Other Tabs ---
            const jsonTextArea = document.createElement('textarea');
            jsonTextArea.className = 'cfa-textarea';
            jsonTextArea.value = JSON.stringify(jsonData, null, 2);

            const textContent = document.createElement('pre');
            textContent.className = 'cfa-pre';
            textContent.textContent = originalText;

            // --- Tab Creation ---
            createTab('Validação Clínica', validationContainer, true);
            createTab('JSON Gerado (Editável)', jsonTextArea);
            createTab('Texto Original', textContent);

            contentArea.append(tabContainer, tabContentContainer);

            // --- Footer Buttons ---
            const btnApply = this.createButton('Aplicar ao Formulário', 'success', async () => {
                try {
                    const finalJsonData = JSON.parse(jsonTextArea.value);
                    await this.populateForm(targetFormId, finalJsonData);
                    modal.remove();
                    // Exibe a mensagem de sucesso DEPOIS que o formulário é populado e o modal fechado.
                    setTimeout(() => {
                        alert("Formulário populado com sucesso!");
                    }, 100);
                } catch (e) {
                    // Captura tanto erros de JSON.parse quanto de populateForm
                    alert(`Erro ao aplicar dados: ${e.message}`);
                }
            });

            footer.appendChild(this.createButton('Cancelar', 'secondary', () => modal.remove()));
            footer.appendChild(btnApply);
        },

        async showSettingsModal() {
            const modal = this.createModalContainer('llm-settings-modal', '600px');
            const { contentArea, footer } = this.createModalLayout(modal, "Configurações de IA", 'column', '15px');
            
            let allModels = [];
            const prefStorage = localStorage.getItem('apiKeyStoragePreference') === 'local' ? localStorage : sessionStorage;
            let selectedModels = JSON.parse(
                prefStorage.getItem('llmModels')
                || localStorage.getItem('llmModels')
                || sessionStorage.getItem('llmModels')
                || '["openai/gpt-3.5-turbo","mistralai/mistral-7b-instruct:free"]'
            );

            const apiKeyContainer = document.createElement('div');
            apiKeyContainer.style.display = 'flex';
            apiKeyContainer.style.alignItems = 'center';
            apiKeyContainer.style.gap = '8px';
            
            const apiKeyLabel = document.createElement('label');
            apiKeyLabel.htmlFor = 'apiKeyInput';
            apiKeyLabel.className = 'cfa-label';
            apiKeyLabel.textContent = 'Chave da API do OpenRouter:';
            
            const apiKeyHelpBtn = document.createElement('span');
            apiKeyHelpBtn.style.cssText = 'cursor: pointer; font-size: 16px; color: #007bff; user-select: none; display: inline-block;';
            apiKeyHelpBtn.textContent = 'ℹ️';
            apiKeyHelpBtn.setAttribute('role', 'button');
            apiKeyHelpBtn.setAttribute('tabindex', '0');
            
            // Use mousedown to intercept before any other handlers
            apiKeyHelpBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.showApiKeyHelp();
                return false;
            }, true);
            
            // Prevent any click events from bubbling
            apiKeyHelpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
            
            apiKeyContainer.appendChild(apiKeyLabel);
            apiKeyContainer.appendChild(apiKeyHelpBtn);
            contentArea.appendChild(apiKeyContainer);
            const keyInput = document.createElement('input');
            keyInput.type = 'password';
            keyInput.value = this.getApiKey() || '';
            keyInput.id = 'apiKeyInput';
            keyInput.className = 'cfa-input';
            contentArea.appendChild(keyInput);

            const modelsContainer = document.createElement('div');
            modelsContainer.style.display = 'flex';
            modelsContainer.style.alignItems = 'center';
            modelsContainer.style.gap = '8px';
            modelsContainer.style.marginTop = '15px';
            
            const modelLabel = document.createElement('label');
            modelLabel.htmlFor = 'modelSearchInput';
            modelLabel.className = 'cfa-label';
            modelLabel.textContent = 'Modelos (primário e fallbacks):';
            
            const modelsHelpBtn = document.createElement('span');
            modelsHelpBtn.style.cssText = 'cursor: pointer; font-size: 16px; color: #007bff; user-select: none; display: inline-block; margin-left: 8px;';
            modelsHelpBtn.textContent = 'ℹ️';
            modelsHelpBtn.setAttribute('role', 'button');
            modelsHelpBtn.setAttribute('tabindex', '0');
            
            // Use mousedown to intercept before any other handlers
            modelsHelpBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.showModelsHelp();
                return false;
            }, true);
            
            // Prevent any click events from bubbling
            modelsHelpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
            
            modelsContainer.appendChild(modelLabel);
            modelsContainer.appendChild(modelsHelpBtn);
            contentArea.appendChild(modelsContainer);
            const autocompleteContainer = document.createElement('div');
            autocompleteContainer.className = 'cfa-autocomplete-container';
            const modelSearchInput = document.createElement('input');
            modelSearchInput.type = 'text';
            modelSearchInput.placeholder = 'Digite para buscar modelos (ex: free, gpt)...';
            modelSearchInput.className = 'cfa-input';
            const searchResultsContainer = document.createElement('div');
            searchResultsContainer.className = 'cfa-search-results';
            autocompleteContainer.append(modelSearchInput, searchResultsContainer);

            const selectedModelsContainer = document.createElement('div');
            selectedModelsContainer.className = 'cfa-pills-container';

// Initialize container-level drag & drop once
if (!selectedModelsContainer._dndInit) {
    selectedModelsContainer._dndInit = true;
    selectedModelsContainer.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        selectedModelsContainer.classList.add('drag-over');
    });
    selectedModelsContainer.addEventListener('dragleave', () => {
        selectedModelsContainer.classList.remove('drag-over');
    });
    selectedModelsContainer.addEventListener('drop', (ev) => {
        ev.preventDefault();
        selectedModelsContainer.classList.remove('drag-over');
        const data = ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '';
        const from = Number(data);
        if (Number.isNaN(from)) return;

        // If dropped on a pill, use its index; otherwise, drop to the end
        const placeholder = selectedModelsContainer.querySelector('.cfa-pill-placeholder');
        if (placeholder) {
            const to = Number(placeholder.dataset.index);
            if (!Number.isNaN(from) && !Number.isNaN(to) && from !== to) {
                const [m] = selectedModels.splice(from, 1);
                selectedModels.splice(to, Math.min(to, selectedModels.length), m);
            }
        }
        renderSelectedModels();
    });
}

            const renderSelectedModels = () => {
                selectedModelsContainer.innerHTML = '';
                selectedModels.forEach((model, index) => {
                    const pill = document.createElement('span');
                    pill.className = `cfa-pill ${index === 0 ? 'primary' : 'secondary'}`;
                    pill.setAttribute('draggable', 'true');
                    pill.dataset.index = String(index);
                    pill.innerHTML = `<span>${index === 0 ? 'Primário: ' : ''}${model}</span><button>&times;</button>`;

                    // Remoção do modelo
                    pill.querySelector('button').onclick = (ev) => {
                        ev.stopPropagation();
                        selectedModels.splice(index, 1);
                        renderSelectedModels();
                    };

                    // Suporte a arrastar e soltar para reordenar
                    pill.addEventListener('dragstart', (ev) => {
                        pill.classList.add('dragging');
                        if (ev.dataTransfer) {
                            ev.dataTransfer.setData('text/plain', String(index));
                            try { ev.dataTransfer.setDragImage(pill, 10, 10); } catch {}
                        }
                    });
                    pill.addEventListener('dragover', (ev) => {
                        ev.preventDefault();
                        const placeholder = selectedModelsContainer.querySelector('.cfa-pill-placeholder') || document.createElement('span');
                        placeholder.className = 'cfa-pill-placeholder';
                        placeholder.dataset.index = String(index);
                        pill.parentNode.insertBefore(placeholder, pill);
                    });
                    pill.addEventListener('dragend', () => {
                        pill.classList.remove('dragging');
                        pill.classList.remove('drag-over');
                    });

                    selectedModelsContainer.appendChild(pill);
                });
            };

            modelSearchInput.oninput = () => {
                const query = modelSearchInput.value.toLowerCase();
                searchResultsContainer.innerHTML = '';
                if (query.length < 2) { searchResultsContainer.style.display = 'none'; return; }
                const filtered = allModels.filter(m => m.id.toLowerCase().includes(query) && !selectedModels.includes(m.id));
                if (filtered.length > 0) {
                    searchResultsContainer.style.display = 'block';
                    filtered.slice(0, 50).forEach(model => {
                        const item = document.createElement('div');
                        item.textContent = model.id;
                        item.className = 'cfa-search-item';
                        item.onclick = () => {
                            // Add new model as primary (first position)
                            selectedModels.unshift(model.id);
                            renderSelectedModels();
                            modelSearchInput.value = '';
                            searchResultsContainer.style.display = 'none';
                        };
                        searchResultsContainer.appendChild(item);
                    });
                } else {
                    searchResultsContainer.style.display = 'none';
                }
            };
            document.addEventListener('click', (e) => { if (!autocompleteContainer.contains(e.target)) { searchResultsContainer.style.display = 'none'; } });

            contentArea.append(autocompleteContainer, selectedModelsContainer);
            renderSelectedModels();

            // Adaptive prompt option
            const adaptivePromptContainer = document.createElement('div');
            adaptivePromptContainer.style.marginTop = '20px';
            adaptivePromptContainer.style.paddingTop = '20px';
            adaptivePromptContainer.style.borderTop = '1px solid #e0e0e0';
            
            const adaptivePromptLabel = document.createElement('label');
            adaptivePromptLabel.style.display = 'flex';
            adaptivePromptLabel.style.alignItems = 'center';
            adaptivePromptLabel.style.gap = '10px';
            adaptivePromptLabel.style.cursor = 'pointer';
            
            const adaptivePromptCheckbox = document.createElement('input');
            adaptivePromptCheckbox.type = 'checkbox';
            adaptivePromptCheckbox.id = 'adaptivePromptCheckbox';
            adaptivePromptCheckbox.checked = localStorage.getItem('adaptivePrompt') !== 'false';
            
            const textSpan = document.createElement('span');
            textSpan.textContent = 'Prompt adaptivo';
            adaptivePromptLabel.appendChild(adaptivePromptCheckbox);
            adaptivePromptLabel.appendChild(textSpan);
            
            // Info icon
            const infoIcon = document.createElement('span');
            infoIcon.innerHTML = 'ℹ️';
            infoIcon.style.cursor = 'pointer';
            infoIcon.style.marginLeft = '0';
            infoIcon.style.fontSize = '14px';
            
            // Prevent checkbox toggle when clicking info icon
            infoIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                alert('Quando ativado, o prompt para extração de dados com IA será gerado com base nos campos da página atual. Quando desativado, usa os campos do formulário padrão de 2025 da telemedicina.');
                return false;
            }, true);
            
            adaptivePromptLabel.appendChild(infoIcon);
            
            adaptivePromptContainer.appendChild(adaptivePromptLabel);
            contentArea.appendChild(adaptivePromptContainer);

            // Show AI JSON option
            const showAiJsonContainer = document.createElement('div');
            showAiJsonContainer.style.marginTop = '15px';
            
            const showAiJsonLabel = document.createElement('label');
            showAiJsonLabel.style.display = 'flex';
            showAiJsonLabel.style.alignItems = 'center';
            showAiJsonLabel.style.gap = '10px';
            showAiJsonLabel.style.cursor = 'pointer';
            
            const showAiJsonCheckbox = document.createElement('input');
            showAiJsonCheckbox.type = 'checkbox';
            showAiJsonCheckbox.id = 'showAiJsonCheckbox';
            showAiJsonCheckbox.checked = localStorage.getItem('showAiJson') !== 'false';
            
            const jsonTextSpan = document.createElement('span');
            jsonTextSpan.textContent = 'Mostrar JSON gerado pela IA';
            showAiJsonLabel.appendChild(showAiJsonCheckbox);
            showAiJsonLabel.appendChild(jsonTextSpan);
            
            // Info icon
            const jsonInfoIcon = document.createElement('span');
            jsonInfoIcon.innerHTML = 'ℹ️';
            jsonInfoIcon.style.cursor = 'pointer';
            jsonInfoIcon.style.marginLeft = '0';
            jsonInfoIcon.style.fontSize = '14px';
            
            // Prevent checkbox toggle when clicking info icon
            jsonInfoIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                alert('Quando ativado, exibe o JSON gerado pela IA antes de aplicar ao formulário. Quando desativado, aplica o JSON diretamente sem preview.');
                return false;
            }, true);
            
            showAiJsonLabel.appendChild(jsonInfoIcon);
            
            showAiJsonContainer.appendChild(showAiJsonLabel);
            contentArea.appendChild(showAiJsonContainer);

            // Medical data validator option
            const validatorContainer = document.createElement('div');
            validatorContainer.style.marginTop = '15px';
            
            const validatorLabel = document.createElement('label');
            validatorLabel.style.display = 'flex';
            validatorLabel.style.alignItems = 'center';
            validatorLabel.style.gap = '10px';
            validatorLabel.style.cursor = 'pointer';
            
            const validatorCheckbox = document.createElement('input');
            validatorCheckbox.type = 'checkbox';
            validatorCheckbox.id = 'medicalValidatorCheckbox';
            validatorCheckbox.checked = localStorage.getItem('enableMedicalValidator') !== 'false';
            
            const validatorTextSpan = document.createElement('span');
            validatorTextSpan.textContent = 'Ativar validador de dados médicos';
            validatorLabel.appendChild(validatorCheckbox);
            validatorLabel.appendChild(validatorTextSpan);
            
            // Info icon
            const validatorInfoIcon = document.createElement('span');
            validatorInfoIcon.innerHTML = 'ℹ️';
            validatorInfoIcon.style.cursor = 'pointer';
            validatorInfoIcon.style.marginLeft = '0';
            validatorInfoIcon.style.fontSize = '14px';
            
            // Prevent checkbox toggle when clicking info icon
            validatorInfoIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                alert('Ativa validação automática de dados médicos:\n\n• Validação de faixas fisiológicas\n• Verificação de combinações obrigatórias\n• Alertas de condições críticas\n• Análise de interações medicamentosas\n• Avaliação de SOFA scores\n• Validação de dispositivos invasivos');
                return false;
            }, true);
            
            validatorLabel.appendChild(validatorInfoIcon);
            validatorContainer.appendChild(validatorLabel);
            contentArea.appendChild(validatorContainer);

            (async () => {
                try {
                    const cachedModels = sessionStorage.getItem('openRouterModels');
                    if (cachedModels) {
                        allModels = JSON.parse(cachedModels);
                    } else {
                        const response = await fetch('https://openrouter.ai/api/v1/models');
                        const data = await response.json();
                        allModels = data.data;
                        sessionStorage.setItem('openRouterModels', JSON.stringify(allModels));
                    }
                } catch (e) { console.error("Falha ao buscar modelos do OpenRouter", e); }
            })();

            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'cfa-checkbox-container';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'rememberApiKeyCheckbox';
            checkbox.checked = localStorage.getItem('apiKeyStoragePreference') === 'local';
            const checkboxLabel = document.createElement('label');
            checkboxLabel.textContent = "Salvar configurações permanentemente neste navegador";
            checkboxLabel.htmlFor = 'rememberApiKeyCheckbox';
            checkboxContainer.append(checkbox, checkboxLabel);
            contentArea.appendChild(checkboxContainer);

            const btnSave = this.createButton('Salvar', 'success', () => {
                // Read directly from DOM to avoid stale closure references
                const currentKeyInput = document.getElementById('apiKeyInput');
                const currentCheckbox = document.getElementById('rememberApiKeyCheckbox');
                const inputKey = currentKeyInput ? currentKeyInput.value.trim() : '';
                const shouldBeLocal = currentCheckbox ? currentCheckbox.checked : checkbox.checked;

                // Use the input key or preserve existing key if input is empty
                const finalKey = inputKey || this.getApiKey() || '';

                // Always set volatile key as fallback
                if (finalKey) {
                    window.ClinicalFormAssistant._volatileKey = finalKey;
                }

                // Clear keys from both storages first
                try {
                    localStorage.removeItem('openRouterApiKey');
                    localStorage.removeItem('cfa_openRouterApiKey');
                } catch (e) {}
                
                try {
                    sessionStorage.removeItem('openRouterApiKey');
                    sessionStorage.removeItem('cfa_openRouterApiKey');
                } catch (e) {}

                // Save to the preferred storage only
                let success = false;
                if (shouldBeLocal) {
                    try {
                        if (finalKey) {
                            localStorage.setItem('openRouterApiKey', finalKey);
                        }
                        localStorage.setItem('apiKeyStoragePreference', 'local');
                        success = true;
                    } catch (e) {
                        console.warn('localStorage not available, falling back to sessionStorage');
                    }
                }
                
                if (!shouldBeLocal || !success) {
                    try {
                        if (finalKey) {
                            sessionStorage.setItem('openRouterApiKey', finalKey);
                        }
                        try {
                            localStorage.setItem('apiKeyStoragePreference', 'session');
                        } catch (e) {}
                        success = true;
                    } catch (e) {
                        console.warn('sessionStorage not available, using volatile memory only');
                    }
                }

                // Save models to the same preferred storage
                const modelsJson = JSON.stringify(selectedModels);
                if (shouldBeLocal && success) {
                    try {
                        localStorage.setItem('llmModels', modelsJson);
                    } catch (e) {}
                } else if (success) {
                    try {
                        sessionStorage.setItem('llmModels', modelsJson);
                    } catch (e) {}
                }
                
                // Save adaptive prompt setting
                const adaptivePromptEnabled = document.getElementById('adaptivePromptCheckbox').checked;
                if (shouldBeLocal && success) {
                    try {
                        localStorage.setItem('adaptivePrompt', adaptivePromptEnabled);
                    } catch (e) {}
                } else if (success) {
                    try {
                        sessionStorage.setItem('adaptivePrompt', adaptivePromptEnabled);
                    } catch (e) {}
                }
                
                // Save show AI JSON setting
                const showAiJsonEnabled = document.getElementById('showAiJsonCheckbox').checked;
                if (shouldBeLocal && success) {
                    try {
                        localStorage.setItem('showAiJson', showAiJsonEnabled);
                    } catch (e) {}
                } else if (success) {
                    try {
                        sessionStorage.setItem('showAiJson', showAiJsonEnabled);
                    } catch (e) {}
                }
                
                // Save medical validator setting
                const validatorEnabled = document.getElementById('medicalValidatorCheckbox').checked;
                if (shouldBeLocal && success) {
                    try {
                        localStorage.setItem('enableMedicalValidator', validatorEnabled);
                    } catch (e) {}
                } else if (success) {
                    try {
                        sessionStorage.setItem('enableMedicalValidator', validatorEnabled);
                    } catch (e) {}
                }
                
                // Status message
                if (!success && finalKey) {
                    this.updateStatus('⚠️ Storage bloqueado - usando memória volátil', 'warning');
                } else if (finalKey) {
                    this.updateStatus('Configurações salvas', 'success');
                } else {
                    this.updateStatus('Configurações limpas', 'success');
                }

                if (btnSave) {
                    const originalText = btnSave.textContent;
                    btnSave.textContent = success ? 'Salvo' : 'Salvo (volátil)';
                    setTimeout(() => { btnSave.textContent = originalText; }, 2000);
                }
                modal.remove();
            });
            footer.appendChild(this.createButton('Fechar', 'secondary', () => modal.remove()));
            footer.appendChild(btnSave);
            document.body.appendChild(modal);
        },

        showApiKeyHelp() {
            const modal = this.createModalContainer('api-key-help-modal', '500px');
            const { contentArea, footer } = this.createModalLayout(modal, "Como obter a chave da API OpenRouter", 'column', '20px');
            
            contentArea.innerHTML = `
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
                    <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li>Acesse <a href="https://openrouter.ai" target="_blank" style="color: #007bff; text-decoration: underline;">https://openrouter.ai</a></li>
                        <li>Crie uma conta gratuita (ou faça login se já tiver uma)</li>
                        <li>Acesse seu perfil/dashboard para gerar a chave da API</li>
                        <li><strong>Importante:</strong> Mesmo para usar modelos gratuitos, pode ser necessário adicionar algum crédito à sua conta</li>
                    </ol>
                </div>
            `;

            footer.appendChild(this.createButton('Fechar', 'secondary', () => modal.remove()));
            document.body.appendChild(modal);
        },

        showModelsHelp() {
            const modal = this.createModalContainer('models-help-modal', '500px');
            const { contentArea, footer } = this.createModalLayout(modal, "Sobre a seleção de modelos", 'column', '20px');
            
            contentArea.innerHTML = `
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745;">
                    <h4 style="margin-top: 0; color: #333; margin-bottom: 15px;">Como funciona a seleção de modelos?</h4>
                    <ul style="margin: 0 0 20px 0; padding-left: 20px; line-height: 1.6;">
                        <li>Você pode selecionar <strong>vários modelos</strong> na lista</li>
                        <li><strong>Apenas o primeiro modelo será usado</strong> em cada requisição</li>
                        <li>Os demais servem como <strong>fallbacks</strong> (alternativas caso o primeiro modelo falhe)</li>
                        <li>Use <strong>arrastar e soltar</strong> para reordenar os modelos por preferência</li>
                    </ul>
                    
                    <h4 style="color: #333; margin-bottom: 10px;">Modelos recomendados (08/2025)</h4>
                    <div style="background-color: #e9ecef; padding: 12px; border-radius: 5px; font-family: monospace; font-size: 14px; line-height: 1.6;">
                        • openai/gpt-oss-20b:free<br>
                        • z-ai/glm-4.5-air:free
                    </div>
                    <p style="margin-top: 12px; font-size: 12px; color: #666;">
                        Esses modelos têm apresentado bons resultados para extração de dados clínicos.
                    </p>
                </div>
            `;

            footer.appendChild(this.createButton('Fechar', 'secondary', () => modal.remove()));
            document.body.appendChild(modal);
        },

        createModalContainer(id, maxWidth = '80vw') {
            const oldModal = document.getElementById(id);
            if (oldModal) oldModal.remove();
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.className = 'cfa-modal-overlay';
            overlay.dataset.maxWidth = maxWidth;
            return overlay;
        },

        createModalLayout(overlay, titleText, direction = 'column', gap = '0') {
            const modalContent = document.createElement('div');
            modalContent.className = 'cfa-modal-content';
            modalContent.style.maxWidth = overlay.dataset.maxWidth || '700px';

            const modalHeader = document.createElement('div');
            modalHeader.className = 'cfa-modal-header';
            modalHeader.textContent = titleText;
            this.makeDraggable(modalContent, modalHeader);

            const contentArea = document.createElement('div');
            contentArea.className = 'cfa-modal-body';
            contentArea.style.flexDirection = direction;
            contentArea.style.gap = gap;

            const footer = document.createElement('div');
            footer.className = 'cfa-modal-footer';

            modalContent.append(modalHeader, contentArea, footer);
            overlay.appendChild(modalContent);

            const setProcessing = (isProcessing) => {
                const btn = footer.querySelector('.cfa-button-primary');
                if (!btn) return;
                if (isProcessing) {
                    btn.disabled = true;
                    btn.innerHTML = `<span class="cfa-spinner"></span>Processando...`;
                } else {
                    btn.disabled = false;
                    btn.innerHTML = 'Processar';
                }
            };

            return { contentArea, footer, setProcessing };
        },
        
        makeDraggable(element, handle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            handle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                element.style.top = (element.offsetTop - pos2) + "px";
                element.style.left = (element.offsetLeft - pos1) + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        },

        createButton(text, type, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = `cfa-button cfa-button-${type}`;
            btn.onclick = onClick;
            return btn;
        },

        debugDumpConfig() {
            try {
                const pref = localStorage.getItem('apiKeyStoragePreference');
                const localKey = localStorage.getItem('openRouterApiKey');
                const sessKey = sessionStorage.getItem('openRouterApiKey');
                const modelsLocal = localStorage.getItem('llmModels');
                const modelsSess = sessionStorage.getItem('llmModels');
                console.group('[CFA] Debug config');
                console.log('preference:', pref);
                console.log('localStorage.openRouterApiKey:', !!localKey, localKey ? '(len ' + localKey.length + ')' : '');
                console.log('sessionStorage.openRouterApiKey:', !!sessKey, sessKey ? '(len ' + sessKey.length + ')' : '');
                console.log('localStorage.llmModels:', modelsLocal);
                console.log('sessionStorage.llmModels:', modelsSess);
                console.groupEnd();
            } catch(e) {
                console.error('[CFA] debugDumpConfig error', e);
            }
        },
        updateStatus(message, type = 'loading') {
            let statusBar = document.getElementById('cfa-status-bar');
            if (!statusBar) {
                statusBar = document.createElement('div');
                statusBar.id = 'cfa-status-bar';
                document.body.appendChild(statusBar);
            }
            if (!message || type === 'idle') {
                statusBar.classList.remove('visible');
                return;
            }
            statusBar.className = `cfa-status-bar visible ${type}`;
            statusBar.textContent = message;
        },

        cleanup() {
            const ids = ['cfa-main-container', 'cfa-style-sheet', 'cfa-status-bar'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
            document.querySelectorAll('.cfa-modal-overlay').forEach(el => el.remove());
        },

        injectStyles() {
            const styleId = 'cfa-style-sheet';
            if (document.getElementById(styleId)) return;
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                .cfa-main-container { position:fixed; top:10px; right:10px; z-index:10001; background:#f0f0f0; border:1px solid #ccc; border-radius:8px; padding:15px; box-shadow:0 4px 8px rgba(0,0,0,0.2); font-family:Arial,sans-serif; font-size:14px; max-width:250px; display:flex; flex-direction:column; gap:10px; }
                .cfa-main-container h4 { margin:0; text-align:center; color:#333; }
                .cfa-button { width: 100%; padding: 10px 15px; color: white; border: none; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
                .cfa-button-primary { background: #007bff; } .cfa-button-secondary { background: #6c757d; } .cfa-button-success { background: #28a745; } .cfa-button-danger { background: #dc3545; }
                .cfa-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10002; display: flex; align-items: center; justify-content: center; }
                .cfa-modal-content { position: relative; background: #fff; border-radius: 8px; width: 90%; height: 90%; max-height: 80vh; box-shadow: 0 5px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; }
                .cfa-modal-header { padding: 15px 25px; background: #f7f7f7; border-bottom: 1px solid #e5e5e5; border-radius: 8px 8px 0 0; font-size: 18px; font-weight: bold; cursor: move; }
                .cfa-modal-body { padding: 25px; flex-grow: 1; display: flex; flex-direction: column; overflow-y: auto; }
                .cfa-modal-footer { padding: 15px 25px; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; border-top: 1px solid #e5e5e5; }
                .cfa-textarea, .cfa-pre { width: 100%; flex-grow: 1; font-family: monospace; font-size: 14px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; resize: none; }
                .cfa-pre { white-space: pre-wrap; word-wrap: break-word; background: #f4f4f4; }
                .cfa-tab-container { display: flex; border-bottom: 1px solid #ccc; }
                .cfa-tab { padding: 10px 15px; border: 1px solid transparent; border-bottom: none; background: #eee; cursor: pointer; margin-bottom: -1px; }
                .cfa-tab.active { background: #fff; border-color: #ccc; border-bottom: 1px solid #fff; font-weight: bold; }
                .cfa-tab-content-container { flex-grow: 1; padding: 15px; border: 1px solid #ccc; border-top: none; overflow: hidden; display: flex; flex-direction: column; }
                .cfa-tab-content { display: none; flex-direction: column; flex-grow: 1; overflow: auto; }
                .cfa-alert { margin-bottom: 8px; padding: 8px 12px; border-radius: 4px; }
                .cfa-alert ul { margin: 4px 0 0 20px; padding: 0; } .cfa-alert li { margin-bottom: 2px; }
                .cfa-alert.critical { background: #fdecea; color: #d32f2f; border: 1px solid #f5c6cb; }
                .cfa-alert.error { background: #fff3e0; color: #f57c00; border: 1px solid #ffe0b2; }
                .cfa-alert.warning { background: #e3f2fd; color: #1976d2; border: 1px solid #bbdefb; }
                .cfa-alert.success { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
                .cfa-status-bar { position: fixed; bottom: -50px; left: 0; right: 0; margin: auto; width: fit-content; min-width: 200px; text-align: center; padding: 10px 20px; border-radius: 8px 8px 0 0; color: white; font-weight: bold; z-index: 10005; transition: bottom 0.3s; display: flex; align-items: center; justify-content: center; }
                .cfa-status-bar.visible { bottom: 0; }
                .cfa-status-bar.loading { background: #007bff; } .cfa-status-bar.success { background: #28a745; } .cfa-status-bar.error { background: #dc3545; }
                .cfa-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: cfa-spin 1s ease-in-out infinite; }
                @keyframes cfa-spin { to { transform: rotate(360deg); } }
                .cfa-label { font-weight: bold; display: block; margin-bottom: 5px; }
                .cfa-input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
                .cfa-autocomplete-container { position: relative; }
                .cfa-search-results { position: absolute; top: 100%; left: 0; min-width: 400px; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; background: #fff; border-radius: 4px; z-index: 10003; display: none; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                .cfa-search-item { padding: 8px; cursor: pointer; } .cfa-search-item:hover { background: #f0f0f0; }
                .cfa-pills-container { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; padding: 5px; border: 1px solid #eee; border-radius: 4px; min-height: 28px; }
                .cfa-pill { color: white; padding: 5px 8px; border-radius: 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
                .cfa-pill.primary { background: #007bff; } .cfa-pill.secondary { background: #6c757d; }
                .cfa-pill button { background:none; border:none; color:white; cursor:pointer; font-weight:bold; padding:0; line-height:1; }
                .cfa-pill[draggable="true"] { cursor: move; }
                .cfa-pill.dragging { opacity: 0.6; }
                .cfa-pill.drag-over { outline: 2px dashed #333; }
                .cfa-pills-container.drag-over { outline: 2px dashed #007bff; outline-offset: 3px; }
                .cfa-checkbox-container { display: flex; align-items: center; gap: 8px; margin-top: 15px; }
                .cfa-import-options { display: flex; flex-direction: column; gap: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; }
                .cfa-import-option { padding: 15px; background: white; border-radius: 6px; border: 1px solid #dee2e6; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .cfa-import-option:hover { background: #f8f9fa; border-color: #007bff; }
            `;
            document.head.appendChild(style);
        },

        async validatePageAndDisplayResults(targetFormId) {
            this.updateStatus('Validando conteúdo da página...', 'loading'); // Keep this for initial feedback

            const pageText = document.body.innerText; // Get all text from the page body
            const validator = new this.EnhancedMedicalValidator();
            const validationResults = validator.validatePage(pageText); // Use validatePage
            
            // Create a modal container before showing the confirmation screen
            const modal = this.createModalContainer('page-validation-modal', '80vw'); // Use a suitable ID and width
            document.body.appendChild(modal); // Append it to the body immediately

            this.showConfirmationScreen(targetFormId, {}, validationResults, modal, "Validação de Página");
            this.updateStatus('Validação de página concluída.', 'success'); // This will be called after the modal is displayed
        },

        createFormToolsUI(targetFormId = 'formPreencher') {
            this.cleanup();
            this.injectStyles();
            const container = document.createElement('div');
            container.id = 'cfa-main-container';
            container.className = 'cfa-main-container';
            const title = document.createElement('h4');
            title.textContent = 'Assistente Clínico';
            container.appendChild(title);
            container.appendChild(this.createButton('Exportar Dados', 'success', () => {
                const data = this.extractFormData(targetFormId);
                if (data) this.downloadJson(data, `form_${targetFormId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
            }));
            container.appendChild(this.createButton('Importar Dados', 'primary', () => this.showUnifiedImportModal(targetFormId)));
            container.appendChild(this.createButton('Validar Página', 'info', () => this.validatePageAndDisplayResults(targetFormId)));
            container.appendChild(this.createButton('Configurações', 'secondary', () => this.showSettingsModal()));
            container.appendChild(this.createButton('Fechar', 'danger', () => this.cleanup()));
            document.body.appendChild(container);
        },

        init(targetFormId = 'formPreencher') {
            this.createFormToolsUI(targetFormId);
        }
    };

    // --- INICIALIZAÇÃO ---
    ClinicalFormAssistant.init('formPreencher');
    window.ClinicalFormAssistant = ClinicalFormAssistant;

})();
