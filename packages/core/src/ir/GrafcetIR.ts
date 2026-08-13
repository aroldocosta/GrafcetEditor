export type CoilQualifier = 'X' | 'P' | 'N' | 'S' | 'R' | 'Z' | 'T';
export type ResourceType = 'Q' | 'M' | 'T' | 'C' | 'A' | 'R';

export interface ActionNode {
  id?: number | string;
  qualifier: CoilQualifier;    // X (Normal), S (Set), R (Reset), Z (Toggle), T (Timer)
  resourceType: ResourceType;  // Q (Relé), M (Memória), T (Timer), C (Contador), A (Analógico)
  channel: number;             // Canal / Índice (1, 2, 3...)
  description?: string;
  
  // Propriedades herdadas/compatibilidade
  type?: string;
  target?: string;
}

export interface StepNode {
  id: number;
  name?: string;
  isInitial: boolean;
  actions: ActionNode[];
}

export interface TransitionNode {
  id: number;
  fromSteps: number[]; // Suporta convergência E (ex: [1, 2])
  toSteps: number[];   // Suporta divergência E (ex: [3, 4])
  receptivity: string; // Ex: "I1 * !I2" ou "I1 AND NOT I2"
}

export interface TimerConfig {
  id: number;
  preset: number;      // Tempo em ms
  offset: number;
  functionType: number;
}

export interface CounterConfig {
  id: number;
  preset: number;
  offset: number;
  functionType: number;
}

export interface ComparerConfig {
  id: number;
  port: number;
  preset: number;
  offset: number;
  functionType: number;
}

export interface GrafcetIR {
  name?: string;
  steps: StepNode[];
  transitions: TransitionNode[];
  timers?: TimerConfig[];
  counters?: CounterConfig[];
  comparers?: ComparerConfig[];
}
