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
    preset: number;
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
export type ComparatConfig = ComparerConfig;
export interface GrafcetIR {
    name?: string;
    steps: StepNode[];
    transitions: TransitionNode[];
    timers?: TimerConfig[];
    counters?: CounterConfig[];
    comparers?: ComparerConfig[];
    comparats?: ComparatConfig[];
}
