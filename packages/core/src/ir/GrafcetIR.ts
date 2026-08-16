export type CoilQualifier = 'X' | 'P' | 'N' | 'S' | 'R' | 'Z' | 'T';
export type ResourceType = 'Q' | 'M' | 'T' | 'C' | 'A' | 'R' | 'I';

export interface ActionNode {
  id?: number | string;
  qualifier: CoilQualifier;    // X (Normal), S (Set), R (Reset), Z (Toggle), T (Timer)
  resourceType: ResourceType;  // Q (Relé), M (Memória), T (Timer), C (Contador), A (Analógico)
  channel: number;             // Canal / ID (1, 2, 3...)
  description?: string;
  
  // Parâmetros de Recursos T, C, A (userver03)
  preset?: number;             // pst
  offset?: number;             // ofs
  functionType?: number;       // fun
  port?: number;               // prt (somente Comparadores A)

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
  funct: number;       // Modo de operação (ex: 1, 2, 3, 4)
  preset: number;      // Tempo / Valor limite
  offset: number;      // Offset
  functionType?: number; // Compatibilidade
}

export interface CounterConfig {
  id: number;
  funct: number;
  preset: number;
  offset: number;
  functionType?: number;
}

export interface ComparatConfig {
  id: number;
  offset: number;
  funct: number;
  preset: number;
  analogId: number;    // Canal de entrada analógica
  port?: number;       // Compatibilidade
  functionType?: number; // Compatibilidade
}
export type ComparerConfig = ComparatConfig;

export interface GrafcetIR {
  name?: string;
  steps: StepNode[];
  transitions: TransitionNode[];
  timers?: TimerConfig[];
  counters?: CounterConfig[];
  comparats?: ComparatConfig[];
  comparers?: ComparerConfig[];
}
