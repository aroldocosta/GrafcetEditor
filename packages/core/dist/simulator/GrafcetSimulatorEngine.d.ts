import { GrafcetIR } from '../ir/GrafcetIR.js';
export interface TimerState {
    id: number;
    presetMs: number;
    elapsedMs: number;
    done: boolean;
    active: boolean;
}
export interface SimulationState {
    activeSteps: number[];
    validTransitions: number[];
    inputs: Record<number, boolean>;
    analogs: Record<number, number>;
    outputs: Record<number, boolean>;
    memories: Record<number, boolean>;
    timers: Record<number, {
        elapsedMs: number;
        presetMs: number;
        done: boolean;
        active: boolean;
    }>;
    cycleCount: number;
    isRunning: boolean;
}
export type StateChangeCallback = (state: SimulationState) => void;
export declare class GrafcetSimulatorEngine {
    private ir;
    private activeSteps;
    private previousActiveSteps;
    private inputs;
    private analogs;
    private outputs;
    private memories;
    private timers;
    private cycleCount;
    private isRunning;
    private intervalId;
    private scanRateMs;
    private onStateChangeCallbacks;
    constructor(ir?: GrafcetIR);
    /**
     * Carrega e inicializa o modelo de GRAFCET para simulação.
     */
    loadIR(ir: GrafcetIR): void;
    /**
     * Restaura o GRAFCET para o estado inicial (Regra 1 da IEC 60848).
     */
    reset(): void;
    /**
     * Define o estado de uma entrada digital (I1, I2, etc.)
     */
    setDigitalInput(channel: number, value: boolean): void;
    /**
     * Define o valor de uma entrada analógica (A1, A2, etc.)
     */
    setAnalogInput(channel: number, value: number): void;
    /**
     * Forçamento manual de etapa (Forcing): ativa ou desativa diretamente uma etapa.
     */
    forceStep(stepId: number, state: boolean): void;
    /**
     * Executa um único ciclo de scan de simulação (Single Step / Scan Cycle).
     * @param dtMs Delta de tempo decorrido em milissegundos
     */
    step(dtMs?: number): void;
    /**
     * Inicia a simulação contínua no scanRate especificado.
     */
    start(scanRateMs?: number): void;
    /**
     * Pausa a simulação contínua mantendo o estado atual.
     */
    pause(): void;
    /**
     * Para a simulação e reseta para o estado inicial.
     */
    stop(): void;
    /**
     * Registra um listener de mudanças de estado da simulação.
     */
    subscribe(callback: StateChangeCallback): () => void;
    /**
     * Retorna o snapshot completo do estado atual da simulação.
     */
    getState(): SimulationState;
    private updateTimers;
    private executeActions;
    private hasStoredActionFor;
    private buildContext;
    private notifyState;
}
