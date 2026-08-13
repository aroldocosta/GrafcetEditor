export * from './ir/GrafcetIR.js';
export * from './generator/ICodeGenerator.js';
export * from './generator/CodeGeneratorRegistry.js';
export * from './targets/Userver03Generator.js';

import { CodeGeneratorRegistry } from './generator/CodeGeneratorRegistry.js';
import { Userver03Generator } from './targets/Userver03Generator.js';

// Registrar o gerador padrão userver03 no carregamento do módulo
CodeGeneratorRegistry.register(new Userver03Generator());
