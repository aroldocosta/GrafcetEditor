import { describe, it, expect } from 'vitest';
import { GrafcetSimulatorEngine } from '../GrafcetSimulatorEngine.js';
import { GrafcetIR } from '../../ir/GrafcetIR.js';

describe('GrafcetSimulatorEngine (IEC 60848)', () => {
  it('deve inicializar com as etapas iniciais ativas (Regra 1)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1' }
      ]
    };

    const engine = new GrafcetSimulatorEngine(ir);
    const state = engine.getState();

    expect(state.activeSteps).toEqual([1]);
    expect(state.validTransitions).toEqual([]); // I1 ainda é falso
  });

  it('deve franquejar transição e evoluir etapas quando a receptividade for verdadeira (Regras 2 e 4)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1' }
      ]
    };

    const engine = new GrafcetSimulatorEngine(ir);

    // Sem ligar I1, o step de ciclo de scan não deve evoluir
    engine.step();
    expect(engine.getState().activeSteps).toEqual([1]);
    expect(engine.getState().outputs[1]).toBeFalsy();

    // Liga a entrada I1
    engine.setDigitalInput(1, true);
    expect(engine.getState().validTransitions).toContain(1);

    // Executa o ciclo de scan
    engine.step();
    const newState = engine.getState();
    expect(newState.activeSteps).toEqual([2]);
    expect(newState.outputs[1]).toBe(true); // Saída Q1 ativou pela ação contínua 'X'
  });

  it('deve suportar Divergência e Convergência em E (paralelismo simultâneo)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] },
        { id: 4, isInitial: false, actions: [] }
      ],
      transitions: [
        // Divergência em E: Etapa 1 ativa simultaneamente Etapas 2 e 3
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' },
        // Convergência em E: Sincroniza 2 e 3 para ativar 4
        { id: 2, fromSteps: [2, 3], toSteps: [4], receptivity: 'I2' }
      ]
    };

    const engine = new GrafcetSimulatorEngine(ir);
    engine.setDigitalInput(1, true);
    engine.step();

    // Ambas as etapas 2 e 3 devem estar ativas simultaneamente
    expect(engine.getState().activeSteps.sort()).toEqual([2, 3]);

    // Transição 2 ainda não pode disparar porque I2 é falso
    engine.step();
    expect(engine.getState().activeSteps.sort()).toEqual([2, 3]);

    // Agora liga I2 e sincroniza para a Etapa 4
    engine.setDigitalInput(2, true);
    engine.step();
    expect(engine.getState().activeSteps).toEqual([4]);
  });

  it('deve avaliar corretamente comparações analógicas em receptividades (ex: A1 > 500)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'A1 > 500' }
      ]
    };

    const engine = new GrafcetSimulatorEngine(ir);
    engine.setAnalogInput(1, 400); // 400 <= 500 -> falso
    engine.step();
    expect(engine.getState().activeSteps).toEqual([1]);

    engine.setAnalogInput(1, 550); // 550 > 500 -> verdadeiro
    engine.step();
    expect(engine.getState().activeSteps).toEqual([2]);
  });
});
