import { ExpressionEvaluator } from './ExpressionEvaluator.js';
export class GrafcetSimulatorEngine {
    ir = null;
    activeSteps = new Set();
    previousActiveSteps = new Set();
    inputs = new Map();
    remotes = new Map();
    analogs = new Map();
    outputs = new Map();
    memories = new Map();
    timers = new Map();
    cycleCount = 0;
    isRunning = false;
    intervalId = null;
    scanRateMs = 50;
    onStateChangeCallbacks = [];
    constructor(ir) {
        if (ir) {
            this.loadIR(ir);
        }
    }
    /**
     * Carrega e inicializa o modelo de GRAFCET para simulação.
     */
    loadIR(ir) {
        this.stop();
        this.ir = ir;
        this.reset();
    }
    /**
     * Restaura o GRAFCET para o estado inicial (Regra 1 da IEC 60848).
     */
    reset() {
        this.activeSteps.clear();
        this.previousActiveSteps.clear();
        this.inputs.clear();
        this.remotes.clear();
        this.outputs.clear();
        this.memories.clear();
        this.timers.clear();
        this.cycleCount = 0;
        if (!this.ir)
            return;
        // Inicializar timers e comparadores declarados
        if (this.ir.timers) {
            for (const t of this.ir.timers) {
                this.timers.set(t.id, {
                    id: t.id,
                    presetMs: (t.preset ?? 5) * 1000,
                    elapsedMs: 0,
                    done: false,
                    active: false
                });
            }
        }
        // Regra 1 (IEC 60848): Ativar todas as etapas iniciais
        for (const step of this.ir.steps) {
            if (step.isInitial) {
                this.activeSteps.add(step.id);
            }
        }
        // Executar 1 ciclo de ações iniciais
        this.executeActions(0);
        this.notifyState();
    }
    /**
     * Define o estado de uma entrada digital física (I1, I2, etc.)
     */
    setDigitalInput(channel, value) {
        this.inputs.set(channel, value);
        this.notifyState();
    }
    /**
     * Define o estado de uma entrada remota (R1, R2, etc. - MQTT / Web GUI)
     */
    setRemoteInput(channel, value) {
        this.remotes.set(channel, value);
        this.notifyState();
    }
    /**
     * Define o valor de uma entrada analógica (A1, A2, etc.)
     */
    setAnalogInput(channel, value) {
        this.analogs.set(channel, value);
        this.notifyState();
    }
    /**
     * Forçamento manual de etapa (Forcing): ativa ou desativa diretamente uma etapa.
     */
    forceStep(stepId, state) {
        if (state) {
            this.activeSteps.add(stepId);
        }
        else {
            this.activeSteps.delete(stepId);
        }
        this.executeActions(0);
        this.notifyState();
    }
    /**
     * Executa um único ciclo de scan de simulação (Single Step / Scan Cycle).
     * @param dtMs Delta de tempo decorrido em milissegundos
     */
    step(dtMs = this.scanRateMs) {
        if (!this.ir)
            return;
        this.cycleCount++;
        // 1. Atualizar Temporizadores que estão sendo acionados por etapas ativas
        this.updateTimers(dtMs);
        // 2. Montar contexto de variáveis para avaliação de receptividades
        const context = this.buildContext();
        // 3. Avaliar Transições Franqueáveis (Regras 2 e 3 da IEC 60848)
        const transitionsToClear = [];
        for (const transition of this.ir.transitions) {
            // Uma transição está validada se TODAS as etapas a montante (fromSteps) estão ativas
            const isValidated = transition.fromSteps.every(stepId => this.activeSteps.has(stepId));
            if (isValidated) {
                // Avalia a receptividade booleana
                const isReceptive = ExpressionEvaluator.evaluate(transition.receptivity, context);
                if (isReceptive) {
                    transitionsToClear.push(transition);
                }
            }
        }
        // 4. Evolução das Etapas (Regras 4 e 5 da IEC 60848)
        if (transitionsToClear.length > 0) {
            const stepsToDeactivate = new Set();
            const stepsToActivate = new Set();
            for (const trans of transitionsToClear) {
                for (const fromId of trans.fromSteps) {
                    stepsToDeactivate.add(fromId);
                }
                for (const toId of trans.toSteps) {
                    stepsToActivate.add(toId);
                }
            }
            // Salva snapshot das etapas ativas anteriores para detecção de borda
            this.previousActiveSteps = new Set(this.activeSteps);
            // Desativar etapas que não devem ser ativadas
            for (const stepId of stepsToDeactivate) {
                // Regra 5 (Prioridade de Ativação): Se uma etapa deve ser ativada e desativada simultaneamente,
                // ela PERMANECE ATIVA.
                if (!stepsToActivate.has(stepId)) {
                    this.activeSteps.delete(stepId);
                }
            }
            // Ativar novas etapas
            for (const stepId of stepsToActivate) {
                this.activeSteps.add(stepId);
            }
        }
        // 5. Executar Ações das etapas ativas
        this.executeActions(dtMs);
        // Notificar ouvintes
        this.notifyState();
    }
    /**
     * Inicia a simulação contínua no scanRate especificado.
     */
    start(scanRateMs = 50) {
        if (this.isRunning)
            return;
        this.scanRateMs = scanRateMs;
        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.step(this.scanRateMs);
        }, this.scanRateMs);
        this.notifyState();
    }
    /**
     * Pausa a simulação contínua mantendo o estado atual.
     */
    pause() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.notifyState();
    }
    /**
     * Para a simulação e reseta para o estado inicial.
     */
    stop() {
        this.pause();
        this.reset();
    }
    /**
     * Registra um listener de mudanças de estado da simulação.
     */
    subscribe(callback) {
        this.onStateChangeCallbacks.push(callback);
        // Dispara estado imediato
        callback(this.getState());
        return () => {
            const idx = this.onStateChangeCallbacks.indexOf(callback);
            if (idx !== -1)
                this.onStateChangeCallbacks.splice(idx, 1);
        };
    }
    /**
     * Retorna o snapshot completo do estado atual da simulação.
     */
    getState() {
        const validTransitions = [];
        if (this.ir) {
            const context = this.buildContext();
            for (const trans of this.ir.transitions) {
                const isValidated = trans.fromSteps.every(id => this.activeSteps.has(id));
                if (isValidated && ExpressionEvaluator.evaluate(trans.receptivity, context)) {
                    validTransitions.push(trans.id);
                }
            }
        }
        const timersObj = {};
        this.timers.forEach((t, k) => {
            timersObj[k] = { ...t };
        });
        const inputsObj = {};
        this.inputs.forEach((v, k) => { inputsObj[k] = v; });
        const remotesObj = {};
        this.remotes.forEach((v, k) => { remotesObj[k] = v; });
        const analogsObj = {};
        this.analogs.forEach((v, k) => { analogsObj[k] = v; });
        const outputsObj = {};
        this.outputs.forEach((v, k) => { outputsObj[k] = v; });
        const memoriesObj = {};
        this.memories.forEach((v, k) => { memoriesObj[k] = v; });
        return {
            activeSteps: Array.from(this.activeSteps),
            validTransitions: validTransitions,
            inputs: inputsObj,
            remotes: remotesObj,
            analogs: analogsObj,
            outputs: outputsObj,
            memories: memoriesObj,
            timers: timersObj,
            cycleCount: this.cycleCount,
            isRunning: this.isRunning
        };
    }
    // =========================================================================
    // Métodos Internos
    // =========================================================================
    updateTimers(dtMs) {
        if (!this.ir)
            return;
        // Descobrir quais timers estão sendo mantidos ativos por etapas ativas
        const activeTimerChannels = new Set();
        for (const stepId of this.activeSteps) {
            const stepNode = this.ir.steps.find(s => s.id === stepId);
            if (stepNode && stepNode.actions) {
                for (const action of stepNode.actions) {
                    if (action.qualifier === 'T' || action.resourceType === 'T') {
                        activeTimerChannels.add(action.channel);
                    }
                }
            }
        }
        // Atualizar cada timer
        this.timers.forEach((timer, channel) => {
            if (activeTimerChannels.has(channel)) {
                timer.active = true;
                if (!timer.done) {
                    timer.elapsedMs += dtMs;
                    if (timer.elapsedMs >= timer.presetMs) {
                        timer.elapsedMs = timer.presetMs;
                        timer.done = true;
                    }
                }
            }
            else {
                // Se a etapa que acionava o timer desativou, reseta o timer
                timer.active = false;
                timer.elapsedMs = 0;
                timer.done = false;
            }
        });
    }
    executeActions(dtMs) {
        if (!this.ir)
            return;
        // Saídas contínuas (tipo 'X' ou padrão) devem ser recalculadas a cada ciclo:
        // Começam em false a menos que uma etapa ativa a mantenha ligada.
        const continuousOutputs = new Set();
        const continuousMemories = new Set();
        for (const stepId of this.activeSteps) {
            const stepNode = this.ir.steps.find(s => s.id === stepId);
            if (!stepNode || !stepNode.actions)
                continue;
            const isFirstCycleOfStep = !this.previousActiveSteps.has(stepId);
            for (const action of stepNode.actions) {
                const qualifier = action.qualifier || 'X';
                const resource = action.resourceType || 'Q';
                const channel = action.channel || 1;
                if (resource === 'Q') {
                    switch (qualifier) {
                        case 'X':
                            continuousOutputs.add(channel);
                            this.outputs.set(channel, true);
                            break;
                        case 'S':
                            if (isFirstCycleOfStep || !this.outputs.get(channel)) {
                                this.outputs.set(channel, true);
                            }
                            break;
                        case 'R':
                            if (isFirstCycleOfStep || this.outputs.get(channel)) {
                                this.outputs.set(channel, false);
                            }
                            break;
                        case 'Z': // Toggle
                            if (isFirstCycleOfStep) {
                                const cur = this.outputs.get(channel) ?? false;
                                this.outputs.set(channel, !cur);
                            }
                            break;
                        case 'P': // Pulse (1 ciclo)
                            if (isFirstCycleOfStep) {
                                this.outputs.set(channel, true);
                                continuousOutputs.add(channel);
                            }
                            break;
                    }
                }
                else if (resource === 'M') {
                    switch (qualifier) {
                        case 'X':
                            continuousMemories.add(channel);
                            this.memories.set(channel, true);
                            break;
                        case 'S':
                            this.memories.set(channel, true);
                            break;
                        case 'R':
                            this.memories.set(channel, false);
                            break;
                        case 'Z':
                            if (isFirstCycleOfStep) {
                                const cur = this.memories.get(channel) ?? false;
                                this.memories.set(channel, !cur);
                            }
                            break;
                    }
                }
            }
        }
        // Desligar saídas e memórias contínuas que não foram sustentadas por nenhuma etapa ativa
        this.outputs.forEach((val, channel) => {
            // Se era uma saída contínua que agora não está em continuousOutputs, e não foi Set por 'S'
            // Verifica se existe alguma ação S ou R no diagrama para este canal; se não houver 'S', reseta.
            const hasStoredAction = this.hasStoredActionFor('Q', channel);
            if (!hasStoredAction && !continuousOutputs.has(channel)) {
                this.outputs.set(channel, false);
            }
        });
        this.memories.forEach((val, channel) => {
            const hasStoredAction = this.hasStoredActionFor('M', channel);
            if (!hasStoredAction && !continuousMemories.has(channel)) {
                this.memories.set(channel, false);
            }
        });
    }
    hasStoredActionFor(resourceType, channel) {
        if (!this.ir)
            return false;
        for (const s of this.ir.steps) {
            if (s.actions) {
                for (const a of s.actions) {
                    if (a.resourceType === resourceType && a.channel === channel && (a.qualifier === 'S' || a.qualifier === 'R' || a.qualifier === 'Z')) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    buildContext() {
        const timerBools = new Map();
        this.timers.forEach((t, k) => timerBools.set(k, t.done));
        const stepBools = new Map();
        if (this.ir) {
            for (const s of this.ir.steps) {
                stepBools.set(s.id, this.activeSteps.has(s.id));
            }
        }
        return {
            inputs: this.inputs,
            remotes: this.remotes,
            analogs: this.analogs,
            memories: this.memories,
            steps: stepBools,
            timers: timerBools,
            counters: new Map()
        };
    }
    notifyState() {
        if (this.onStateChangeCallbacks.length === 0)
            return;
        const state = this.getState();
        for (const cb of this.onStateChangeCallbacks) {
            cb(state);
        }
    }
}
