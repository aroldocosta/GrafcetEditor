import { GrafcetIR, StepNode, TransitionNode, ActionNode } from '../ir/GrafcetIR.js';
import { ExpressionEvaluator, SimulationVariableContext } from './ExpressionEvaluator.js';

export interface TimerState {
  id: number;
  presetMs: number;
  elapsedMs: number;
  done: boolean;
  active: boolean;
}

export interface SimulationState {
  activeSteps: number[];
  validTransitions: number[]; // Transições que estão habilitadas e com receptividade verdadeira
  inputs: Record<number, boolean>;
  remotes: Record<number, boolean>; // R1..R8 (Entradas remotas / MQTT / GUI)
  analogs: Record<number, number>;
  outputs: Record<number, boolean>;
  memories: Record<number, boolean>;
  timers: Record<number, { elapsedMs: number; presetMs: number; done: boolean; active: boolean }>;
  cycleCount: number;
  isRunning: boolean;
}

export type StateChangeCallback = (state: SimulationState) => void;

export class GrafcetSimulatorEngine {
  private ir: GrafcetIR | null = null;
  private activeSteps: Set<number> = new Set();
  private previousActiveSteps: Set<number> = new Set();

  private inputs: Map<number, boolean> = new Map();
  private remotes: Map<number, boolean> = new Map();
  private analogs: Map<number, number> = new Map();
  private outputs: Map<number, boolean> = new Map();
  private memories: Map<number, boolean> = new Map();
  private timers: Map<number, TimerState> = new Map();

  private cycleCount: number = 0;
  private isRunning: boolean = false;
  private intervalId: any = null;
  private scanRateMs: number = 50;

  private onStateChangeCallbacks: StateChangeCallback[] = [];

  constructor(ir?: GrafcetIR) {
    if (ir) {
      this.loadIR(ir);
    }
  }

  /**
   * Carrega e inicializa o modelo de GRAFCET para simulação.
   */
  public loadIR(ir: GrafcetIR): void {
    this.stop();
    this.ir = ir;
    this.reset();
  }

  /**
   * Restaura o GRAFCET para o estado inicial (Regra 1 da IEC 60848).
   */
  public reset(): void {
    this.activeSteps.clear();
    this.previousActiveSteps.clear();
    this.inputs.clear();
    this.remotes.clear();
    this.outputs.clear();
    this.memories.clear();
    this.timers.clear();
    this.cycleCount = 0;

    if (!this.ir) return;

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
  public setDigitalInput(channel: number, value: boolean): void {
    this.inputs.set(channel, value);
    this.notifyState();
  }

  /**
   * Define o estado de uma entrada remota (R1, R2, etc. - MQTT / Web GUI)
   */
  public setRemoteInput(channel: number, value: boolean): void {
    this.remotes.set(channel, value);
    this.notifyState();
  }

  /**
   * Define o valor de uma entrada analógica (A1, A2, etc.)
   */
  public setAnalogInput(channel: number, value: number): void {
    this.analogs.set(channel, value);
    this.notifyState();
  }

  /**
   * Forçamento manual de etapa (Forcing): ativa ou desativa diretamente uma etapa.
   */
  public forceStep(stepId: number, state: boolean): void {
    if (state) {
      this.activeSteps.add(stepId);
    } else {
      this.activeSteps.delete(stepId);
    }
    this.executeActions(0);
    this.notifyState();
  }

  /**
   * Executa um único ciclo de scan de simulação (Single Step / Scan Cycle).
   * @param dtMs Delta de tempo decorrido em milissegundos
   */
  public step(dtMs: number = this.scanRateMs): void {
    if (!this.ir) return;

    this.cycleCount++;

    // 1. Atualizar Temporizadores que estão sendo acionados por etapas ativas
    this.updateTimers(dtMs);

    // 2. Montar contexto de variáveis para avaliação de receptividades
    const context = this.buildContext();

    // 3. Avaliar Transições Franqueáveis (Regras 2 e 3 da IEC 60848)
    const transitionsToClear: TransitionNode[] = [];

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
      const stepsToDeactivate = new Set<number>();
      const stepsToActivate = new Set<number>();

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
  public start(scanRateMs: number = 50): void {
    if (this.isRunning) return;
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
  public pause(): void {
    if (!this.isRunning) return;
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
  public stop(): void {
    this.pause();
    this.reset();
  }

  /**
   * Registra um listener de mudanças de estado da simulação.
   */
  public subscribe(callback: StateChangeCallback): () => void {
    this.onStateChangeCallbacks.push(callback);
    // Dispara estado imediato
    callback(this.getState());
    return () => {
      const idx = this.onStateChangeCallbacks.indexOf(callback);
      if (idx !== -1) this.onStateChangeCallbacks.splice(idx, 1);
    };
  }

  /**
   * Retorna o snapshot completo do estado atual da simulação.
   */
  public getState(): SimulationState {
    const validTransitions: number[] = [];
    if (this.ir) {
      const context = this.buildContext();
      for (const trans of this.ir.transitions) {
        const isValidated = trans.fromSteps.every(id => this.activeSteps.has(id));
        if (isValidated && ExpressionEvaluator.evaluate(trans.receptivity, context)) {
          validTransitions.push(trans.id);
        }
      }
    }

    const timersObj: Record<number, any> = {};
    this.timers.forEach((t, k) => {
      timersObj[k] = { ...t };
    });

    const inputsObj: Record<number, boolean> = {};
    this.inputs.forEach((v, k) => { inputsObj[k] = v; });

    const remotesObj: Record<number, boolean> = {};
    this.remotes.forEach((v, k) => { remotesObj[k] = v; });

    const analogsObj: Record<number, number> = {};
    this.analogs.forEach((v, k) => { analogsObj[k] = v; });

    const outputsObj: Record<number, boolean> = {};
    this.outputs.forEach((v, k) => { outputsObj[k] = v; });

    const memoriesObj: Record<number, boolean> = {};
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

  private updateTimers(dtMs: number): void {
    if (!this.ir) return;

    // Descobrir quais timers estão sendo mantidos ativos por etapas ativas
    const activeTimerChannels = new Set<number>();

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
      } else {
        // Se a etapa que acionava o timer desativou, reseta o timer
        timer.active = false;
        timer.elapsedMs = 0;
        timer.done = false;
      }
    });
  }

  private executeActions(dtMs: number): void {
    if (!this.ir) return;

    // Saídas contínuas (tipo 'X' ou padrão) devem ser recalculadas a cada ciclo:
    // Começam em false a menos que uma etapa ativa a mantenha ligada.
    const continuousOutputs = new Set<number>();
    const continuousMemories = new Set<number>();

    for (const stepId of this.activeSteps) {
      const stepNode = this.ir.steps.find(s => s.id === stepId);
      if (!stepNode || !stepNode.actions) continue;

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
        } else if (resource === 'M') {
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

  private hasStoredActionFor(resourceType: 'Q' | 'M', channel: number): boolean {
    if (!this.ir) return false;
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

  private buildContext(): SimulationVariableContext {
    const timerBools = new Map<number, boolean>();
    this.timers.forEach((t, k) => timerBools.set(k, t.done));

    const stepBools = new Map<number, boolean>();
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

  private notifyState(): void {
    if (this.onStateChangeCallbacks.length === 0) return;
    const state = this.getState();
    for (const cb of this.onStateChangeCallbacks) {
      cb(state);
    }
  }
}
