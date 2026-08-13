import { ICodeGenerator, GeneratedOutput } from './ICodeGenerator.js';
import { GrafcetIR } from '../ir/GrafcetIR.js';
export declare class CodeGeneratorRegistry {
    private static generators;
    static register(generator: ICodeGenerator): void;
    static get(targetId: string): ICodeGenerator | undefined;
    static list(): {
        targetId: string;
        name: string;
        fileExtension: string;
    }[];
    static generate(targetId: string, ir: GrafcetIR): GeneratedOutput;
}
