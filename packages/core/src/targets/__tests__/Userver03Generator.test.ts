import { describe, it, expect } from 'vitest';
import { Userver03Generator } from '../Userver03Generator.js';
import { GrafcetIR } from '../../ir/GrafcetIR.js';

describe('Userver03Generator', () => {
  const generator = new Userver03Generator();

  it('deve gerar expressões booleanas corretas para um Grafcet sequencial simples', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [{ qualifier: 'X', target: 'Q1' }] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1' }
      ]
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'SM2=M1*I1',
      'RM1=M1*I1',
      'XQ1=M2;'
    ]);
  });

  it('deve gerar corretamente bobinas com sintaxe {Qualificador}{Tipo}{Canal} (ex: SM5, ZQ2)', () => {
    const ir: GrafcetIR = {
      steps: [
        { 
          id: 2, 
          isInitial: false, 
          actions: [
            { qualifier: 'S', resourceType: 'M', channel: 5, description: 'Ativar Retenção M5' },
            { qualifier: 'Z', resourceType: 'Q', channel: 2, description: 'Toggle Q2' }
          ] 
        }
      ],
      transitions: []
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'SM5=M2',
      'ZQ2=M2;'
    ]);
  });

  it('deve normalizar receptividades com operadores AND, OR, NOT para *, +, !', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1 AND NOT I2' }
      ]
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines[0]).toBe('SM2=M1*I1*!I2');
    expect(config.lines[1]).toBe('RM1=M1*I1*!I2;');
  });

  it('deve suportar divergência em E (ativação paralela de etapas)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2, 3], receptivity: 'I1' }
      ]
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'SM2=M1*I1',
      'SM3=M1*I1',
      'RM1=M1*I1;'
    ]);
  });

  it('deve gerar seções de timers, counters e comparats no formato especificado', () => {
    const ir: GrafcetIR = {
      steps: [
        {
          id: 1,
          isInitial: true,
          actions: [
            { qualifier: 'T', resourceType: 'T', channel: 1, preset: 5, offset: 0, functionType: 3 },
            { qualifier: 'S', resourceType: 'C', channel: 2, preset: 10, offset: 0, functionType: 1 },
            { qualifier: 'X', resourceType: 'A', channel: 1, port: 1, functionType: 2, preset: 2.15, offset: 0 }
          ]
        }
      ],
      transitions: []
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.timers).toEqual([
      { id: 1, funct: 3, preset: 5, offset: 0 }
    ]);
    expect(config.counters).toEqual([
      { id: 2, funct: 1, preset: 10, offset: 0 }
    ]);
    expect(config.comparats).toEqual([
      { id: 1, offset: 0, funct: 2, preset: 2.15, analogId: 1 }
    ]);

    expect(output.content).toContain('lines:');
    expect(output.content).toContain('timers:\n  {id: 1, funct: 3, preset: 5, offset: 0}');
    expect(output.content).toContain('counters:\n  {id: 2, funct: 1, preset: 10, offset: 0}');
    expect(output.content).toContain('comparats:\n  {id: 1, funct: 2, preset: 2.15, offset: 0, analogId: 1}');
  });

  it('deve gerar exatamente o formato completo solicitado com vírgulas e ponto-e-vírgula', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] },
        { id: 3, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: '1' },
        { id: 2, fromSteps: [2], toSteps: [3], receptivity: 'T1' },
        { id: 3, fromSteps: [3], toSteps: [1], receptivity: 'T2' }
      ],
      timers: [
        { id: 1, funct: 1, preset: 5, offset: 0 },
        { id: 2, funct: 1, preset: 5, offset: 0 },
        { id: 3, funct: 1, preset: 5, offset: 0 }
      ],
      counters: [
        { id: 1, funct: 1, preset: 5, offset: 0 },
        { id: 2, funct: 1, preset: 5, offset: 0 },
        { id: 3, funct: 1, preset: 5, offset: 0 }
      ],
      comparats: [
        { id: 1, funct: 1, preset: 1.5, offset: 0, analogId: 1 },
        { id: 2, funct: 1, preset: 1.5, offset: 0, analogId: 1 },
        { id: 3, funct: 1, preset: 1.5, offset: 0, analogId: 1 }
      ]
    };

    const output = generator.generate(ir);
    const expected = 
`lines:
  SM2=M1*1,
  SM3=M2*T1,
  SM1=M3*T2,
  RM1=M1*1,
  RM2=M2*T1,
  RM3=M3*T2,
  XQ1=M2+M3;
timers:
  {id: 1, funct: 1, preset: 5, offset: 0},
  {id: 2, funct: 1, preset: 5, offset: 0},
  {id: 3, funct: 1, preset: 5, offset: 0}
counters:
  {id: 1, funct: 1, preset: 5, offset: 0},
  {id: 2, funct: 1, preset: 5, offset: 0},
  {id: 3, funct: 1, preset: 5, offset: 0}
comparats:
  {id: 1, funct: 1, preset: 1.5, offset: 0, analogId: 1},
  {id: 2, funct: 1, preset: 1.5, offset: 0, analogId: 1},
  {id: 3, funct: 1, preset: 1.5, offset: 0, analogId: 1}`;

    expect(output.content).toBe(expected);
  });

  it('deve unificar equações em linha única para Convergência OU e Divergência OU', () => {
    // Grafcet com Divergência OU a partir da Etapa 1 para Etapa 2 (se I1) ou Etapa 3 (se I2),
    // e Convergência OU de Etapa 2 (se I3) ou Etapa 3 (se I4) para Etapa 4
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] },
        { id: 3, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 2 }] },
        { id: 4, isInitial: false, actions: [] }
      ],
      transitions: [
        // Ramos da Divergência OU a partir do Step 1
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1' },
        { id: 2, fromSteps: [1], toSteps: [3], receptivity: 'I2' },
        // Ramos da Convergência OU para o Step 4
        { id: 3, fromSteps: [2], toSteps: [4], receptivity: 'I3' },
        { id: 4, fromSteps: [3], toSteps: [4], receptivity: 'I4' }
      ]
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'SM2=M1*I1',
      'SM3=M1*I2',
      'SM4=M2*I3+M3*I4',
      'RM1=M1*I1+M1*I2',
      'RM2=M2*I3',
      'RM3=M3*I4',
      'XQ1=M2',
      'XQ2=M3;'
    ]);
  });

  it('deve unificar bobinas (X, S, R, Z) acionadas por múltiplas etapas em uma única linha (ex: XQ1=M1+M2)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] },
        { id: 2, isInitial: false, actions: [{ qualifier: 'X', resourceType: 'Q', channel: 1 }] },
        { id: 3, isInitial: false, actions: [
          { qualifier: 'S', resourceType: 'M', channel: 5 },
          { qualifier: 'Z', resourceType: 'Q', channel: 2 }
        ]},
        { id: 4, isInitial: false, actions: [
          { qualifier: 'S', resourceType: 'M', channel: 5 },
          { qualifier: 'Z', resourceType: 'Q', channel: 2 }
        ]}
      ],
      transitions: []
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'XQ1=M1+M2',
      'SM5=M3+M4',
      'ZQ2=M3+M4;'
    ]);
  });

  it('deve gerar corretamente convergência OU retornando à etapa inicial (ex: SM1=M2*I2+M3*I3)', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [] },
        { id: 3, isInitial: false, actions: [] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1' },
        { id: 2, fromSteps: [2], toSteps: [1], receptivity: 'I2' },
        { id: 3, fromSteps: [3], toSteps: [1], receptivity: 'I3' }
      ]
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'SM2=M1*I1',
      'SM1=M2*I2+M3*I3',
      'RM1=M1*I1',
      'RM2=M2*I2',
      'RM3=M3*I3;'
    ]);
  });

  it('deve gerar corretamente bobinas de temporizador com prefixo XT1 e fluxo completo do diagrama', () => {
    const ir: GrafcetIR = {
      steps: [
        {
          id: 1,
          isInitial: true,
          actions: [
            { qualifier: 'X', resourceType: 'Q', channel: 1 },
            { qualifier: 'X', resourceType: 'Q', channel: 2 },
            { qualifier: 'X', resourceType: 'T', channel: 1 }
          ]
        },
        {
          id: 2,
          isInitial: false,
          actions: [
            { qualifier: 'X', resourceType: 'Q', channel: 1 }
          ]
        },
        {
          id: 3,
          isInitial: false,
          actions: [
            { qualifier: 'X', resourceType: 'Q', channel: 2 }
          ]
        }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'R1' },
        { id: 2, fromSteps: [1], toSteps: [3], receptivity: 'R2' },
        { id: 3, fromSteps: [2], toSteps: [1], receptivity: 'R3' },
        { id: 4, fromSteps: [3], toSteps: [1], receptivity: 'R4' }
      ]
    };

    const output = generator.generate(ir);
    const config = output.metadata?.config;

    expect(config.lines).toEqual([
      'SM2=M1*R1',
      'SM3=M1*R2',
      'SM1=M2*R3+M3*R4',
      'RM1=M1*R1+M1*R2',
      'RM2=M2*R3',
      'RM3=M3*R4',
      'XQ1=M1+M2',
      'XQ2=M1+M3',
      'XT1=M1;'
    ]);
  });
});



