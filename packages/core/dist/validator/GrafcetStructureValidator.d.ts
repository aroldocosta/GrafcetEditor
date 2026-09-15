import { GrafcetIR } from '../ir/GrafcetIR.js';
export interface StructureValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
export declare class GrafcetStructureValidator {
    /**
     * Valida a integridade estrutural e topológica de um diagrama GRAFCET (IEC 60848).
     * Verifica especialmente as regras de sequências simultâneas / paralelismo:
     * - Sem cruzamentos parciais entre ramais paralelos.
     * - Fechamento mandatório de cada ramal na respectiva convergência em "E".
     * - Ausência de entradas externas no meio de um percurso paralelo.
     */
    static validate(ir: GrafcetIR): StructureValidationResult;
}
