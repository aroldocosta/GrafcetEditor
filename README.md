# GrafcetEditor — Monorepo

Aplicativo para edição, compilação e implantação HTTP em dispositivos IoT de diagramas Grafcet / SFC.

## 🏗️ Estrutura do Monorepo

```text
GrafcetEditor/
├── packages/
│   ├── core/                    # Módulo Compilador (AST, IR, Userver03Generator, Multi-Target)
│   ├── ui/                      # Interface Web Grafcet (Migrada)
│   └── server/                  # Backend HTTP (Compilação API & Deploy IoT)
├── apps/
│   └── desktop/                 # Executável Desktop (Tauri v2)
├── firmware/
│   └── esp32_grafcet_engine/    # Firmware C++ ESP32 de referência receptor do code_param.cfg
├── package.json                 # Package raiz do Monorepo
├── pnpm-workspace.yaml          # Configuração de workspaces pnpm/bun
└── turbo.json                   # Orquestrador Turborepo
```

## 🚀 Como Executar

### Comando Único (Inicia UI e Servidor Backend em Paralelo):
```bash
bun dev
```
* **Interface Web (Editor):** `http://localhost:8080`
* **Servidor HTTP Deploy (Backend):** `http://localhost:3000`

---

### Executar Serviços Separadamente (Opcional):
* **Apenas a Interface Web:** `bun dev:ui`
* **Apenas o Backend Server:** `bun dev:server`
* **Executar Testes Automatizados:** `bun test`
