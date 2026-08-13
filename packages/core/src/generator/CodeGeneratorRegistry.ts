import { ICodeGenerator, GeneratedOutput } from './ICodeGenerator.js';
import { GrafcetIR } from '../ir/GrafcetIR.js';

export class CodeGeneratorRegistry {
  private static generators: Map<string, ICodeGenerator> = new Map();

  public static register(generator: ICodeGenerator): void {
    this.generators.set(generator.targetId, generator);
  }

  public static get(targetId: string): ICodeGenerator | undefined {
    return this.generators.get(targetId);
  }

  public static list(): { targetId: string; name: string; fileExtension: string }[] {
    return Array.from(this.generators.values()).map(g => ({
      targetId: g.targetId,
      name: g.name,
      fileExtension: g.fileExtension,
    }));
  }

  public static generate(targetId: string, ir: GrafcetIR): GeneratedOutput {
    const generator = this.get(targetId);
    if (!generator) {
      throw new Error(`Code generator target '${targetId}' is not registered.`);
    }
    return generator.generate(ir);
  }
}
