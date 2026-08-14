/**
 * Grafcet Compiler Bridge - Converte a estrutura de UI do GrafcetEditor
 * para o formato do interpretador userver03 (code_param.cfg).
 */

function buildGrafcetIR(stepsList) {
  const steps = [];
  const transitions = [];
  const processedTransitions = new Set();

  stepsList.forEach((s) => {
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
      id: s.id,
      isInitial: s.type === 'start_step',
      actions: irActions
    });

    // Converter Transições ligadas a este passo
    if (s.outputs && s.outputs.length > 0) {
      s.outputs.forEach((targetStepId) => {
        const transKey = `${s.id}->${targetStepId}`;
        if (!processedTransitions.has(transKey)) {
          processedTransitions.add(transKey);

          // Obter receptividade definida no modelo (padrão: I{stepId})
          const receptivity = (s.transitions && s.transitions[0] && s.transitions[0].receptivity) 
            ? s.transitions[0].receptivity 
            : `I${s.id}`;

          transitions.push({
            id: transitions.length + 1,
            fromSteps: [s.id],
            toSteps: [targetStepId],
            receptivity: receptivity
          });
        }
      });
    }
  });

  return {
    steps: steps,
    transitions: transitions,
    timers: [],
    counters: [],
    comparers: []
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
  ir.transitions.forEach((t) => {
    const receptivity = normalizeReceptivity(t.receptivity);
    const fromCond = t.fromSteps.map((id) => `M${id}`).join('*');
    const fullCond = receptivity ? `${fromCond}*${receptivity}` : fromCond;

    t.toSteps.forEach((toId) => {
      lines.push(`SM${toId}=${fullCond}`);
    });

    t.fromSteps.forEach((fromId) => {
      lines.push(`RM${fromId}=${fullCond}`);
    });
  });

  // 2. Linhas de Ações
  ir.steps.forEach((s) => {
    const stepMarker = `M${s.id}`;
    s.actions.forEach((a) => {
      const target = a.target.toUpperCase();
      switch (a.type) {
        case 'X':
        case 'P':
        case 'N': // Sem Retenção (Normal)
          lines.push(`S${target}=${stepMarker}`);
          lines.push(`R${target}=!${stepMarker}`);
          break;
        case 'S': // Set (Ativa Retenção / Latch)
          lines.push(`S${target}=${stepMarker}`);
          break;
        case 'R': // Reset (Desativa Retenção / Unlatch)
          lines.push(`R${target}=${stepMarker}`);
          break;
        case 'Z': // Toggle (Inverte Estado)
          lines.push(`Z${target}=${stepMarker}`);
          break;
        case 'T': // Ativação Temporizada
          lines.push(`T${target}=${stepMarker}`);
          break;
        default:
          lines.push(`S${target}=${stepMarker}`);
          break;
      }
    });
  });

  // 3. Coletar e agrupar parâmetros de recursos T (Timer), C (Contador), A (Comparador Analógico)
  const timersMap = new Map();
  const countersMap = new Map();
  const comparersMap = new Map();

  (ir.timers || []).forEach(t => timersMap.set(t.id, { id: t.id, fun: t.functionType ?? 1, pst: t.preset ?? 5, ofs: t.offset ?? 0 }));
  (ir.counters || []).forEach(c => countersMap.set(c.id, { id: c.id, fun: c.functionType ?? 1, pst: c.preset ?? 5, ofs: c.offset ?? 0 }));
  (ir.comparers || []).forEach(cmp => comparersMap.set(cmp.id, { id: cmp.id, prt: cmp.port ?? 1, fun: cmp.functionType ?? 2, pst: cmp.preset ?? 2.15, ofs: cmp.offset ?? 0 }));

  ir.steps.forEach((s) => {
    (s.actions || []).forEach((a) => {
      let resourceType = (a.resourceType || '').toUpperCase();
      let channel = Number(a.channel);

      if ((!resourceType || isNaN(channel)) && a.target) {
        const match = a.target.match(/^([a-zA-Z]+)(\d+)$/);
        if (match) {
          resourceType = match[1].toUpperCase();
          channel = parseInt(match[2], 10);
        }
      }

      if (resourceType === 'T' && !isNaN(channel)) {
        if (!timersMap.has(channel) || a.preset !== undefined) {
          timersMap.set(channel, {
            id: channel,
            fun: a.functionType ?? 1,
            pst: a.preset ?? 5,
            ofs: a.offset ?? 0
          });
        }
      } else if (resourceType === 'C' && !isNaN(channel)) {
        if (!countersMap.has(channel) || a.preset !== undefined) {
          countersMap.set(channel, {
            id: channel,
            fun: a.functionType ?? 1,
            pst: a.preset ?? 5,
            ofs: a.offset ?? 0
          });
        }
      } else if (resourceType === 'A' && !isNaN(channel)) {
        if (!comparersMap.has(channel) || a.preset !== undefined) {
          comparersMap.set(channel, {
            id: channel,
            prt: a.port ?? 1,
            fun: a.functionType ?? 2,
            pst: a.preset ?? 2.15,
            ofs: a.offset ?? 0
          });
        }
      }
    });
  });

  (ir.transitions || []).forEach((t) => {
    if (t.receptivity) {
      const timerMatches = t.receptivity.match(/\bT(\d+)\b/gi);
      if (timerMatches) {
        timerMatches.forEach((m) => {
          const id = parseInt(m.substring(1), 10);
          if (!isNaN(id) && !timersMap.has(id)) {
            timersMap.set(id, { id: id, fun: 1, pst: 5, ofs: 0 });
          }
        });
      }

      const counterMatches = t.receptivity.match(/\bC(\d+)\b/gi);
      if (counterMatches) {
        counterMatches.forEach((m) => {
          const id = parseInt(m.substring(1), 10);
          if (!isNaN(id) && !countersMap.has(id)) {
            countersMap.set(id, { id: id, fun: 1, pst: 5, ofs: 0 });
          }
        });
      }

      const comparerMatches = t.receptivity.match(/\bA(\d+)\b/gi);
      if (comparerMatches) {
        comparerMatches.forEach((m) => {
          const id = parseInt(m.substring(1), 10);
          if (!isNaN(id) && !comparersMap.has(id)) {
            comparersMap.set(id, { id: id, prt: 1, fun: 2, pst: 2.15, ofs: 0 });
          }
        });
      }
    }
  });

  if (lines.length > 0) {
    lines[lines.length - 1] += ';';
  }

  const configObj = {
    lines: lines,
    timers: Array.from(timersMap.values()).sort((a, b) => a.id - b.id),
    counters: Array.from(countersMap.values()).sort((a, b) => a.id - b.id),
    comparers: Array.from(comparersMap.values()).sort((a, b) => a.id - b.id)
  };

  return {
    filename: 'code_param.cfg',
    json: JSON.stringify(configObj, null, 2),
    lines: lines
  };
}

function compile(steps) {
  const ir = buildGrafcetIR(stepsList);
  const output = generateUserver03(ir);

  console.log("=== COMPILAÇÃO USERVER03 (code_param.cfg) ===");
  console.log(output.json);
  
  return output;
}
