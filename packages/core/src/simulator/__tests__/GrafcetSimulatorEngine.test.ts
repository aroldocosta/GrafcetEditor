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

  it('deve executar o ciclo completo da BES com entradas remotas R1, R2 e entrada física I1', () => {
    // BES do usuário:
    // SM1=!M128+M4*M5*I1, SM2=M1*R1, SM3=M1*R1, SM4=M2*R1, SM5=M3*R2
    // RM1=M1*R1, RM2=M2*R1, RM3=M3*R2, RM4=M4*M5*I1, RM5=M4*M5*I1
    // XQ1=M2+M5, XQ2=M3+M4
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] },
        { id: 3, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 2 }] },
        { id: 4, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 2 }] },
        { id: 5, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] }
      ],
      transitions: [
        // T1: 1 -> (2, 3) com R1
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'R1' },
        // T2: 2 -> 4 com R1
        { id: 2, fromSteps: [2], toSteps: [4], receptivity: 'R1' },
        // T3: 3 -> 5 com R2
        { id: 3, fromSteps: [3], toSteps: [5], receptivity: 'R2' },
        // T4: (4, 5) -> 1 com I1
        { id: 4, fromSteps: [4, 5], toSteps: [1], receptivity: 'I1' }
      ]
    };

    const engine = new GrafcetSimulatorEngine(ir);

    // Estado inicial: Etapa 1 ativa, saídas desligadas
    expect(engine.getState().activeSteps).toEqual([1]);
    expect(engine.getState().outputs[1]).toBeFalsy();
    expect(engine.getState().outputs[2]).toBeFalsy();

    // 1. Aciona entrada remota R1 (MQTT / GUI)
    engine.setRemoteInput(1, true);
    expect(engine.getState().validTransitions).toContain(1);

    // Executa scan: transição 1 dispara, Etapas 2 e 3 ativam simultaneamente
    engine.step();
    expect(engine.getState().activeSteps.sort()).toEqual([2, 3]);
    // Q1 ativada na etapa 2 e Q2 ativada na etapa 3
    expect(engine.getState().outputs[1]).toBe(true);
    expect(engine.getState().outputs[2]).toBe(true);

    // Reseta pulso de R1
    engine.setRemoteInput(1, false);
    engine.step();
    expect(engine.getState().activeSteps.sort()).toEqual([2, 3]);

    // 2. Aciona R2 (avanço da etapa 3 para 5)
    engine.setRemoteInput(2, true);
    expect(engine.getState().validTransitions).toContain(3);
    engine.step();
    expect(engine.getState().activeSteps.sort()).toEqual([2, 5]);
    engine.setRemoteInput(2, false);

    // 3. Aciona R1 (avanço da etapa 2 para 4)
    engine.setRemoteInput(1, true);
    expect(engine.getState().validTransitions).toContain(2);
    engine.step();
    expect(engine.getState().activeSteps.sort()).toEqual([4, 5]);
    engine.setRemoteInput(1, false);

    // Nas etapas 4 e 5: Q1 (pela etapa 5) e Q2 (pela etapa 4)
    expect(engine.getState().outputs[1]).toBe(true);
    expect(engine.getState().outputs[2]).toBe(true);

    // 4. Convergência: Ambas etapas 4 e 5 ativas. Sem I1, não evolui.
    engine.step();
    expect(engine.getState().activeSteps.sort()).toEqual([4, 5]);

    // Aciona entrada física I1
    engine.setDigitalInput(1, true);
    expect(engine.getState().validTransitions).toContain(4);
    engine.step();

    // Retornou à Etapa 1 inicial!
    expect(engine.getState().activeSteps).toEqual([1]);
    expect(engine.getState().outputs[1]).toBeFalsy();
    expect(engine.getState().outputs[2]).toBeFalsy();
  });
});
