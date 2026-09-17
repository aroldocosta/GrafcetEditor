/**
 * Avaliador seguro de expressões booleanas para receptividades GRAFCET (IEC 60848).
 * Suporta operadores:
 * - AND: '*' ou 'AND' ou '&'
 * - OR: '+' ou 'OR' ou '|'
 * - NOT: '!' ou 'NOT' ou '/'
 * - Parênteses: '(' e ')'
 * - Constantes: '1', '0', 'TRUE', 'FALSE'
 * - Comparações: 'A1 > 500', 'A2 <= 300', etc.
 */
export interface SimulationVariableContext {
    inputs: Map<number, boolean>;
    remotes?: Map<number, boolean>;
    analogs: Map<number, number>;
    memories: Map<number, boolean>;
    steps: Map<number, boolean>;
    timers: Map<number, boolean>;
    counters: Map<number, boolean>;
}
export declare class ExpressionEvaluator {
    /**
     * Avalia uma expressão de receptividade GRAFCET contra o contexto de variáveis atual.
     */
    static evaluate(expression: string, context: SimulationVariableContext): boolean;
    private static evaluateAnalogComparisons;
    private static evaluateBooleanExpression;
    private static resolveOperand;
}
