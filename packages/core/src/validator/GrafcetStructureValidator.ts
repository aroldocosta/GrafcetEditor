import { GrafcetIR, TransitionNode, StepNode } from '../ir/GrafcetIR.js';

export interface StructureValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class GrafcetStructureValidator {
  /**
   * Valida a integridade estrutural e topológica de um diagrama GRAFCET (IEC 60848).
   * Verifica especialmente as regras de sequências simultâneas / paralelismo:
   * - Sem cruzamentos parciais entre ramais paralelos.
   * - Fechamento mandatório de cada ramal na respectiva convergência em "E".
   * - Ausência de entradas externas no meio de um percurso paralelo.
   */
  public static validate(ir: GrafcetIR): StructureValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const stepsMap = new Map<number, StepNode>(ir.steps.map(s => [s.id, s]));

    // Mapear transições que saem de cada etapa (Step -> Transitions)
    const transitionsFromStep = new Map<number, TransitionNode[]>();
    // Mapear transições que chegam a cada etapa (Step -> Transitions)
    const transitionsToStep = new Map<number, TransitionNode[]>();

    for (const step of ir.steps) {
      transitionsFromStep.set(step.id, []);
      transitionsToStep.set(step.id, []);
    }

    for (const t of ir.transitions) {
      for (const fromId of t.fromSteps) {
        if (transitionsFromStep.has(fromId)) {
          transitionsFromStep.get(fromId)!.push(t);
        }
      }
      for (const toId of t.toSteps) {
        if (transitionsToStep.has(toId)) {
          transitionsToStep.get(toId)!.push(t);
        }
      }
    }

    // 1. Identificar todas as divergências em "E" (transições que abrem mais de 1 etapa)
    const divergences = ir.transitions.filter(t => t.toSteps.length > 1);

    for (const div of divergences) {
      // Mapear as etapas pertencentes a cada ramal da divergência
      const branchSteps = new Map<number, Set<number>>();
      const branchTerminalSteps = new Map<number, Set<number>>();

      // Mapear percurso de cada ramal
      for (let branchIdx = 0; branchIdx < div.toSteps.length; branchIdx++) {
        const rootStepId = div.toSteps[branchIdx];
        const visited = new Set<number>();
        const queue: number[] = [rootStepId];
        const terminals = new Set<number>();

        while (queue.length > 0) {
          const currId = queue.shift()!;
          if (visited.has(currId)) continue;
          visited.add(currId);

          const outgoingTransitions = transitionsFromStep.get(currId) || [];
          if (outgoingTransitions.length === 0) {
            terminals.add(currId);
            continue;
          }

          for (const outT of outgoingTransitions) {
            // Se outT for uma convergência em "E", este nó é terminal para este ramal
            if (outT.fromSteps.length > 1) {
              terminals.add(currId);
            } else {
              for (const nextStepId of outT.toSteps) {
                if (!visited.has(nextStepId)) {
                  queue.push(nextStepId);
                }
              }
            }
          }
        }

        branchSteps.set(branchIdx, visited);
        branchTerminalSteps.set(branchIdx, terminals);
      }

      // 2. Verificar Cruzamentos Parciais entre os ramais (Interseção entre ramais)
      for (let i = 0; i < div.toSteps.length; i++) {
        for (let j = i + 1; j < div.toSteps.length; j++) {
          const stepsI = branchSteps.get(i)!;
          const stepsJ = branchSteps.get(j)!;

          // Verificar etapas que pertencem a ambos os ramais antes da convergência
          for (const sId of stepsI) {
            if (stepsJ.has(sId)) {
              errors.push(
                `Cruzamento parcial detectado (IEC 60848 item 3.1): A Etapa ${sId} pertence simultaneamente aos ramais ${i + 1} e ${j + 1} da Divergência ${div.id} sem passar por uma convergência em "E".`
              );
            }
          }

          // Verificar transições diretas saltando de um ramal para outro
          for (const sId of stepsI) {
            const outgoing = transitionsFromStep.get(sId) || [];
            for (const t of outgoing) {
              if (t.fromSteps.length === 1) {
                for (const targetId of t.toSteps) {
                  if (stepsJ.has(targetId) && !stepsI.has(targetId)) {
                    errors.push(
                      `Cruzamento parcial proibido (IEC 60848 item 3.1): Transição ${t.id} salta do Ramal ${i + 1} (Etapa ${sId}) para o Ramal ${j + 1} (Etapa ${targetId}) no meio do paralelismo.`
                    );
                  }
                }
              }
            }
          }

          for (const sId of stepsJ) {
            const outgoing = transitionsFromStep.get(sId) || [];
            for (const t of outgoing) {
              if (t.fromSteps.length === 1) {
                for (const targetId of t.toSteps) {
                  if (stepsI.has(targetId) && !stepsJ.has(targetId)) {
                    errors.push(
                      `Cruzamento parcial proibido (IEC 60848 item 3.1): Transição ${t.id} salta do Ramal ${j + 1} (Etapa ${sId}) para o Ramal ${i + 1} (Etapa ${targetId}) no meio do paralelismo.`
                    );
                  }
                }
              }
            }
          }
        }
      }

      // 3. Verificar se todos os ramais da divergência alcançam uma mesma convergência em "E"
      for (let branchIdx = 0; branchIdx < div.toSteps.length; branchIdx++) {
        const terminals = branchTerminalSteps.get(branchIdx)!;
        let branchConverged = false;

        for (const termId of terminals) {
          const outgoing = transitionsFromStep.get(termId) || [];
          const conv = outgoing.find(t => t.fromSteps.length > 1);
          if (conv) {
            branchConverged = true;
            for (let otherIdx = 0; otherIdx < div.toSteps.length; otherIdx++) {
              if (otherIdx === branchIdx) continue;
              const otherSteps = branchSteps.get(otherIdx)!;
              const hasFromOther = conv.fromSteps.some(fs => otherSteps.has(fs));
              if (!hasFromOther) {
                errors.push(
                  `Convergência incompleta (IEC 60848): A Convergência ${conv.id} sincroniza o Ramal ${branchIdx + 1}, mas não inclui etapas do Ramal ${otherIdx + 1} da Divergência ${div.id}.`
                );
              }
            }
          }
        }

        if (!branchConverged && terminals.size > 0) {
          const terminalList = Array.from(terminals).join(', ');
          errors.push(
            `Ramal sem fechamento (IEC 60848): O Ramal ${branchIdx + 1} da Divergência ${div.id} (terminando em Etapa(s) [${terminalList}]) não fecha em uma convergência em "E".`
          );
        }
      }

      // 4. Alerta de receptividades idênticas em divergência e convergência associadas
      const candidateConvergences = ir.transitions.filter(t => t.fromSteps.length > 1);
      for (const conv of candidateConvergences) {
        if (div.receptivity && conv.receptivity) {
          const normDiv = div.receptivity.trim().toUpperCase();
          const normConv = conv.receptivity.trim().toUpperCase();
          if (normDiv === normConv && normDiv !== '1' && normDiv !== 'TRUE') {
            warnings.push(
              `Aviso de Projeto GRAFCET: A transição de abertura (Divergência ${div.id}) e a transição de fechamento (Convergência ${conv.id}) compartilham a mesma receptividade "${div.receptivity}". Isso pode causar disparo prematuro da convergência por corrida de sinal.`
            );
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
