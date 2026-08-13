import { ICodeGenerator, GeneratedOutput } from '../generator/ICodeGenerator.js';
import { GrafcetIR, StepNode, TransitionNode } from '../ir/GrafcetIR.js';

export class Userver03Generator implements ICodeGenerator {
  public readonly targetId = 'userver03';
  public readonly name = 'userver03 (Boolean Expressions JSON)';
  public readonly fileExtension = 'cfg';
  public readonly mimeType = 'application/json';

  public generate(ir: GrafcetIR): GeneratedOutput {
    const lines: string[] = [];

    // 1. Processar Transições e Evolução de Etapas (Set e Reset das memórias Mn)
    for (const transition of ir.transitions) {
      const normalizedReceptivity = this.normalizeReceptivity(transition.receptivity);
      
      // Condição de origem: M1 ou (M1*M2) para convergência E
      const fromCond = transition.fromSteps
        .map(stepId => `M${stepId}`)
        .join('*');
      
      const fullCondition = normalizedReceptivity 
        ? `${fromCond}*${normalizedReceptivity}`
        : fromCond;

      // Ativação das etapas de destino (Set M_to)
      for (const toStepId of transition.toSteps) {
        lines.push(`SM${toStepId}=${fullCondition}`);
      }

      // Desativação das etapas de origem (Reset M_from)
      for (const fromStepId of transition.fromSteps) {
        lines.push(`RM${fromStepId}=${fullCondition}`);
      }
    }

    // 2. Processar Ações associadas a cada Etapa
    for (const step of ir.steps) {
      const stepMarker = `M${step.id}`;
      
      for (const action of step.actions) {
        // Extrair Qualificador (X, S, R, Z, T), Tipo (Q, M, T, C, A) e Canal (1..N)
        const qualifier = (action.qualifier || action.type || 'X').toUpperCase();
        let resourceType = (action.resourceType || 'Q').toUpperCase();
        let channel = action.channel || 1;

        // Suporte para campos herdados caso 'target' estivesse preenchido (ex: "Q3")
        if (action.target && !action.resourceType) {
          const match = action.target.match(/^([a-zA-Z]+)(\d+)$/);
          if (match) {
            resourceType = match[1].toUpperCase();
            channel = parseInt(match[2], 10);
          }
        }

        const coilTarget = `${resourceType}${channel}`;

        switch (qualifier) {
          case 'X':
          case 'P':
          case 'N': // Sem Retenção (Normal)
            lines.push(`S${coilTarget}=${stepMarker}`);
            lines.push(`R${coilTarget}=!${stepMarker}`);
            break;

          case 'S': // Set (Ativa Retenção / Latch)
            lines.push(`S${coilTarget}=${stepMarker}`);
            break;

          case 'R': // Reset (Desativa Retenção / Unlatch)
            lines.push(`R${coilTarget}=${stepMarker}`);
            break;

          case 'Z': // Toggle (Inverte Estado)
            lines.push(`Z${coilTarget}=${stepMarker}`);
            break;

          case 'T': // Ativação Temporizada
            lines.push(`T${coilTarget}=${stepMarker}`);
            break;

          default:
            lines.push(`S${coilTarget}=${stepMarker}`);
            break;
        }
      }
    }

    // 3. Montar a estrutura final do JSON do userver03 (/code_param.cfg)
    const jsonOutput = {
      lines: lines,
      timers: (ir.timers || []).map(t => ({
        id: t.id,
        pst: t.preset,
        ofs: t.offset,
        fun: t.functionType
      })),
      counters: (ir.counters || []).map(c => ({
        id: c.id,
        pst: c.preset,
        ofs: c.offset,
        fun: c.functionType
      })),
      comparers: (ir.comparers || []).map(cmp => ({
        id: cmp.id,
        prt: cmp.port,
        pst: cmp.preset,
        ofs: cmp.offset,
        fun: cmp.functionType
      }))
    };

    return {
      targetId: this.targetId,
      filename: 'code_param.cfg',
      mimeType: this.mimeType,
      content: JSON.stringify(jsonOutput, null, 2),
      metadata: {
        totalLines: lines.length,
        stepsCount: ir.steps.length,
        transitionsCount: ir.transitions.length
      }
    };
  }

  /**
   * Normaliza operadores lógicos para a sintaxe do userver03 (*, +, !)
   */
  private normalizeReceptivity(receptivity: string): string {
    if (!receptivity) return '';

    return receptivity
      .replace(/\s+/g, '') // remove espaços extras
      .replace(/AND/gi, '*')
      .replace(/&&/g, '*')
      .replace(/OR/gi, '+')
      .replace(/\|\|/g, '+')
      .replace(/NOT/gi, '!')
      .replace(/~/g, '!');
  }
}
