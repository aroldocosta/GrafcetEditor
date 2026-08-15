import { describe, it, expect } from 'vitest';
import { Userver03Generator } from '../Userver03Generator.js';
import { GrafcetIR } from '../../ir/GrafcetIR.js';

describe('Userver03Generator', () => {
  const generator = new Userver03Generator();

  it('deve gerar expressões booleanas corretas para um Grafcet sequencial simples', () => {
    const ir: GrafcetIR = {
      steps: [
        { id: 1, isInitial: true, actions: [] },
        { id: 2, isInitial: false, actions: [{ type: 'N', target: 'Q1' }] }
      ],
      transitions: [
        { id: 1, fromSteps: [1], toSteps: [2], receptivity: 'I1' }
      ]
    };

    const output = generator.generate(ir);
    const parsed = JSON.parse(output.content);

    expect(parsed.lines).toEqual([
      'SM2=M1*I1',
      'RM1=M1*I1',
      'SQ1=M2',
      'RQ1=!M2;'
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
    const parsed = JSON.parse(output.content);

    expect(parsed.lines).toEqual([
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
    const parsed = JSON.parse(output.content);

    expect(parsed.lines[0]).toBe('SM2=M1*I1*!I2');
    expect(parsed.lines[1]).toBe('RM1=M1*I1*!I2;');
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
    const parsed = JSON.parse(output.content);

    expect(parsed.lines).toEqual([
      'SM2=M1*I1',
      'SM3=M1*I1',
      'RM1=M1*I1;'
    ]);
  });

  it('deve gerar seções de timers, counters e comparats no JSON a partir de ações T, C, A', () => {
    const ir: GrafcetIR = {
      steps: [
        {
          id: 1,
          isInitial: true,
          actions: [
            { qualifier: 'T', resourceType: 'T', channel: 1, preset: 5, offset: 0, functionType: 1 },
            { qualifier: 'S', resourceType: 'C', channel: 2, preset: 10, offset: 0, functionType: 1 },
            { qualifier: 'X', resourceType: 'A', channel: 1, port: 1, functionType: 2, preset: 2.15, offset: 0 }
          ]
        }
      ],
      transitions: []
    };

    const output = generator.generate(ir);
    const parsed = JSON.parse(output.content);

    expect(parsed.timers).toEqual([
      { id: 1, fun: 1, pst: 5, ofs: 0 }
    ]);
    expect(parsed.counters).toEqual([
      { id: 2, fun: 1, pst: 10, ofs: 0 }
    ]);
    expect(parsed.comparats).toEqual([
      { id: 1, prt: 1, fun: 2, pst: 2.15, ofs: 0 }
    ]);
  });
});
