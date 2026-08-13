export class CodeGeneratorRegistry {
    static generators = new Map();
    static register(generator) {
        this.generators.set(generator.targetId, generator);
    }
    static get(targetId) {
        return this.generators.get(targetId);
    }
    static list() {
        return Array.from(this.generators.values()).map(g => ({
            targetId: g.targetId,
            name: g.name,
            fileExtension: g.fileExtension,
        }));
    }
    static generate(targetId, ir) {
        const generator = this.get(targetId);
        if (!generator) {
            throw new Error(`Code generator target '${targetId}' is not registered.`);
        }
        return generator.generate(ir);
    }
}
