export class Userver03Generator {
    targetId = 'userver03';
    name = 'userver03 (Boolean Expressions JSON)';
    fileExtension = 'cfg';
    mimeType = 'application/json';
    generate(ir) {
        const lines = [];
        // 1. Processar Transições e Evolução de Etapas (Set e Reset das memórias Mn)
        const setMap = new Map();
        const resetMap = new Map();
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
                if (!setMap.has(toStepId))
                    setMap.set(toStepId, []);
                setMap.get(toStepId).push(fullCondition);
            }
            // Desativação das etapas de origem (Reset M_from)
            for (const fromStepId of transition.fromSteps) {
                if (!resetMap.has(fromStepId))
                    resetMap.set(fromStepId, []);
                resetMap.get(fromStepId).push(fullCondition);
            }
        }
        // Adicionar equações de ativação de etapas (SMn)
        for (const [stepId, conditions] of setMap.entries()) {
            lines.push(`SM${stepId}=${conditions.join('+')}`);
        }
        // Adicionar equações de desativação de etapas (RMn)
        for (const [stepId, conditions] of resetMap.entries()) {
            lines.push(`RM${stepId}=${conditions.join('+')}`);
        }
        // 2. Processar Ações associadas a cada Etapa (agrupadas por chave de bobina)
        const actionsMap = new Map();
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
                let coilKey = '';
                if (qualifier === 'T' || resourceType === 'T') {
                    coilKey = `T${channel}`;
                }
                else {
                    const coilTarget = `${resourceType}${channel}`;
                    switch (qualifier) {
                        case 'X':
                        case 'P':
                        case 'N': // Sem Retenção (Normal)
                            coilKey = `X${coilTarget}`;
                            break;
                        case 'S': // Set (Ativa Retenção / Latch)
                            coilKey = `S${coilTarget}`;
                            break;
                        case 'R': // Reset (Desativa Retenção / Unlatch)
                            coilKey = `R${coilTarget}`;
                            break;
                        case 'Z': // Toggle (Inverte Estado)
                            coilKey = `Z${coilTarget}`;
                            break;
                        default:
                            coilKey = `${qualifier}${coilTarget}`;
                            break;
                    }
                }
                if (!actionsMap.has(coilKey)) {
                    actionsMap.set(coilKey, []);
                }
                const stepList = actionsMap.get(coilKey);
                if (!stepList.includes(stepMarker)) {
                    stepList.push(stepMarker);
                }
            }
        }
        // Adicionar equações de bobinas unificadas
        for (const [coilKey, stepMarkers] of actionsMap.entries()) {
            lines.push(`${coilKey}=${stepMarkers.join('+')}`);
        }
        // 3. Coletar e agrupar parâmetros de recursos T (Timer), C (Contador), A (Comparador Analógico)
        const timersMap = new Map();
        const countersMap = new Map();
        const comparatsMap = new Map();
        // Inicializar com entradas explícitas do ir.timers, ir.counters, ir.comparats
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
                            funct: action.functionType ?? (timersMap.get(channel)?.funct ?? 1),
                            preset: action.preset ?? (timersMap.get(channel)?.preset ?? 5),
                            offset: action.offset ?? (timersMap.get(channel)?.offset ?? 0)
                        });
                    }
                }
                else if (resourceType === 'C' && !isNaN(channel)) {
                    if (!countersMap.has(channel) || action.preset !== undefined) {
                        countersMap.set(channel, {
                            id: channel,
                            funct: action.functionType ?? (countersMap.get(channel)?.funct ?? 1),
                            preset: action.preset ?? (countersMap.get(channel)?.preset ?? 5),
                            offset: action.offset ?? (countersMap.get(channel)?.offset ?? 0)
                        });
                    }
                }
                else if (resourceType === 'A' && !isNaN(channel)) {
                    if (!comparatsMap.has(channel) || action.preset !== undefined) {
                        comparatsMap.set(channel, {
                            id: channel,
                            offset: action.offset ?? (comparatsMap.get(channel)?.offset ?? 0),
                            funct: action.functionType ?? (comparatsMap.get(channel)?.funct ?? 2),
                            preset: action.preset ?? (comparatsMap.get(channel)?.preset ?? 2.15),
                            analogId: action.port ?? (comparatsMap.get(channel)?.analogId ?? 1)
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
                            timersMap.set(id, { id: id, funct: 1, preset: 5, offset: 0 });
                        }
                    });
                }
                const counterMatches = transition.receptivity.match(/\bC(\d+)\b/gi);
                if (counterMatches) {
                    counterMatches.forEach(m => {
                        const id = parseInt(m.substring(1), 10);
                        if (!isNaN(id) && !countersMap.has(id)) {
                            countersMap.set(id, { id: id, funct: 1, preset: 5, offset: 0 });
                        }
                    });
                }
                const comparerMatches = transition.receptivity.match(/\bA(\d+)\b/gi);
                if (comparerMatches) {
                    comparerMatches.forEach(m => {
                        const id = parseInt(m.substring(1), 10);
                        if (!isNaN(id) && !comparatsMap.has(id)) {
                            comparatsMap.set(id, { id: id, offset: 0, funct: 2, preset: 2.15, analogId: 1 });
                        }
                    });
                }
            }
        }
        // Adicionar ponto e vírgula na última linha do script para marcar o fim do loop do interpretador
        if (lines.length > 0 && !lines[lines.length - 1].endsWith(';')) {
            lines[lines.length - 1] += ';';
        }
        const timers = Array.from(timersMap.values()).sort((a, b) => a.id - b.id);
        const counters = Array.from(countersMap.values()).sort((a, b) => a.id - b.id);
        const comparats = Array.from(comparatsMap.values()).sort((a, b) => a.id - b.id);
        // 4. Montar a estrutura formatada do userver03 (/code_param.cfg)
        const formattedContent = this.formatInterpreterConfig({
            lines,
            timers,
            counters,
            comparats
        });
        return {
            targetId: this.targetId,
            filename: 'code_param.cfg',
            mimeType: this.mimeType,
            content: formattedContent,
            metadata: {
                totalLines: lines.length,
                stepsCount: ir.steps.length,
                transitionsCount: ir.transitions.length,
                config: {
                    lines,
                    timers,
                    counters,
                    comparats
                }
            }
        };
    }
    /**
     * Formata a saída no padrão do interpretador userver03
     */
    formatInterpreterConfig(data) {
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
