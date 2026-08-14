import { describe, it, expect } from 'bun:test';
import { ReceptivityValidator } from '../ReceptivityValidator';

describe('ReceptivityValidator', () => {
  it('deve aceitar entradas digitais válidas (I1 a I8 e E1 a E8)', () => {
    expect(ReceptivityValidator.validate('I1').isValid).toBe(true);
    expect(ReceptivityValidator.validate('I8').isValid).toBe(true);
    expect(ReceptivityValidator.validate('E5').isValid).toBe(true);
    
    // Fora do limite
    expect(ReceptivityValidator.validate('I9').isValid).toBe(false);
  });

  it('deve aceitar relés (Q1 a Q8), remotas (R1 a R8), temporizadores (T1 a T16), contadores (C1 a C8) e comparadores (A1 a A8)', () => {
    expect(ReceptivityValidator.validate('Q8').isValid).toBe(true);
    expect(ReceptivityValidator.validate('R8').isValid).toBe(true);
    expect(ReceptivityValidator.validate('T16').isValid).toBe(true);
    expect(ReceptivityValidator.validate('C8').isValid).toBe(true);
    expect(ReceptivityValidator.validate('A8').isValid).toBe(true);

    // Fora dos limites
    expect(ReceptivityValidator.validate('Q9').isValid).toBe(false);
    expect(ReceptivityValidator.validate('R9').isValid).toBe(false);
    expect(ReceptivityValidator.validate('T17').isValid).toBe(false);
    expect(ReceptivityValidator.validate('C9').isValid).toBe(false);
    expect(ReceptivityValidator.validate('A9').isValid).toBe(false);
  });

  it('deve aceitar memórias de M1 a M64', () => {
    expect(ReceptivityValidator.validate('M1').isValid).toBe(true);
    expect(ReceptivityValidator.validate('M64').isValid).toBe(true);

    // Fora do limite de 64
    expect(ReceptivityValidator.validate('M65').isValid).toBe(false);
  });

  it('deve validar expressões lógicas complexas com parênteses e operadores *, +, !', () => {
    const res = ReceptivityValidator.validate('(I1 + I2) * !T16 + R8');
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('deve normalizar operadores textuais (AND, OR, NOT, &&, ||)', () => {
    const res = ReceptivityValidator.validate('I1 AND NOT T1 OR R2');
    expect(res.isValid).toBe(true);
    expect(res.normalizedExpression).toBe('I1*!T1+R2');
  });

  it('deve rejeitar parênteses desbalanceados ou símbolos desconhecidos', () => {
    expect(ReceptivityValidator.validate('(I1 + T1').isValid).toBe(false);
    expect(ReceptivityValidator.validate('I1 # T1').isValid).toBe(false);
    expect(ReceptivityValidator.validate('I1 ** T1').isValid).toBe(false);
  });
});
