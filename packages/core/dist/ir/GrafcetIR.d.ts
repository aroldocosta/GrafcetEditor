export type CoilQualifier = 'X' | 'P' | 'N' | 'S' | 'R' | 'Z' | 'T';
export type ResourceType = 'Q' | 'M' | 'T' | 'C' | 'A' | 'R' | 'I';
export interface ActionNode {
    id?: number | string;
    qualifier: CoilQualifier;
    resourceType: ResourceType;
    channel: number;
    description?: string;
    preset?: number;
    offset?: number;
    functionType?: number;
    port?: number;
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
    fromSteps: number[];
    toSteps: number[];
    receptivity: string;
}
export interface TimerConfig {
    id: number;
    funct: number;
    preset: number;
    offset: number;
    functionType?: number;
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
    analogId: number;
    port?: number;
    functionType?: number;
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
