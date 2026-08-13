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
        description: a.description || ''
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

  const configObj = {
    lines: lines,
    timers: ir.timers || [],
    counters: ir.counters || [],
    comparers: ir.comparers || []
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
