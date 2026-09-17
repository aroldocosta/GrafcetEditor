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
export class ExpressionEvaluator {
    /**
     * Avalia uma expressão de receptividade GRAFCET contra o contexto de variáveis atual.
     */
    static evaluate(expression, context) {
        if (!expression)
            return false;
        let expr = expression.trim();
        if (expr === '1' || expr.toUpperCase() === 'TRUE')
            return true;
        if (expr === '0' || expr.toUpperCase() === 'FALSE')
            return false;
        // Normalizar operadores textuais para símbolos padrão
        expr = expr
            .replace(/\bAND\b/gi, '*')
            .replace(/\bOR\b/gi, '+')
            .replace(/\bNOT\b/gi, '!')
            .replace(/&&/g, '*')
            .replace(/\|\|/g, '+');
        // Avaliar possíveis comparações analógicas embutidas (ex: A1 > 500 ou A2 <= 300)
        expr = this.evaluateAnalogComparisons(expr, context.analogs);
        // Tokenização e parsing booleano via algoritmo Shunting-Yard
        return this.evaluateBooleanExpression(expr, context);
    }
    static evaluateAnalogComparisons(expr, analogs) {
        // Regex para capturar padrões como "A1 > 500", "A2 <= 300.5", "A1 == 100"
        const compRegex = /\bA(\d+)\s*(>=|<=|>|<|==|!=|=)\s*(\d+(?:\.\d+)?)\b/gi;
        return expr.replace(compRegex, (match, channelStr, op, thresholdStr) => {
            const channel = parseInt(channelStr, 10);
            const threshold = parseFloat(thresholdStr);
            const val = analogs.get(channel) ?? 0;
            let result = false;
            switch (op) {
                case '>':
                    result = val > threshold;
                    break;
                case '>=':
                    result = val >= threshold;
                    break;
                case '<':
                    result = val < threshold;
                    break;
                case '<=':
                    result = val <= threshold;
                    break;
                case '==':
                case '=':
                    result = val === threshold;
                    break;
                case '!=':
                    result = val !== threshold;
                    break;
            }
            return result ? '1' : '0';
        });
    }
    static evaluateBooleanExpression(expr, context) {
        // Tokenizar tokens: operadores (*, +, !), parênteses, ou identificadores (I1, M2, X3, 1, 0)
        const tokens = expr.match(/([()!*+]|[A-Za-z]\w*|\d+)/g);
        if (!tokens || tokens.length === 0)
            return false;
        // Converter para Notação Polonesa Reversa (RPN) via Shunting-Yard
        const outputQueue = [];
        const operatorStack = [];
        const precedence = {
            '!': 3, // Not tem maior precedência
            '*': 2, // And
            '+': 1 // Or
        };
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token === '(') {
                operatorStack.push(token);
            }
            else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop());
                }
                operatorStack.pop(); // Remove '('
            }
            else if (token in precedence) {
                while (operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1] !== '(' &&
                    precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]) {
                    outputQueue.push(operatorStack.pop());
                }
                operatorStack.push(token);
            }
            else {
                // Operando (variável ou literal)
                outputQueue.push(token);
            }
        }
        while (operatorStack.length > 0) {
            outputQueue.push(operatorStack.pop());
        }
        // Avaliar a pilha RPN
        const evalStack = [];
        for (const token of outputQueue) {
            if (token === '!') {
                const a = evalStack.pop() ?? false;
                evalStack.push(!a);
            }
            else if (token === '*') {
                const b = evalStack.pop() ?? false;
                const a = evalStack.pop() ?? false;
                evalStack.push(a && b);
            }
            else if (token === '+') {
                const b = evalStack.pop() ?? false;
                const a = evalStack.pop() ?? false;
                evalStack.push(a || b);
            }
            else {
                evalStack.push(this.resolveOperand(token, context));
            }
        }
        return evalStack.pop() ?? false;
    }
    static resolveOperand(token, context) {
        if (token === '1')
            return true;
        if (token === '0')
            return false;
        const prefix = token.charAt(0).toUpperCase();
        const num = parseInt(token.substring(1), 10);
        if (isNaN(num))
            return false;
        switch (prefix) {
            case 'I':
                return context.inputs.get(num) ?? false;
            case 'R':
                return context.remotes?.get(num) ?? false;
            case 'M':
                return context.memories.get(num) ?? false;
            case 'X':
                return context.steps.get(num) ?? false;
            case 'T':
                return context.timers.get(num) ?? false;
            case 'C':
                return context.counters.get(num) ?? false;
            default:
                return false;
        }
    }
}
