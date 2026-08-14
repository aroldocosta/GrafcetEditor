export interface ValidationResult {
    isValid: boolean;
    normalizedExpression: string;
    tokens: string[];
    errors: string[];
}
export declare class ReceptivityValidator {
    /**
     * Limites de Hardware das Macros do Firmware:
     * DIGITAL_QTY = 8 (I1-I8 ou E1-E8)
     * RELAY_QTY = 8 (Q1-Q8)
     * REMOTE_QTY = 8 (R1-R8)
     * MEMORY_QTY = 64 (M1-M64 ou X1-X64)
     * TIMER_QTY = 16 (T1-T16)
     * COUNTER_QTY = 8 (C1-C8)
     * COMPARATOR_QTY = 8 (A1-A8)
     * CONSTANTES = 1 (True) ou 0 (False)
     */
    static readonly HARDWARE_PATTERN: RegExp;
    static normalize(expression: string): string;
    static validate(expression: string): ValidationResult;
}
