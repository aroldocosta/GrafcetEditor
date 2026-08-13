import { ICodeGenerator, GeneratedOutput } from '../generator/ICodeGenerator.js';
import { GrafcetIR } from '../ir/GrafcetIR.js';
export declare class Userver03Generator implements ICodeGenerator {
    readonly targetId = "userver03";
    readonly name = "userver03 (Boolean Expressions JSON)";
    readonly fileExtension = "cfg";
    readonly mimeType = "application/json";
    generate(ir: GrafcetIR): GeneratedOutput;
    /**
     * Normaliza operadores lógicos para a sintaxe do userver03 (*, +, !)
     */
    private normalizeReceptivity;
}
