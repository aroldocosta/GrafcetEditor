import { describe, it, expect } from 'bun:test';
import { GrafcetStructureValidator } from '../GrafcetStructureValidator.js';
import { GrafcetIR } from '../../ir/GrafcetIR.js';

describe('GrafcetStructureValidator (IEC 60848)', () => {
  it('deve aprovar um paralelismo limpo com divergência e convergência em E perfeitamente sincronizadas', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        { id: 2, fromSteps: [2, 3], toSteps: [4], receptivity: 'I2' }
      ]
    };

    const result = GrafcetStructureValidator.validate(ir);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve aprovar ramais com múltiplas etapas em série que convergem na mesma barra dupla', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        // Ramal 1: 2 -> 4
        { id: 2, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] },
        // Ramal 2: 3 -> 5
        { id: 3, isInitial: false, actions: [] },
        { id: 5, isInitial: false, actions: [] },
        // Unificação
        { id: 6, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        { id: 2, fromSteps: [2], toSteps: [4], receptivity: 'I2' },
        { id: 3, fromSteps: [3], toSteps: [5], receptivity: 'I3' },
        { id: 4, fromSteps: [4, 5], toSteps: [6], receptivity: 'I4' }
      ]
    };

    const result = GrafcetStructureValidator.validate(ir);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve rejeitar cruzamento parcial direto de um ramal para outro (IEC 60848 item 3.1)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] }
      ],
      transitions: [
        // Divergência para 2 e 3
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        // CRUZAMENTO PARCIAL ILEGAL: etapa 2 salta diretamente para a etapa 3!
        { id: 2, fromSteps: [2], toSteps: [3], receptivity: 'I_cross' },
        // Convergência
        { id: 3, fromSteps: [2, 3], toSteps: [4], receptivity: 'I2' }
      ]
    };

    const result = GrafcetStructureValidator.validate(ir);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Cruzamento parcial'))).toBe(true);
  });

  it('deve rejeitar quando uma etapa pertence simultaneamente a dois ramais distintos', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] }, // compartilhada ilegalmente
        { id: 5, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        { id: 2, fromSteps: [2], toSteps: [4], receptivity: 'I2' },
        { id: 3, fromSteps: [3], toSteps: [4], receptivity: 'I3' },
        { id: 4, fromSteps: [4], toSteps: [5], receptivity: 'I4' }
      ]
    };

    const result = GrafcetStructureValidator.validate(ir);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Cruzamento parcial detectado'))).toBe(true);
  });

  it('deve rejeitar quando um ramal não fecha em uma convergência em E (ramal sem fechamento)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        // Apenas o ramal 2 fecha para a etapa 4; o ramal 3 fica solto!
        { id: 2, fromSteps: [2], toSteps: [4], receptivity: 'I2' }
      ]
    };

    const result = GrafcetStructureValidator.validate(ir);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Ramal sem fechamento'))).toBe(true);
  });

  it('deve emitir warning quando a transição de abertura e a transição de fechamento compartilham a mesma receptividade homônima', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        { id: 2, fromSteps: [2, 3], toSteps: [4], receptivity: 'I1' }
      ]
    };

    const result = GrafcetStructureValidator.validate(ir);
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('compartilham a mesma receptividade'))).toBe(true);
  });
});
