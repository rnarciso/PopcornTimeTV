(function () {
  // =================================================================================
  // CLASSES DE VALIDAÇÃO CLÍNICA (Sua Arquitetura)
  // =================================================================================
  class MedicalDataValidator {
    constructor() {
      this.criticalFields = [
        "for_SOFANeurologico",
        "for_SOFACardio",
        "for_SOFARespiratorio",
        "for_SOFAHepatico",
        "for_SOFARenal",
        "for_SOFAHemato",
      ];
      this.validRanges = {
        for_PAMMin: { min: 50, max: 120, unit: "mmHg" },
        for_MetaMax: { min: 50, max: 120, unit: "mmHg" },
        for_SAVAS: { min: 0, max: 10, unit: "score" },
      };
      this.requiredCombinations = [
        {
          condition: "for_Sedacao",
          value: "Sim",
          required: ["for_InterrupcaoDiaria"],
        },
        {
          condition: "for_Dialise",
          value: "Sim",
          required: ["for_MetodoDialise"],
        },
        {
          condition: "for_PeleIntegra",
          value: "Não",
          required: ["for_LesoesPele"],
        },
        { condition: "for_PresencaDor", value: "Sim", required: ["for_SAVAS"] },
      ];
      this.sofaConversions = {
        for_SOFANeurologico: {
          15: 0,
          "13 a 14": 1,
          "10 a 12": 2,
          "6 a 9": 3,
          "<6": 4,
        },
        for_SOFACardio: {
          "Sem hipotensão": 0,
          "PAM < 70mmhg": 1,
          "Dopa > 5 ou dobuta qq dose": 2,
          "Dopa >15 ou Nora/Adr > 0.01": 3,
          "Nora/Adr > 0.1": 4,
        },
        for_SOFARespiratorio: {
          ">= 400": 0,
          "300-399": 1,
          "200-299": 2,
          "100-199 + suplem. Vent.": 3,
          "<100 + suplem. Vent.": 4,
        },
        for_SOFAHepatico: {
          "< 1,2": 0,
          "1,2 - 1,9": 1,
          "2,0 - 5,9": 2,
          "6,0 - 11,9": 3,
          ">= 12": 4,
        },
        for_SOFARenal: {
          "< 1,2": 0,
          "1,2 - 1,9": 1,
          "2,0 - 3,4": 2,
          "3,5 - 4,9 ou 500ml/24h": 3,
          ">= 5 ou <= 200ml/24h": 4,
        },
        for_SOFAHemato: {
          ">= 150": 0,
          "100 - 149": 1,
          "50 - 99": 2,
          "20 - 49": 3,
          "<20": 4,
        },
      };
    }
    validate(formData) {
      const results = { errors: [], warnings: [], criticalAlerts: [] };
      if (!formData || typeof formData !== "object") {
        results.errors.push({
          field: "Geral",
          message: "Dados do formulário são inválidos.",
        });
        return results;
      }
      this.validateSofaScores(formData, results);
      this.validatePhysiologicalRanges(formData, results);
      this.validateRequiredCombinations(formData, results);
      this.checkCriticalConditions(formData, results);
      return results;
    }
    convertSofaToNumeric(value, field) {
      return this.sofaConversions[field]?.[value] ?? null;
    }
    validateSofaScores(formData, results) {
      const sofaScores = {};
      this.criticalFields.forEach((field) => {
        if (formData[field]) {
          sofaScores[field] = this.convertSofaToNumeric(formData[field], field);
        }
      });
      if (
        sofaScores.for_SOFANeurologico <= 6 &&
        formData.for_Sedacao === "Não"
      ) {
        results.warnings.push({
          field: "for_SOFANeurologico",
          message:
            "Glasgow ≤6 sem sedação pode indicar comprometimento neurológico grave.",
        });
      }
      if (
        sofaScores.for_SOFACardio >= 3 &&
        formData.for_UsoVasopressor === "Não"
      ) {
        results.errors.push({
          field: "for_SOFACardio",
          message:
            "SOFA cardiovascular alto inconsistente com não uso de vasopressor.",
        });
      }
    }
    validatePhysiologicalRanges(formData, results) {
      Object.entries(this.validRanges).forEach(([field, range]) => {
        const value = formData[field];
        if (value !== undefined && value !== null && value !== "") {
          const numValue = Number(String(value).replace(",", "."));
          if (isNaN(numValue)) {
            results.errors.push({
              field,
              message: `Valor inválido para ${field}`,
            });
          } else if (numValue < range.min || numValue > range.max) {
            results.warnings.push({
              field,
              message: `Valor ${numValue} ${range.unit} fora da faixa típica (${range.min}-${range.max})`,
            });
          }
        }
      });
      if (formData.for_PAMMin && formData.for_MetaMax) {
        const minPAM = Number(formData.for_PAMMin);
        const maxPAM = Number(formData.for_MetaMax);
        if (!isNaN(minPAM) && !isNaN(maxPAM) && minPAM > maxPAM) {
          results.errors.push({
            field: "for_PAMMin",
            message: "PAM mínima não pode ser maior que a máxima.",
          });
        }
      }
    }
    validateRequiredCombinations(formData, results) {
      this.requiredCombinations.forEach((c) => {
        if (formData[c.condition] === c.value) {
          c.required.forEach((requiredField) => {
            if (!formData[requiredField] || formData[requiredField] === "") {
              results.errors.push({
                field: requiredField,
                message: `${requiredField} é obrigatório quando ${c.condition} é "${c.value}"`,
              });
            }
          });
        }
      });
    }
    checkCriticalConditions(formData, results) {
      if (formData.for_SOFANeurologico === "<6") {
        results.criticalAlerts.push({
          message: "CRÍTICO: Escala de Coma de Glasgow <6.",
        });
      }
      if (
        formData.for_SOFARespiratorio === "<100 + suplem. Vent." &&
        formData.for_SuporteVentilatorio?.includes(
          "Ventilação mecânica invasiva",
        )
      ) {
        results.criticalAlerts.push({
          message:
            "CRÍTICO: SDRA grave (PaO2/FiO2 <100) em ventilação mecânica.",
        });
      }
      const highSofaFields = this.criticalFields.filter(
        (field) =>
          (this.convertSofaToNumeric(formData[field], field) ?? 0) >= 3,
      );
      if (highSofaFields.length >= 3) {
        results.criticalAlerts.push({
          message: `Disfunção de múltiplos órgãos: ${highSofaFields.length} sistemas com SOFA ≥3.`,
        });
      }
    }
  }

  class EnhancedMedicalValidator extends MedicalDataValidator {
    constructor() {
      super();
      this.drugInteractions = {
        for_UsoVasopressor: {
          Sim: {
            conflicts: ["for_Vasodilatador"],
            message:
              "Uso simultâneo de vasopressor e vasodilatador requer cuidado especial",
          },
        },
        for_Dialise: {
          Sim: {
            implications: ["for_DrogasAjustadas"],
            message:
              "Paciente em diálise deve ter medicamentos ajustados para função renal",
          },
        },
      };
      this.ventilationChecks = {
        invasive: ["Ventilação mecânica invasiva"],
        noninvasive: ["VNI", "CPAP"],
        oxygen: ["Cateter nasal", "Máscara", "Nebulização"],
      };
      this.nutritionSafety = { maxProtein: { nonObese: 2.0, obese: 2.0 } };
    }
    validate(formData) {
      const results = super.validate(formData);
      this.validateDrugInteractions(formData, results);
      this.validateVentilationSafety(formData, results);
      this.validateNutritionSafety(formData, results);
      this.validateInfectionControl(formData, results);
      this.calculateRiskScores(formData, results);
      return results;
    }
    validateDrugInteractions(formData, results) {
      Object.entries(this.drugInteractions).forEach(([field, rules]) => {
        const fieldValue = formData[field];
        if (!fieldValue) return;
        const rule = rules[fieldValue];
        if (!rule) return;
        if (rule.conflicts) {
          rule.conflicts.forEach((conflictField) => {
            if (formData[conflictField] === "Sim") {
              results.warnings.push({
                field: `${field}+${conflictField}`,
                message: rule.message,
              });
            }
          });
        }
        if (rule.implications) {
          rule.implications.forEach((implicationField) => {
            if (
              formData[implicationField] === "Não" ||
              formData[implicationField] === "Não se aplica"
            ) {
              results.warnings.push({
                field: implicationField,
                message: rule.message,
              });
            }
          });
        }
      });
    }
    validateVentilationSafety(formData, results) {
      const ventSupport = formData.for_SuporteVentilatorio || [];
      const sofaResp = formData.for_SOFARespiratorio;
      if (
        ventSupport.some((v) => this.ventilationChecks.oxygen.includes(v)) &&
        ["100-199 + suplem. Vent.", "<100 + suplem. Vent."].includes(sofaResp)
      ) {
        results.warnings.push({
          field: "for_SuporteVentilatorio",
          message:
            "SOFA respiratório sugere necessidade de ventilação mais invasiva",
        });
      }
      if (
        ventSupport.includes("Ventilação mecânica invasiva") &&
        formData.for_CandidatoTRE === "Sim" &&
        sofaResp &&
        [">= 400", "300-399"].includes(sofaResp)
      ) {
        results.warnings.push({
          field: "for_CandidatoTRE",
          message:
            "Paciente com bom SOFA respiratório - considerar desmame ventilatório",
        });
      }
    }
    validateNutritionSafety(formData, results) {
      if (formData.for_Nutrido === "Não") return;
      const isObese = formData.for_PacienteObeso === "Sim";
      const proteinValue = isObese
        ? formData.for_ObesoProteina
        : formData.for_NaoObesoProteina;
      if (proteinValue) {
        const numericProtein = parseFloat(
          String(proteinValue).replace(",", "."),
        );
        const maxSafeProtein =
          this.nutritionSafety.maxProtein[isObese ? "obese" : "nonObese"];
        if (numericProtein > maxSafeProtein) {
          results.warnings.push({
            field: isObese ? "for_ObesoProteina" : "for_NaoObesoProteina",
            message: `Proteína ${numericProtein}g/kg pode ser excessiva para paciente crítico`,
          });
        }
      }
      if (
        formData.for_MetaAtingida === "Não" &&
        formData.for_MetaJustificativaParenteral?.includes(
          "Risco de síndrome de realimentação",
        )
      ) {
        results.criticalAlerts.push({
          message:
            "Risco de síndrome de realimentação - monitorar eletrólitos rigorosamente",
        });
      }
    }
    validateInfectionControl(formData, results) {
      const hasInfection = formData.for_OpInfeccao === "Sim";
      const antibiotic = formData.for_AntiTerapia;
      const cultureGuided = formData.for_GuiadoCultura;
      if (hasInfection && antibiotic === "Sem antibiótico") {
        results.errors.push({
          field: "for_AntiTerapia",
          message: "Infecção presente mas sem antibioticoterapia",
        });
      }
      if (
        hasInfection &&
        antibiotic === "Terapêutica" &&
        cultureGuided === "Não"
      ) {
        results.warnings.push({
          field: "for_GuiadoCultura",
          message: "Terapia empírica - considerar coleta de culturas",
        });
      }
      const invasiveDevices = [
        formData.for_CVC === "Sim" ? "CVC" : null,
        formData.for_SVD === "Sim" ? "SVD" : null,
        formData.for_SuporteVentilatorio?.includes(
          "Ventilação mecânica invasiva",
        )
          ? "VM"
          : null,
      ].filter(Boolean);
      if (invasiveDevices.length >= 2 && !hasInfection) {
        results.warnings.push({
          field: "for_OpInfeccao",
          message: `Múltiplos dispositivos invasivos (${invasiveDevices.join(", ")}) - risco aumentado de infecção`,
        });
      }
    }
    calculateRiskScores(formData, results) {
      const sofaComponents = this.criticalFields
        .map((field) => this.convertSofaToNumeric(formData[field], field))
        .filter((score) => score !== null);
      if (sofaComponents.length >= 4) {
        const estimatedSOFA = sofaComponents.reduce(
          (sum, score) => sum + score,
          0,
        );
        const mortality = this.estimateMortality(estimatedSOFA);
        if (estimatedSOFA >= 10) {
          results.criticalAlerts.push({
            message: `SOFA estimado: ${estimatedSOFA} (mortalidade ~${mortality}) - Condição crítica`,
          });
        } else if (estimatedSOFA >= 6) {
          results.warnings.push({
            field: "SOFA_Total",
            message: `SOFA estimado: ${estimatedSOFA} (mortalidade ~${mortality}) - Monitorar evolução`,
          });
        }
      }
      const removableDevices = this.calculateRemovalOpportunities(formData);
      if (removableDevices.length > 0) {
        results.warnings.push({
          field: "Dispositivos",
          message: `Dispositivos possivelmente removíveis: ${removableDevices.join(", ")}`,
        });
      }
    }
    estimateMortality(sofaScore) {
      const mortalityMap = {
        0: "<1%",
        1: "<1%",
        2: "2%",
        3: "3%",
        4: "5%",
        5: "7%",
        6: "9%",
        7: "12%",
        8: "15%",
        9: "20%",
        10: "25%",
        11: "32%",
        12: "40%",
        13: "50%",
        14: "60%",
        15: "70%",
        16: "80%",
        17: "85%",
        18: "90%",
        19: "95%",
        20: ">95%",
      };
      return mortalityMap[Math.min(sofaScore, 20)] || ">95%";
    }
    calculateRemovalOpportunities(formData) {
      const removable = [];
      if (formData.for_SVD === "Sim" && formData.for_SVDRemocao === "Sim") {
        removable.push("SVD");
      }
      if (formData.for_CVC === "Sim" && formData.for_CVCRemocao === "Sim") {
        removable.push("CVC");
      }
      if (
        formData.for_CateterArterial === "Sim" &&
        formData.for_ArterialRemocao === "Sim"
      ) {
        removable.push("Cateter Arterial");
      }
      if (formData.for_Dreno === "Sim" && formData.for_DrenoRemocao === "Sim") {
        removable.push("Dreno");
      }
      return removable;
    }
  }

  // =================================================================================
  // FUNÇÕES AUXILIARES E DE LÓGICA
  // =================================================================================
  async function simulateUltimateInteraction(element) {
    try {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const dispatchEvent = (eventName, eventType = "Event", options = {}) => {
        let event;
        const defaultOptions = { bubbles: true, cancelable: true, ...options };
        switch (eventType) {
          case "KeyboardEvent":
            event = new KeyboardEvent(eventName, defaultOptions);
            break;
          case "MouseEvent":
            event = new MouseEvent(eventName, defaultOptions);
            break;
          default:
            event = new Event(eventName, defaultOptions);
            break;
        }
        element.dispatchEvent(event);
      };
      element.focus();
      dispatchEvent("mousedown", "MouseEvent");
      await delay(30);
      if (typeof element.selectionStart === "number") {
        element.selectionStart = element.selectionEnd = element.value.length;
      }
      const keyOptions = { key: "End", code: "End", keyCode: 35, which: 35 };
      dispatchEvent("keydown", "KeyboardEvent", keyOptions);
      await delay(50);
      dispatchEvent("keyup", "KeyboardEvent", keyOptions);
      dispatchEvent("input");
      dispatchEvent("change");
      await delay(30);
      element.blur();
    } catch (e) {
      console.warn(`Erro na simulação para ${element.name}:`, e);
    }
  }

  function extractFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return null;
    const formData = {};
    const elements = form.querySelectorAll(
      'input:not([type="button"]), select, textarea',
    );
    elements.forEach((element) => {
      const name = element.name;
      if (!name || element.disabled) return;
      let value;
      const type = element.type
        ? element.type.toLowerCase()
        : element.tagName.toLowerCase();
      switch (type) {
        case "checkbox":
          if (name.endsWith("[]")) {
            const baseName = name.slice(0, -2);
            if (!formData[baseName]) formData[baseName] = [];
            if (element.checked) formData[baseName].push(element.value);
          } else {
            formData[name] = element.checked;
          }
          break;
        case "radio":
          if (element.checked) formData[name] = element.value;
          else if (!(name in formData)) formData[name] = null;
          break;
        case "select-multiple":
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
    form.querySelectorAll(".selectMultText").forEach((comp) => {
      const s = comp.querySelector("select"),
        t = comp.querySelector("input.multText"),
        b = comp.querySelector('[name$="[]"]');
      if (s && t && b && b.name) {
        const n = b.name.slice(0, -2);
        if (!formData[n] || !Array.isArray(formData[n])) formData[n] = [];
        const sv = s.value,
          tv = t.value;
        if (sv || tv) {
          formData[n].push([sv, tv]);
          if (s.name && formData.hasOwnProperty(s.name))
            delete formData[s.name];
          if (t.name && formData.hasOwnProperty(t.name))
            delete formData[t.name];
        }
      }
    });
    return formData;
  }

  function downloadJson(data, filename = "formData.json") {
    if (!data || Object.keys(data).length === 0) {
      alert("Nada extraído.");
      return;
    }
    try {
      const s = JSON.stringify(data, null, 2);
      const b = new Blob([s], { type: "application/json" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(u);
    } catch (e) {
      console.error("Erro no download:", e);
      alert("Erro no download.");
    }
  }

  async function getJsonFromLlm(textToProcess) {
    const masterPrompt = `Você é um assistente de IA especializado em extrair informações clínicas estruturadas de texto não estruturado. Sua tarefa é analisar a história clínica do paciente que será fornecida no próximo prompt e gerar um objeto JSON que resuma os dados do paciente e as recomendações clínicas relevantes.

Instruções Detalhadas:

1.  Análise do Texto: Leia atentamente a história clínica completa do paciente fornecida. Extraia informações demográficas, detalhes da admissão, histórico médico, narrativa clínica, medicamentos, funcionalidade e outros dados pertinentes.
2.  Geração do JSON: Crie um objeto JSON usando os nomes de campo do formulário fornecidos abaixo (prefixados com \`for_\`).
3.  Formato Simplificado: Inclua SOMENTE os campos para os quais há informações relevantes na história clínica. NÃO inclua campos que seriam nulos, vazios ou "Não aplicável" com base no texto fornecido.
4.  Adesão aos Valores Permitidos: Para campos com opções predefinidas, você DEVE selecionar o valor mais apropriado clinicamente dentre as opções válidas listadas abaixo para esse campo específico. Se a informação exata não estiver presente, faça a melhor estimativa clínica com base no contexto (por exemplo, "responsiva" geralmente implica Glasgow 15) e, se apropriado, indique que é uma estimativa (ex: "(estimado)").
5.  Campos Condicionais: Preencha os campos condicionais apenas se a condição especificada for atendida pelo valor do campo pai. Por exemplo, \`for_SAVAS\` só deve ser incluído se \`for_PresencaDor\` for "Sim".
6.  Síntese e Resumo: Para campos como \`for_Admissa\`, \`for_FatosRelevantes\`, \`for_ProblemasAtivos\`, \`for_ComentarioSA\`, \`for_MetaHemodinamica\`, etc., sintetize as informações relevantes da história em um texto conciso e clinicamente apropriado.
7.  Recomendações Clínicas: Gere recomendações clínicas pertinentes com base na condição do paciente. Use o campo \`for_ClassificaoRecomendacoes\` para isso. Este campo deve ser um array de arrays, onde cada subarray contém dois strings: \`["Categoria da Recomendação", "Texto da Recomendação"]\`. Utilize exclusivamente as categorias listadas abaixo na seção "Restrições de Campos".
8.  Estimativas de SOFA: Se os dados exatos para calcular um componente do escore SOFA (Cardiovascular, Respiratório, Hepático, Renal, Hemato, Neurológico) não estiverem explicitamente declarados (ex: valor de bilirrubina, contagem de plaquetas, PaO2/FiO2), estime a categoria SOFA mais provável com base nos achados clínicos descritos (ex: icterícia, anúria, necessidade de O2, sangramento) e use a opção de valor correspondente da lista abaixo.
9.  Saída Final: A saída deve ser apenas o objeto JSON formatado corretamente, sem nenhum texto explicativo adicional, markdown ou comentários ao redor dele. Retorne APENAS o JSON válido.

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

    const LLM_MODEL = "mistralai/mistral-7b-instruct:free";
    const getApiKey = () => {
      const storageType =
        localStorage.getItem("apiKeyStoragePreference") === "local"
          ? "localStorage"
          : "sessionStorage";
      return window[storageType].getItem("openRouterApiKey");
    };
    let apiKey = getApiKey();
    if (!apiKey) {
      alert("Chave da API não encontrada. Por favor, configure-a.");
      return null;
    }
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.href,
            "X-Title": document.title,
          },
          body: JSON.stringify({
            model: LLM_MODEL,
            messages: [
              { role: "system", content: masterPrompt },
              { role: "user", content: textToProcess },
            ],
          }),
        },
      );
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Erro na API: ${response.status}\n${errorBody}`);
      }
      const data = await response.json();
      let jsonString = data.choices[0].message.content;
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
      return JSON.parse(jsonString);
    } catch (error) {
      alert(`Falha ao processar com o LLM: ${error.message}`);
      console.error("Erro LLM:", error);
      return null;
    }
  }

  // =================================================================================
  // FUNÇÃO PRINCIPAL PARA POPULAR O FORMULÁRIO (MODULAR E OTIMIZADA)
  // =================================================================================
  async function populateForm(formId, formDataToRestore) {
    const form = document.getElementById(formId);
    if (!form) {
      return console.error(`Formulário #${formId} não encontrado`);
    }
    if (!formDataToRestore || typeof formDataToRestore !== "object") {
      return console.error("Dados inválidos");
    }

    const allElements = new Map();
    form
      .querySelectorAll('input:not([type="button"]), select, textarea')
      .forEach((el) => {
        const name = el.name.replace("[]", "");
        if (!allElements.has(name)) {
          allElements.set(name, []);
        }
        allElements.get(name).push(el);
      });

    resetComplexComponents(form);

    for (const [fieldName, value] of Object.entries(formDataToRestore)) {
      try {
        const elements = allElements.get(fieldName) || [];
        if (elements.length === 0) continue;

        if (
          fieldName === "for_ClassificaoRecomendacoes" &&
          Array.isArray(value)
        ) {
          await handleRecommendationsField(form, fieldName, value);
        } else {
          await populateElements(elements, value);
        }
      } catch (error) {
        console.warn(`Erro ao processar o campo ${fieldName}:`, error);
      }
    }
    await updateConditionalFields(form);
  }

  function resetComplexComponents(form) {
    form.querySelectorAll(".selectMultText, .ng-matrix").forEach((comp) => {
      try {
        const rows = comp.querySelectorAll(":scope > div, tbody > tr");
        for (let i = rows.length - 1; i > 0; i--) {
          (
            rows[i].querySelector("button.btn-danger") || {
              click: () => rows[i].remove(),
            }
          ).click();
        }
        if (rows[0]) {
          rows[0]
            .querySelectorAll("input, select")
            .forEach((inp) => (inp.value = ""));
        }
      } catch (error) {
        console.warn("Erro ao resetar componente:", error);
      }
    });
  }

  async function populateElements(elements, value) {
    for (const element of elements) {
      const type = element.type
        ? element.type.toLowerCase()
        : element.tagName.toLowerCase();
      switch (type) {
        case "checkbox":
          element.checked = Array.isArray(value)
            ? value.map((v) => String(v)).includes(element.value)
            : !!value;
          break;
        case "radio":
          element.checked = String(element.value) === String(value);
          break;
        case "select-multiple":
          Array.from(element.options).forEach(
            (o) =>
              (o.selected = (
                Array.isArray(value) ? value.map((v) => String(v)) : []
              ).includes(o.value)),
          );
          break;
        default:
          element.value = value ?? "";
          break;
      }
      await simulateUltimateInteraction(element);
    }
  }

  async function handleRecommendationsField(form, fieldName, value) {
    const container = form.querySelector(`[id*="${fieldName}"]`);
    if (!container)
      throw new Error(`Container para ${fieldName} não encontrado`);

    const getDynamicRows = (c) => {
      if (!c._cachedRows || c._cachedRows.timestamp < Date.now() - 200) {
        c._cachedRows = {
          elements: c.querySelectorAll(
            ":scope > div.input-group, :scope > .selectMultText",
          ),
          timestamp: Date.now(),
        };
      }
      return c._cachedRows.elements;
    };

    const addButton = container.querySelector("button.btn-success");
    let currentRows = getDynamicRows(container);

    if (addButton) {
      for (let i = currentRows.length; i < value.length; i++) {
        addButton.click();
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    currentRows = getDynamicRows(container);

    for (let i = 0; i < Math.min(value.length, currentRows.length); i++) {
      const [selVal, txtVal] = value[i] || [];
      const sel = currentRows[i].querySelector("select");
      const txt = currentRows[i].querySelector("input.multText");
      if (sel && selVal) {
        sel.value = selVal;
        await simulateUltimateInteraction(sel);
      }
      if (txt && txtVal) {
        txt.value = txtVal;
        await simulateUltimateInteraction(txt);
      }
    }
  }

  async function updateConditionalFields(form) {
    if (typeof $ !== "undefined") {
      if (typeof hideShowCampo === "function") {
        try {
          $("*[data-condicao]").each(function () {
            hideShowCampo($(this));
          });
        } catch (e) {
          console.error("Erro ao executar hideShowCampo:", e);
        }
      }
      if ($.fn.chosen) {
        $('select.chosen-select, select[class*="chosen"]').trigger(
          "chosen:updated",
        );
      }
    }
  }

  // =================================================================================
  // FUNÇÕES DE UI E MODAIS
  // =================================================================================
  function showImportModal(targetFormId) {
    const modal = createModalContainer("llm-importer-modal");
    const { contentArea, footer } = createModalLayout(
      modal,
      "Importar Dados para o Formulário",
    );
    const textArea = document.createElement("textarea");
    textArea.placeholder =
      "Cole aqui o JSON completo ou as notas do paciente...";
    textArea.style.cssText =
      "width: 100%; flex-grow: 1; font-family: monospace; font-size: 14px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; resize: none;";
    contentArea.appendChild(textArea);
    const btnProcess = createButton("Processar", "primary", async () => {
      const text = textArea.value;
      if (!text.trim()) return alert("Área de texto vazia.");
      btnProcess.textContent = "Processando...";
      btnProcess.disabled = true;
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch (e) {
        jsonData = await getJsonFromLlm(text);
      }
      if (jsonData) {
        const validator = new EnhancedMedicalValidator();
        const validationResults = validator.validate(jsonData);
        showConfirmationScreen(
          targetFormId,
          jsonData,
          validationResults,
          modal,
        );
      } else {
        btnProcess.textContent = "Processar Texto ou JSON";
        btnProcess.disabled = false;
      }
    });
    footer.appendChild(
      createButton("Fechar", "secondary", () => modal.remove()),
    );
    footer.appendChild(btnProcess);
    document.body.appendChild(modal);
    textArea.focus();
  }

  function showConfirmationScreen(
    targetFormId,
    jsonData,
    validationResults,
    modal,
  ) {
    const { contentArea, footer } = createModalLayout(
      modal,
      "Revisão e Validação dos Dados",
    );
    const validationBox = document.createElement("div");
    validationBox.style.cssText =
      "max-height: 180px; overflow-y: auto; margin-bottom: 10px; border: 1px solid #eee; padding: 10px; border-radius: 5px; background: #fafafa;";
    let validationHTML = "";
    const createAlertList = (title, items, color) => {
      if (items.length === 0) return "";
      let list = `<div style="color: ${color}; margin-bottom: 8px;"><strong>${title}:</strong><ul style="margin: 4px 0 0 20px; padding: 0;">`;
      items.forEach((item) => {
        list += `<li style="margin-bottom: 2px;">${item.field ? `<strong>${item.field}:</strong> ` : ""}${item.message}</li>`;
      });
      list += "</ul></div>";
      return list;
    };
    validationHTML += createAlertList(
      "⚠️ Alertas Críticos",
      validationResults.criticalAlerts,
      "#d32f2f",
    );
    validationHTML += createAlertList(
      "❌ Erros de Consistência",
      validationResults.errors,
      "#f57c00",
    );
    validationHTML += createAlertList(
      "⚡ Avisos e Oportunidades",
      validationResults.warnings,
      "#1976d2",
    );
    if (validationHTML === "") {
      validationHTML =
        '<div style="color: #28a745;"><strong>✅ Nenhum problema de validação encontrado.</strong></div>';
    }
    validationBox.innerHTML = validationHTML;
    contentArea.appendChild(validationBox);
    const pre = document.createElement("pre");
    pre.style.cssText =
      "flex-grow: 1; background: #f4f4f4; padding: 10px; overflow: auto; border-radius: 5px;";
    pre.textContent = JSON.stringify(jsonData, null, 2);
    contentArea.appendChild(pre);
    const btnApply = createButton("Aplicar ao Formulário", "success", () => {
      populateForm(targetFormId, jsonData);
      modal.remove();
      alert("Formulário populado!");
    });
    footer.appendChild(
      createButton("Cancelar", "secondary", () => modal.remove()),
    );
    footer.appendChild(btnApply);
  }

  function showSettingsModal() {
    const modal = createModalContainer("llm-settings-modal", "500px");
    const { contentArea, footer } = createModalLayout(
      modal,
      "Configurações",
      "column",
      "15px",
    );
    contentArea.innerHTML = `<label for="apiKeyInput" style="font-weight: bold;">Chave da API do OpenRouter:</label>`;
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.id = "apiKeyInput";
    keyInput.style.cssText =
      "width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;";
    keyInput.value =
      localStorage.getItem("openRouterApiKey") ||
      sessionStorage.getItem("openRouterApiKey") ||
      "";
    contentArea.appendChild(keyInput);
    const checkboxContainer = document.createElement("div");
    checkboxContainer.style.cssText =
      "display: flex; align-items: center; gap: 8px;";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "rememberApiKeyCheckbox";
    checkbox.checked =
      localStorage.getItem("apiKeyStoragePreference") === "local";
    checkboxContainer.appendChild(checkbox);
    const checkboxLabel = document.createElement("label");
    checkboxLabel.textContent = "Salvar chave permanentemente neste navegador";
    checkboxLabel.htmlFor = "rememberApiKeyCheckbox";
    checkboxContainer.appendChild(checkboxLabel);
    contentArea.appendChild(checkboxContainer);
    const btnSave = createButton("Salvar", "success", () => {
      const key = keyInput.value.trim();
      localStorage.removeItem("openRouterApiKey");
      sessionStorage.removeItem("openRouterApiKey");
      if (key) {
        const storage = checkbox.checked ? localStorage : sessionStorage;
        storage.setItem("openRouterApiKey", key);
        localStorage.setItem(
          "apiKeyStoragePreference",
          checkbox.checked ? "local" : "session",
        );
        alert("Configurações salvas!");
        modal.remove();
      } else {
        alert("A chave foi limpa.");
      }
    });
    footer.appendChild(
      createButton("Fechar", "secondary", () => modal.remove()),
    );
    footer.appendChild(btnSave);
  }

  function createModalContainer(id, maxWidth = "700px") {
    const oldModal = document.getElementById(id);
    if (oldModal) oldModal.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10002; display: flex; align-items: center; justify-content: center;`;
    overlay.style.maxWidthRef = maxWidth;
    return overlay;
  }

  function createModalLayout(
    overlay,
    titleText,
    direction = "column",
    gap = "0",
  ) {
    const modalContent = document.createElement("div");
    modalContent.style.cssText = `background: #fff; padding: 25px; border-radius: 8px; width: 90%; max-width: ${overlay.style.maxWidthRef || "700px"}; height: 80%; max-height: 600px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); display: flex; flex-direction: ${direction}; gap: ${gap};`;
    const title = document.createElement("h3");
    title.textContent = titleText;
    title.style.cssText = "margin: 0 0 15px 0; text-align: center;";
    const contentArea = document.createElement("div");
    contentArea.style.cssText =
      "flex-grow: 1; display: flex; flex-direction: column; overflow: hidden;";
    const footer = document.createElement("div");
    footer.style.cssText =
      "padding-top: 15px; display: flex; justify-content: flex-end; gap: 10px;";
    modalContent.append(title, contentArea, footer);
    overlay.appendChild(modalContent);
    return { contentArea, footer };
  }

  function createButton(text, type, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    const colors = {
      primary: "#007bff",
      secondary: "#6c757d",
      success: "#28a745",
      danger: "#dc3545",
    };
    btn.style.cssText = `padding: 10px 15px; background: ${colors[type]}; color: white; border: none; border-radius: 5px; cursor: pointer;`;
    btn.onclick = onClick;
    return btn;
  }

  function cleanup() {
    const container = document.getElementById("form-tools-container-unique");
    if (container) {
      container
        .querySelectorAll("button")
        .forEach((btn) => (btn.onclick = null));
      container.remove();
    }
  }

  function createFormToolsUI(targetFormId = "formPreencher") {
    cleanup();
    const container = document.createElement("div");
    container.id = "form-tools-container-unique";
    container.style.cssText = `position:fixed;top:10px;right:10px;z-index:10001;background:#f0f0f0;border:1px solid #ccc;border-radius:8px;padding:15px;box-shadow:0 4px 8px rgba(0,0,0,0.2);font-family:Arial,sans-serif;font-size:14px;max-width:250px;display:flex;flex-direction:column;gap:10px;`;
    const title = document.createElement("h4");
    title.textContent = "Ferramentas Formulário";
    title.style.cssText = "margin:0; text-align:center;color:#333;";
    container.appendChild(title);
    container.appendChild(
      createButton("Exportar Dados", "success", () => {
        const data = extractFormData(targetFormId);
        if (data)
          downloadJson(
            data,
            `form_${targetFormId}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
          );
      }),
    );
    container.appendChild(
      createButton("Importar com Assistente...", "primary", () =>
        showImportModal(targetFormId),
      ),
    );
    container.appendChild(
      createButton("Configurações", "secondary", showSettingsModal),
    );
    container.appendChild(createButton("Fechar", "danger", cleanup));
    container
      .querySelectorAll("button")
      .forEach((b) => (b.style.width = "100%"));
    document.body.appendChild(container);
  }

  // --- INICIALIZAÇÃO ---
  createFormToolsUI("formPreencher");
})();
