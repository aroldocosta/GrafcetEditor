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

---

## 📋 Relatório de Conformidade: Regras de Paralelismo (Divergência e Convergência em "E")

> **Referência Normativa:** IEC 60848 (GRAFCET)  
> **Objetivo:** Guia e referência técnica para implementação, validação e evolução do suporte a paralelismo no `GrafcetEditor`.

### 1. Resumo Executivo da Avaliação

| Categoria | Regra Avaliada | Nível de Atendimento | Status |
| :--- | :--- | :---: | :---: |
| **1. Divergência em "E"** | 1.1. Transição comum única antes da barra dupla | **85%** | Parcialmente Atendido (Atendido na semântica, sem trava no editor) |
| | 1.2. Ativação simultânea dos ramais inferiores | **100%** | **Totalmente Atendido** |
| | 1.3. Evolução independente de cada ramal | **100%** | **Totalmente Atendido** |
| **2. Convergência em "E"** | 2.1. Sincronização obrigatória (aguarda último ramal) | **100%** | **Totalmente Atendido** |
| | 2.2. Transição única logo após a linha dupla | **100%** | **Totalmente Atendido** |
| | 2.3. Condição de disparo (todas as etapas finais ativas) | **100%** | **Totalmente Atendido** |
| | 2.4. Desativação limpa e simultânea dos ramais | **100%** | **Totalmente Atendido** |
| **3. Segurança e Estrutura**| 3.1. Sem cruzamentos parciais entre ramais | **20%** | **Não Atendido** (Vulnerabilidade de validação topológica) |
| | 3.2. Bloqueio de espera na última etapa | **100%** | **Totalmente Atendido** |

* **Índice Global de Adequação Semântica / Compilação:** **100%**
* **Índice Global de Adequação Estrutural / Validação no Editor:** **60%**

---

### 2. Análise Detalhada das Regras

#### 1. Divergência em "E" (Início do Paralelismo)
* **1.1. Transição comum única:**
  * *Norma:* Existe apenas uma transição antes da linha dupla horizontal.
  * *Implementação:* O bloco `and_divergence` possui conector único de entrada superior e barra dupla (`.branch-bar.double`). A transição considerada pelo compilador é a da etapa imediatamente anterior (`s.transitions[0].receptivity`).
  * *Ponto de atenção:* O editor gráfico ainda permite interligar mais de uma etapa ao conector de topo. Necessita de restrição no editor para garantir aridade de entrada 1:1.
* **1.2. Ativação simultânea:**
  * *Norma:* Quando a transição anterior se torna verdadeira, todas as etapas imediatamente abaixo da linha dupla são ativadas ao mesmo tempo.
  * *Implementação:* O compilador (`Userver03Generator`) gera equações `Set` (`SMn`) para todas as etapas conectadas aos ramos com a mesma condição (`SM2=M1*I1` e `SM3=M1*I1`), garantindo ativação no mesmo ciclo.
* **1.3. Evolução independente:**
  * *Norma:* Após ativação, cada ramal evolui de forma desacoplada com seu próprio ritmo de etapas e transições.
  * *Implementação:* Cada ramal possui memórias `Mx`, `My` e equações de transição independentes, sem compartilhamento forçado de passos até o ponto de sincronização.

#### 2. Convergência em "E" (Fim do Paralelismo)
* **2.1. Sincronização obrigatória:**
  * *Norma:* A linha dupla inferior aguarda o término de todos os processos paralelos.
  * *Implementação:* O compilador gera a condição de origem pelo produto lógico de todas as etapas finais (`fromCond = M2*M3`). Se um ramal terminar antes, o produto permanece falso (`0`).
* **2.2. Transição única:**
  * *Norma:* Existe apenas uma transição logo após a linha dupla de fechamento.
  * *Implementação:* O bloco `and_convergence` possui exatamente uma transição central (`.branch-transition.center`) logo abaixo da barra dupla.
* **2.3. Condição de disparo:**
  * *Norma:* Para disparar, todas as últimas etapas de cada ramal paralelo devem estar ativas simultaneamente.
  * *Implementação:* A equação completa é gerada como `M_ramal1 * M_ramal2 * ... * Receptividade`. O disparo só ocorre na conjunção plena de todas as etapas ativas.
* **2.4. Desativação limpa:**
  * *Norma:* No disparo, todas as etapas finais dos ramais paralelos são desativadas juntas, avançando para a etapa unificada.
  * *Implementação:* Todas as etapas de origem recebem o reset simultâneo (`RM2=M2*M3*I2` e `RM3=M2*M3*I2`), prevenindo etapas órfãs ou ativas indevidamente.

#### 3. Regras de Segurança e Estrutura
* **3.1. Sem cruzamentos parciais:**
  * *Norma:* Não é permitido saltar de um ramal paralelo para o outro no meio do percurso sem fechar a estrutura adequadamente.
  * *Status Atual:* **Vulnerabilidade identificada.** O editor atualmente permite ligações arbitrárias entre conectores e o validador (`ReceptivityValidator`) analisa apenas sintaxe de expressões booleanas, sem verificação topológica do grafo.
* **3.2. Bloqueio de espera:**
  * *Norma:* Se um ramal terminar antes, permanece retido na sua última etapa aguardando os demais.
  * *Implementação:* Como as memórias são biestáveis (Set/Reset) e o `RM` depende do produto de todos os ramais, a etapa do ramal que adiantou permanece em nível lógico alto (`1`) retida com segurança.

---

### 3. Backlog e Diretrizes para Próximas Implementações

1. **Validador Estrutural do Grafo (`GrafcetStructureValidator`):**
   * Validar se ramais paralelos bifurcados por uma `and_divergence` convergem para uma mesma `and_convergence`.
   * Bloquear ligações cruzadas entre nós internos de ramais paralelos distintos.
   * Impedir múltiplas conexões de entrada na `and_divergence`.
2. **Editor Visual (UI):**
   * Implementar feedback visual (bloqueio de snap/ligação) ao tentar criar fios entre etapas de ramais paralelos concorrentes.
   * Suporte dinâmico a 3 ou mais ramais em paralelo (atualmente limitado a 2 na UI).

