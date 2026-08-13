export class Userver03Generator {
    targetId = 'userver03';
    name = 'userver03 (Boolean Expressions JSON)';
    fileExtension = 'cfg';
    mimeType = 'application/json';
    generate(ir) {
        const lines = [];
        // 1. Processar Transições e Evolução de Etapas (Set e Reset das memórias Mn)
        for (const transition of ir.transitions) {
            const normalizedReceptivity = this.normalizeReceptivity(transition.receptivity);
            // Condição de origem: M1 ou (M1*M2) para convergência E
            const fromCond = transition.fromSteps
                .map(stepId => `M${stepId}`)
                .join('*');
            const fullCondition = normalizedReceptivity
                ? `${fromCond}*${normalizedReceptivity}`
                : fromCond;
            // Ativação das etapas de destino (Set M_to)
            for (const toStepId of transition.toSteps) {
                lines.push(`SM${toStepId}=${fullCondition}`);
            }
            // Desativação das etapas de origem (Reset M_from)
            for (const fromStepId of transition.fromSteps) {
                lines.push(`RM${fromStepId}=${fullCondition}`);
            }
        }
        // 2. Processar Ações associadas a cada Etapa
        for (const step of ir.steps) {
            const stepMarker = `M${step.id}`;
            for (const action of step.actions) {
                // Extrair Qualificador (X, S, R, Z, T), Tipo (Q, M, T, C, A) e Canal (1..N)
                const qualifier = (action.qualifier || action.type || 'X').toUpperCase();
                let resourceType = (action.resourceType || 'Q').toUpperCase();
                let channel = action.channel || 1;
                // Suporte para campos herdados caso 'target' estivesse preenchido (ex: "Q3")
                if (action.target && !action.resourceType) {
                    const match = action.target.match(/^([a-zA-Z]+)(\d+)$/);
                    if (match) {
                        resourceType = match[1].toUpperCase();
                        channel = parseInt(match[2], 10);
                    }
                }
                const coilTarget = `${resourceType}${channel}`;
                switch (qualifier) {
                    case 'X':
                    case 'P':
                    case 'N': // Sem Retenção (Normal)
                        lines.push(`S${coilTarget}=${stepMarker}`);
                        lines.push(`R${coilTarget}=!${stepMarker}`);
                        break;
                    case 'S': // Set (Ativa Retenção / Latch)
                        lines.push(`S${coilTarget}=${stepMarker}`);
                        break;
                    case 'R': // Reset (Desativa Retenção / Unlatch)
                        lines.push(`R${coilTarget}=${stepMarker}`);
                        break;
                    case 'Z': // Toggle (Inverte Estado)
                        lines.push(`Z${coilTarget}=${stepMarker}`);
                        break;
                    case 'T': // Ativação Temporizada
                        lines.push(`T${coilTarget}=${stepMarker}`);
                        break;
                    default:
                        lines.push(`S${coilTarget}=${stepMarker}`);
                        break;
                }
            }
        }
        // 3. Coletar e agrupar parâmetros de recursos T (Timer), C (Contador), A (Comparador Analógico)
        const timersMap = new Map();
        const countersMap = new Map();
        const comparersMap = new Map();
        // Inicializar com entradas explícitas do ir.timers, ir.counters, ir.comparers
        (ir.timers || []).forEach(t => timersMap.set(t.id, { id: t.id, fun: t.functionType ?? 1, pst: t.preset ?? 5, ofs: t.offset ?? 0 }));
        (ir.counters || []).forEach(c => countersMap.set(c.id, { id: c.id, fun: c.functionType ?? 1, pst: c.preset ?? 5, ofs: c.offset ?? 0 }));
        (ir.comparers || []).forEach(cmp => comparersMap.set(cmp.id, { id: cmp.id, prt: cmp.port ?? 1, fun: cmp.functionType ?? 2, pst: cmp.preset ?? 2.15, ofs: cmp.offset ?? 0 }));
        // Varrer ações das etapas para incluir configurações de T, C, A definidos nas ações
        for (const step of ir.steps) {
            for (const action of step.actions) {
                let resourceType = (action.resourceType || '').toUpperCase();
                let channel = Number(action.channel);
                // Fallback de extração se o alvo veio de string como "T1", "C2" ou "A1"
                if ((!resourceType || isNaN(channel)) && action.target) {
                    const match = action.target.match(/^([a-zA-Z]+)(\d+)$/);
                    if (match) {
                        resourceType = match[1].toUpperCase();
                        channel = parseInt(match[2], 10);
                    }
                }
                if (resourceType === 'T' && !isNaN(channel)) {
                    if (!timersMap.has(channel) || action.preset !== undefined) {
                        timersMap.set(channel, {
                            id: channel,
                            fun: action.functionType ?? 1,
                            pst: action.preset ?? 5,
                            ofs: action.offset ?? 0
                        });
                    }
                }
                else if (resourceType === 'C' && !isNaN(channel)) {
                    if (!countersMap.has(channel) || action.preset !== undefined) {
                        countersMap.set(channel, {
                            id: channel,
                            fun: action.functionType ?? 1,
                            pst: action.preset ?? 5,
                            ofs: action.offset ?? 0
                        });
                    }
                }
                else if (resourceType === 'A' && !isNaN(channel)) {
                    if (!comparersMap.has(channel) || action.preset !== undefined) {
                        comparersMap.set(channel, {
                            id: channel,
                            prt: action.port ?? 1,
                            fun: action.functionType ?? 2,
                            pst: action.preset ?? 2.15,
                            ofs: action.offset ?? 0
                        });
                    }
                }
            }
        }
        // Varrer receptividades das transições para auto-detectar T, C, A referenciados no fluxo (ex: T1, T2)
        for (const transition of ir.transitions) {
            if (transition.receptivity) {
                const timerMatches = transition.receptivity.match(/\bT(\d+)\b/gi);
                if (timerMatches) {
                    timerMatches.forEach(m => {
                        const id = parseInt(m.substring(1), 10);
                        if (!isNaN(id) && !timersMap.has(id)) {
                            timersMap.set(id, { id: id, fun: 1, pst: 5, ofs: 0 });
                        }
                    });
                }
                const counterMatches = transition.receptivity.match(/\bC(\d+)\b/gi);
                if (counterMatches) {
                    counterMatches.forEach(m => {
                        const id = parseInt(m.substring(1), 10);
                        if (!isNaN(id) && !countersMap.has(id)) {
                            countersMap.set(id, { id: id, fun: 1, pst: 5, ofs: 0 });
                        }
                    });
                }
                const comparerMatches = transition.receptivity.match(/\bA(\d+)\b/gi);
                if (comparerMatches) {
                    comparerMatches.forEach(m => {
                        const id = parseInt(m.substring(1), 10);
                        if (!isNaN(id) && !comparersMap.has(id)) {
                            comparersMap.set(id, { id: id, prt: 1, fun: 2, pst: 2.15, ofs: 0 });
                        }
                    });
                }
            }
        }
        // 4. Montar a estrutura final do JSON do userver03 (/code_param.cfg)
        const jsonOutput = {
            lines: lines,
            timers: Array.from(timersMap.values()).sort((a, b) => a.id - b.id),
            counters: Array.from(countersMap.values()).sort((a, b) => a.id - b.id),
            comparers: Array.from(comparersMap.values()).sort((a, b) => a.id - b.id)
        };
        return {
            targetId: this.targetId,
            filename: 'code_param.cfg',
            mimeType: this.mimeType,
            content: JSON.stringify(jsonOutput, null, 2),
            metadata: {
                totalLines: lines.length,
                stepsCount: ir.steps.length,
                transitionsCount: ir.transitions.length
            }
        };
    }
    /**
     * Normaliza operadores lógicos para a sintaxe do userver03 (*, +, !)
     */
    normalizeReceptivity(receptivity) {
        if (!receptivity)
            return '';
        return receptivity
            .replace(/\s+/g, '') // remove espaços extras
            .replace(/AND/gi, '*')
            .replace(/&&/g, '*')
            .replace(/OR/gi, '+')
            .replace(/\|\|/g, '+')
            .replace(/NOT/gi, '!')
            .replace(/~/g, '!');
    }
}
