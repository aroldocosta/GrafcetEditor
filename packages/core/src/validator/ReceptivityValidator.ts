export interface ValidationResult {
  isValid: boolean;
  normalizedExpression: string;
  tokens: string[];
  errors: string[];
}

export class ReceptivityValidator {
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
  public static readonly HARDWARE_PATTERN = /^(I[1-8]|E[1-8]|Q[1-8]|R[1-8]|M([1-9]|[1-5][0-9]|6[0-4])|X([1-9]|[1-5][0-9]|6[0-4])|T([1-9]|1[0-6])|C[1-8]|A[1-8]|1|0)$/i;

  public static normalize(expression: string): string {
    if (!expression) return '';
    return expression
      .replace(/\s+/g, '')
      .replace(/AND/gi, '*')
      .replace(/&&/g, '*')
      .replace(/OR/gi, '+')
      .replace(/\|\|/g, '+')
      .replace(/NOT/gi, '!')
      .replace(/~/g, '!');
  }

  public static validate(expression: string): ValidationResult {
    const errors: string[] = [];
    if (!expression || expression.trim() === '') {
      return {
        isValid: true,
        normalizedExpression: '1',
        tokens: ['1'],
        errors: []
      };
    }

    const normalized = this.normalize(expression);

    // Tokenizar a expressão em identificadores, operadores e parênteses
    const rawTokens = normalized.match(/([a-zA-Z]+\d+|\d+|[+*!()])/g) || [];
    const fullReconstructed = rawTokens.join('');

    // Verificar se houve caracteres inválidos ignorados pela tokenização
    if (fullReconstructed !== normalized) {
      errors.push(`Expressão contém caracteres ou símbolos inválidos.`);
    }

    // Validar cada token identificador/operando contra o padrão de hardware
    const validatedTokens: string[] = [];
    for (const token of rawTokens) {
      if (/^[+*!()]$/.test(token)) {
        validatedTokens.push(token);
      } else {
        if (!this.HARDWARE_PATTERN.test(token)) {
          errors.push(`Identificador '${token}' está fora dos limites de hardware permitidos (I1-I8, Q1-Q8, R1-R8, M1-M64, T1-T16, C1-C8, A1-A8, 1, 0).`);
        } else {
          validatedTokens.push(token.toUpperCase());
        }
      }
    }

    // Validar balanço de parênteses
    let parenDepth = 0;
    for (const token of rawTokens) {
      if (token === '(') parenDepth++;
      if (token === ')') parenDepth--;
      if (parenDepth < 0) {
        errors.push(`Parêntese de fechamento ')' sem parêntese de abertura '(' prévio.`);
        break;
      }
    }
    if (parenDepth > 0) {
      errors.push(`Há ${parenDepth} parêntese(s) '(' não fechado(s).`);
    }

    // Validar sequências inválidas de operadores (ex: **, ++, *+)
    for (let i = 0; i < rawTokens.length - 1; i++) {
      const current = rawTokens[i];
      const next = rawTokens[i + 1];
      if (/^[+*]$/.test(current) && /^[+*]$/.test(next)) {
        errors.push(`Operadores consecutivos inválidos: '${current}${next}'.`);
      }
    }

    const isValid = errors.length === 0;
    return {
      isValid,
      normalizedExpression: normalized,
      tokens: validatedTokens,
      errors
    };
  }
}
