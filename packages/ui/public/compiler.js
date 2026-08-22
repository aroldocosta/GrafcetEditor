/**
 * Grafcet Compiler Bridge - Converte a estrutura de UI do GrafcetEditor
 * para o formato do interpretador userver03 (code_param.cfg).
 */

function buildGrafcetIR(stepsList) {
  const steps = [];
  const transitions = [];
  const processedTransitions = new Set();
  const stepsMap = new Map(stepsList.map(s => [s.id, s]));

  // 1. Filtrar e mapear apenas etapas reais (Start e Active)
  const realSteps = stepsList.filter(s => s.type === 'start_step' || s.type === 'active_step');

  // Mapear ID interno para o número visual da etapa (1, 2, 3...)
  const idToVisualMap = new Map();
  realSteps.forEach((s, idx) => {
    let visualNum = idx + 1;
    if (s.element) {
      const inner = s.element.querySelector('.inner-rect');
      if (inner && inner.textContent.trim()) {
        const parsed = parseInt(inner.textContent.trim(), 10);
        if (!isNaN(parsed)) visualNum = parsed;
      }
    } else if (s.stepNumber !== undefined && !isNaN(Number(s.stepNumber))) {
      visualNum = Number(s.stepNumber);
    }
    idToVisualMap.set(s.id, visualNum);
  });

  realSteps.forEach((s) => {
    const visualFromId = idToVisualMap.get(s.id) || s.id;

    // Converter Ações da UI para o modelo IR
    const irActions = (s.actions || []).map((a) => {
      const qualifier = a.qualifier || (a.type === 'S' ? 'S' : a.type === 'R' ? 'R' : a.type === 'Z' ? 'Z' : a.type === 'T' ? 'T' : 'X');
      const resourceType = a.resourceType || 'Q';
      const channel = Number(a.channel) || 1;
      const target = a.target || `${resourceType}${channel}`;

      return {
        qualifier: qualifier,
        resourceType: resourceType,
        channel: channel,
        target: target,
        type: qualifier,
        description: a.description || '',
        functionType: a.functionType,
        preset: a.preset,
        offset: a.offset,
        port: a.port
      };
    });

    steps.push({
      id: visualFromId,
      isInitial: s.type === 'start_step',
      actions: irActions
    });

    // 2. Resolver as transições de saída a partir de s
    if (s.outputs && s.outputs.length > 0) {
      s.outputs.forEach((targetStepId) => {
        const targetNode = stepsMap.get(targetStepId);
        if (!targetNode) return;

        // Caso A: Conexão direta Step -> Step
        if (targetNode.type === 'start_step' || targetNode.type === 'active_step') {
          const transKey = `${s.id}->${targetNode.id}`;
          if (!processedTransitions.has(transKey)) {
            processedTransitions.add(transKey);
            const toVisualId = idToVisualMap.get(targetNode.id) || targetNode.id;
            const receptivity = (s.transitions && s.transitions[0] && s.transitions[0].receptivity) 
              ? s.transitions[0].receptivity 
              : `I${visualFromId}`;

            transitions.push({
              id: transitions.length + 1,
              fromSteps: [visualFromId],
              toSteps: [toVisualId],
              receptivity: receptivity
            });
          }
        }
        // Caso B: Step -> Divergência OR
        else if (targetNode.type === 'or_divergence') {
          const branches = [0, 1];
          branches.forEach(branchIdx => {
            const destId = targetNode.branchOutputs ? targetNode.branchOutputs[String(branchIdx)] : undefined;
            if (destId) {
              const destNode = stepsMap.get(destId);
              if (destNode && (destNode.type === 'start_step' || destNode.type === 'active_step')) {
                const transKey = `${s.id}->div(${targetNode.id}:${branchIdx})->${destNode.id}`;
                if (!processedTransitions.has(transKey)) {
                  processedTransitions.add(transKey);
                  const destVisualId = idToVisualMap.get(destNode.id) || destNode.id;
                  const receptivity = (targetNode.transitions && targetNode.transitions[branchIdx] && targetNode.transitions[branchIdx].receptivity)
                    ? targetNode.transitions[branchIdx].receptivity
                    : `1`;

                  transitions.push({
                    id: transitions.length + 1,
                    fromSteps: [visualFromId],
                    toSteps: [destVisualId],
                    receptivity: receptivity
                  });
                }
              }
            }
          });
        }
        // Caso C: Step -> Convergência OR
        else if (targetNode.type === 'or_convergence') {
          if (targetNode.outputs && targetNode.outputs.length > 0) {
            targetNode.outputs.forEach(finalDestId => {
              const finalDestNode = stepsMap.get(finalDestId);
              if (finalDestNode && (finalDestNode.type === 'start_step' || finalDestNode.type === 'active_step')) {
                const transKey = `${s.id}->conv(${targetNode.id})->${finalDestNode.id}`;
                if (!processedTransitions.has(transKey)) {
                  processedTransitions.add(transKey);
                  const finalDestVisualId = idToVisualMap.get(finalDestNode.id) || finalDestNode.id;
                  const receptivity = (s.transitions && s.transitions[0] && s.transitions[0].receptivity)
                    ? s.transitions[0].receptivity
                    : `I${visualFromId}`;

                  transitions.push({
                    id: transitions.length + 1,
                    fromSteps: [visualFromId],
                    toSteps: [finalDestVisualId],
                    receptivity: receptivity
                  });
                }
              }
            });
          }
        }
      });
    }
  });

  steps.sort((a, b) => a.id - b.id);

  return {
    steps: steps,
    transitions: transitions,
    timers: [],
    counters: [],
    comparats: []
  };
}

function normalizeReceptivity(receptivity) {
  if (!receptivity) return '';
  return receptivity
    .replace(/\s+/g, '')
    .replace(/AND/gi, '*')
    .replace(/&&/g, '*')
    .replace(/OR/gi, '+')
    .replace(/\|\|/g, '+')
    .replace(/NOT/gi, '!')
    .replace(/~/g, '!');
}

function generateUserver03(ir) {
  const lines = [];

  // 1. Equações de Evolução das Etapas (SMn e RMn)
  const setMap = new Map();
  const resetMap = new Map();

  ir.transitions.forEach((t) => {
    const receptivity = normalizeReceptivity(t.receptivity);
    const fromCond = t.fromSteps.map((id) => `M${id}`).join('*');
    const fullCond = receptivity ? `${fromCond}*${receptivity}` : fromCond;

    t.toSteps.forEach((toId) => {
      if (!setMap.has(toId)) setMap.set(toId, []);
      setMap.get(toId).push(fullCond);
    });

    t.fromSteps.forEach((fromId) => {
      if (!resetMap.has(fromId)) resetMap.set(fromId, []);
      resetMap.get(fromId).push(fullCond);
    });
  });

  for (const [stepId, conditions] of setMap.entries()) {
    lines.push(`SM${stepId}=${conditions.join('+')}`);
  }

  for (const [stepId, conditions] of resetMap.entries()) {
    lines.push(`RM${stepId}=${conditions.join('+')}`);
  }

  // 2. Ações Associadas às Etapas (agrupadas por chave de bobina)
  const actionsMap = new Map();

  ir.steps.forEach((s) => {
    const stepMarker = `M${s.id}`;
    (s.actions || []).forEach((a) => {
      const q = (a.qualifier || 'X').toUpperCase();
      let resourceType = (a.resourceType || '').toUpperCase();
      let channel = a.channel;

      if (!resourceType && a.target) {
        const match = a.target.match(/^([A-Za-z]+)(\d+)$/);
        if (match) {
          resourceType = match[1].toUpperCase();
          channel = match[2];
        }
      }

      if (!resourceType) resourceType = 'Q';
      if (channel === undefined || channel === null) channel = 1;

      let effectiveQualifier = q;
      if (q === 'T') {
        resourceType = 'T';
        effectiveQualifier = 'X';
      }

      const targetStr = `${resourceType}${channel}`;
      let coilPrefix = 'X';

      if (effectiveQualifier === 'X' || effectiveQualifier === 'N' || effectiveQualifier === 'P') {
        coilPrefix = 'X';
      } else if (effectiveQualifier === 'S') {
        coilPrefix = 'S';
      } else if (effectiveQualifier === 'R') {
        coilPrefix = 'R';
      } else if (effectiveQualifier === 'Z') {
        coilPrefix = 'Z';
      } else {
        coilPrefix = effectiveQualifier;
      }

      const coilKey = `${coilPrefix}${targetStr}`;

      if (!actionsMap.has(coilKey)) {
        actionsMap.set(coilKey, []);
      }
      const stepList = actionsMap.get(coilKey);
      if (!stepList.includes(stepMarker)) {
        stepList.push(stepMarker);
      }
    });
  });

  for (const [coilKey, stepMarkers] of actionsMap.entries()) {
    lines.push(`${coilKey}=${stepMarkers.join('+')}`);
  }

  // 3. Coletar e agrupar parâmetros de recursos T (Timer), C (Contador), A (Comparador Analógico)
  const timersMap = new Map();
  const countersMap = new Map();
  const comparatsMap = new Map();

  (ir.timers || []).forEach(t => timersMap.set(t.id, {
    id: t.id,
    funct: t.funct ?? t.functionType ?? 1,
    preset: t.preset ?? 5,
    offset: t.offset ?? 0
  }));
  (ir.counters || []).forEach(c => countersMap.set(c.id, {
    id: c.id,
    funct: c.funct ?? c.functionType ?? 1,
    preset: c.preset ?? 5,
    offset: c.offset ?? 0
  }));
  (ir.comparats || ir.comparers || []).forEach(cmp => comparatsMap.set(cmp.id, {
    id: cmp.id,
    offset: cmp.offset ?? 0,
    funct: cmp.funct ?? cmp.functionType ?? 2,
    preset: cmp.preset ?? 2.15,
    analogId: cmp.analogId ?? cmp.port ?? 1
  }));

  ir.steps.forEach((s) => {
    (s.actions || []).forEach((a) => {
      let resourceType = (a.resourceType || '').toUpperCase();
      let channel = Number(a.channel);

      if (!resourceType && a.target) {
        const match = a.target.match(/^([A-Za-z]+)(\d+)$/);
        if (match) {
          resourceType = match[1].toUpperCase();
          channel = Number(match[2]);
        }
      }

      if (resourceType === 'T' && !isNaN(channel)) {
        if (!timersMap.has(channel) || a.preset !== undefined) {
          timersMap.set(channel, {
            id: channel,
            funct: a.functionType ?? (timersMap.get(channel)?.funct ?? 1),
            preset: a.preset ?? (timersMap.get(channel)?.preset ?? 5),
            offset: a.offset ?? (timersMap.get(channel)?.offset ?? 0)
          });
        }
      } else if (resourceType === 'C' && !isNaN(channel)) {
        if (!countersMap.has(channel) || a.preset !== undefined) {
          countersMap.set(channel, {
            id: channel,
            funct: a.functionType ?? (countersMap.get(channel)?.funct ?? 1),
            preset: a.preset ?? (countersMap.get(channel)?.preset ?? 5),
            offset: a.offset ?? (countersMap.get(channel)?.offset ?? 0)
          });
        }
      } else if (resourceType === 'A' && !isNaN(channel)) {
        if (!comparatsMap.has(channel) || a.preset !== undefined) {
          comparatsMap.set(channel, {
            id: channel,
            offset: a.offset ?? (comparatsMap.get(channel)?.offset ?? 0),
            funct: a.functionType ?? (comparatsMap.get(channel)?.funct ?? 2),
            preset: a.preset ?? (comparatsMap.get(channel)?.preset ?? 2.15),
            analogId: a.port ?? (comparatsMap.get(channel)?.analogId ?? 1)
          });
        }
      }
    });
  });

  ir.transitions.forEach((t) => {
    if (t.receptivity) {
      const timerMatches = t.receptivity.match(/\bT(\d+)\b/gi);
      if (timerMatches) {
        timerMatches.forEach((m) => {
          const id = parseInt(m.substring(1), 10);
          if (!isNaN(id) && !timersMap.has(id)) {
            timersMap.set(id, { id: id, funct: 1, preset: 5, offset: 0 });
          }
        });
      }

      const counterMatches = t.receptivity.match(/\bC(\d+)\b/gi);
      if (counterMatches) {
        counterMatches.forEach((m) => {
          const id = parseInt(m.substring(1), 10);
          if (!isNaN(id) && !countersMap.has(id)) {
            countersMap.set(id, { id: id, funct: 1, preset: 5, offset: 0 });
          }
        });
      }

      const comparerMatches = t.receptivity.match(/\bA(\d+)\b/gi);
      if (comparerMatches) {
        comparerMatches.forEach((m) => {
          const id = parseInt(m.substring(1), 10);
          if (!isNaN(id) && !comparatsMap.has(id)) {
            comparatsMap.set(id, { id: id, offset: 0, funct: 2, preset: 2.15, analogId: 1 });
          }
        });
      }
    }
  });

  const timers = Array.from(timersMap.values()).sort((a, b) => a.id - b.id);
  const counters = Array.from(countersMap.values()).sort((a, b) => a.id - b.id);
  const comparats = Array.from(comparatsMap.values()).sort((a, b) => a.id - b.id);

  const formattedOutput = formatInterpreterConfig({
    lines: lines,
    timers: timers,
    counters: counters,
    comparats: comparats
  });

  return {
    filename: 'code_param.cfg',
    output: formattedOutput,
    content: formattedOutput,
    lines: lines,
    config: {
      lines,
      timers,
      counters,
      comparats
    }
  };
}

function formatInterpreterConfig(data) {
  const linesSection = data.lines.length > 0
    ? 'lines:\n' + data.lines.map((line, idx) => {
        const isLast = idx === data.lines.length - 1;
        let cleanLine = line.trim();
        if (cleanLine.endsWith(';') || cleanLine.endsWith(',')) {
          cleanLine = cleanLine.slice(0, -1);
        }
        return `  ${cleanLine}${isLast ? ';' : ','}`;
      }).join('\n')
    : 'lines:';

  const timersSection = data.timers && data.timers.length > 0
    ? 'timers:\n' + data.timers.map((item, idx) => {
        const isLast = idx === data.timers.length - 1;
        return `  {id: ${item.id}, funct: ${item.funct}, preset: ${item.preset}, offset: ${item.offset}}${isLast ? '' : ','}`;
      }).join('\n')
    : 'timers:';

  const countersSection = data.counters && data.counters.length > 0
    ? 'counters:\n' + data.counters.map((item, idx) => {
        const isLast = idx === data.counters.length - 1;
        return `  {id: ${item.id}, funct: ${item.funct}, preset: ${item.preset}, offset: ${item.offset}}${isLast ? '' : ','}`;
      }).join('\n')
    : 'counters:';

  const comparatsSection = data.comparats && data.comparats.length > 0
    ? 'comparats:\n' + data.comparats.map((item, idx) => {
        const isLast = idx === data.comparats.length - 1;
        return `  {id: ${item.id}, funct: ${item.funct}, preset: ${item.preset}, offset: ${item.offset}, analogId: ${item.analogId}}${isLast ? '' : ','}`;
      }).join('\n')
    : 'comparats:';

  return [linesSection, timersSection, countersSection, comparatsSection].join('\n');
}

function compile(steps) {
  const ir = buildGrafcetIR(stepsList);
  const output = generateUserver03(ir);

  console.log("=== COMPILAÇÃO USERVER03 (code_param.cfg) ===");
  console.log(output.output);

  showCompileModal(output.output);
  return output;
}

function showCompileModal(compiledCode) {
  let overlay = document.querySelector(".modal-overlay.compile-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.className = "modal-overlay compile-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.minWidth = "560px";
  modal.style.maxWidth = "700px";

  modal.innerHTML = `
    <h2>Código Compilado (code_param.cfg)</h2>
    <div style="margin-bottom: 12px; font-size: 13px; color: #666;">
      Saída gerada para o interpretador / ESP32:
    </div>
    <textarea id="compiled-code-area" readonly style="
      width: 100%;
      height: 320px;
      font-family: monospace;
      font-size: 13px;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #f8f9fa;
      box-sizing: border-box;
      resize: vertical;
      white-space: pre;
    ">${compiledCode}</textarea>
    <div class="modal-buttons" style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
      <button id="copy-compiled-btn" class="modal-btn" style="background: #28a745; color: white;">Copiar</button>
      <button id="download-compiled-btn" class="modal-btn" style="background: #007bff; color: white;">Baixar .cfg</button>
      <button id="close-compiled-btn" class="modal-btn" style="background: #6c757d; color: white;">Fechar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector("#copy-compiled-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(compiledCode).then(() => {
      const btn = modal.querySelector("#copy-compiled-btn");
      btn.innerText = "Copiado!";
      setTimeout(() => { btn.innerText = "Copiar"; }, 2000);
    });
  });

  modal.querySelector("#download-compiled-btn").addEventListener("click", () => {
    const blob = new Blob([compiledCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "code_param.cfg";
    a.click();
    URL.revokeObjectURL(url);
  });

  modal.querySelector("#close-compiled-btn").addEventListener("click", () => {
    overlay.remove();
  });
}
