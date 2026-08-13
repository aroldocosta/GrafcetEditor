import { GrafcetIR } from '../ir/GrafcetIR.js';
export interface GeneratedOutput {
    targetId: string;
    filename: string;
    mimeType: string;
    content: string;
    metadata?: Record<string, any>;
}
export interface ICodeGenerator {
    readonly targetId: string;
    readonly name: string;
    readonly fileExtension: string;
    readonly mimeType: string;
    generate(ir: GrafcetIR): GeneratedOutput;
}
