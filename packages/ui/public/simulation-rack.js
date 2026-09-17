/**
 * Simulation Rack UI Manager (GrafcetEditor)
 * Renderiza e gerencia os instrumentos de E/S industriais (botoeiras, sliders, LEDs, relés).
 */

class SimulationRackManager {
  constructor() {
    this.engine = null;
    this.dockEl = null;
    this.isDockCollapsed = false;
    this.discoveredIO = {
      inputs: new Set(),
      remotes: new Set(),
      analogs: new Set(),
      outputs: new Set(),
      timers: new Set()
    };
  }

  init() {
    this.dockEl = document.getElementById("simulation-dock");
    this.setupDockToggle();
  }

  setupDockToggle() {
    const toggleBtn = document.getElementById("dock-toggle-btn");
    const header = document.querySelector(".dock-header");

    const toggle = () => {
      if (!this.dockEl) return;
      this.isDockCollapsed = !this.isDockCollapsed;
      this.dockEl.classList.toggle("collapsed", this.isDockCollapsed);
      if (toggleBtn) {
        toggleBtn.textContent = this.isDockCollapsed ? "▲ Expandir" : "▼ Recolher";
      }
    };

    if (toggleBtn) toggleBtn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    if (header) header.addEventListener("click", toggle);
  }

  startSimulation(ir) {
    if (!ir) return;

    this.discoverIO(ir);

    // Instanciar o motor com o IR compilado
    this.engine = new window.GrafcetSimulatorEngine(ir);

    // Renderizar os módulos de E/S
    this.renderRackModules();

    // Inscrever-se para atualizações reativas de estado
    this.engine.subscribe((state) => {
      this.updateUI(state);
    });

    // Abrir a gaveta e marcar modo simulação
    if (this.dockEl) {
      this.dockEl.style.display = "flex";
      this.dockEl.classList.remove("collapsed");
      this.isDockCollapsed = false;
    }
    document.body.classList.add("sim-mode-active");

    // Iniciar o loop de scan automático (50ms)
    this.engine.start(50);
  }

  stopSimulation() {
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }

    // Fechar gaveta e limpar canvas
    if (this.dockEl) {
      this.dockEl.style.display = "none";
    }
    document.body.classList.remove("sim-mode-active");
    this.clearCanvasHighlights();
  }

  pauseSimulation() {
    if (this.engine) {
      this.engine.pause();
    }
  }

  resumeSimulation() {
    if (this.engine) {
      this.engine.start(50);
    }
  }

  stepSimulation() {
    if (this.engine) {
      this.engine.pause();
      this.engine.step(50);
    }
  }

  discoverIO(ir) {
    this.discoveredIO.inputs.clear();
    this.discoveredIO.remotes.clear();
    this.discoveredIO.analogs.clear();
    this.discoveredIO.outputs.clear();
    this.discoveredIO.timers.clear();

    // Escanear receptividades de transições para descobrir I, R e A
    if (ir.transitions) {
      for (const t of ir.transitions) {
        const text = t.receptivity || "";
        // Match entradas digitais físicas (ex: I1, I2, E1)
        const iMatches = text.match(/\b[IE](\d+)\b/gi) || [];
        for (const m of iMatches) {
          const ch = parseInt(m.substring(1), 10);
          if (!isNaN(ch)) this.discoveredIO.inputs.add(ch);
        }

        // Match entradas remotas (ex: R1, R2 - MQTT / Web GUI)
        const rMatches = text.match(/\bR(\d+)\b/gi) || [];
        for (const m of rMatches) {
          const ch = parseInt(m.substring(1), 10);
          if (!isNaN(ch)) this.discoveredIO.remotes.add(ch);
        }

        // Match entradas analógicas (ex: A1, A2)
        const aMatches = text.match(/\bA(\d+)\b/gi) || [];
        for (const m of aMatches) {
          const ch = parseInt(m.substring(1), 10);
          if (!isNaN(ch)) this.discoveredIO.analogs.add(ch);
        }

        // Match temporizadores (ex: T1, T2)
        const tMatches = text.match(/\bT(\d+)\b/gi) || [];
        for (const m of tMatches) {
          const ch = parseInt(m.substring(1), 10);
          if (!isNaN(ch)) this.discoveredIO.timers.add(ch);
        }
      }
    }

    // Escanear ações para descobrir saídas Q e timers T
    if (ir.steps) {
      for (const s of ir.steps) {
        if (s.actions) {
          for (const a of s.actions) {
            const ch = Number(a.channel) || 1;
            if (a.resourceType === 'Q') {
              this.discoveredIO.outputs.add(ch);
            } else if (a.resourceType === 'T' || a.qualifier === 'T') {
              this.discoveredIO.timers.add(ch);
            }
          }
        }
      }
    }

    // Garantir ao menos I1 e Q1 se nada for detectado
    if (this.discoveredIO.inputs.size === 0) this.discoveredIO.inputs.add(1);
    if (this.discoveredIO.outputs.size === 0) this.discoveredIO.outputs.add(1);
  }

  renderRackModules() {
    const bodyEl = document.getElementById("simulation-dock-body");
    if (!bodyEl) return;
    bodyEl.innerHTML = "";

    // 1. Módulo: Entradas Digitais (Pushbuttons & Switches)
    const sortedInputs = Array.from(this.discoveredIO.inputs).sort((a, b) => a - b);
    if (sortedInputs.length > 0) {
      const inputModule = document.createElement("div");
      inputModule.className = "rack-module";
      inputModule.innerHTML = `
        <div class="module-title">
          <span>Entradas Digitais (I)</span>
          <span style="font-size: 9px; color: #64748b;">Pulsador / Chave</span>
        </div>
        <div class="module-grid" id="rack-inputs-grid"></div>
      `;

      const grid = inputModule.querySelector("#rack-inputs-grid");

      sortedInputs.forEach(ch => {
        const item = document.createElement("div");
        item.className = "pushbutton-wrapper";
        item.innerHTML = `
          <button class="pushbutton" id="btn-input-${ch}" title="Pressionar I${ch} (Pulsador)">
          </button>
          <div class="pushbutton-label">I${ch}</div>
          <div class="switch-wrapper" title="Travar I${ch} como Chave Ligada">
            <label class="toggle-switch">
              <input type="checkbox" id="chk-input-${ch}">
              <span class="slider-toggle"></span>
            </label>
          </div>
        `;

        const btn = item.querySelector(`#btn-input-${ch}`);
        const chk = item.querySelector(`#chk-input-${ch}`);

        // Eventos de Botoeira Momentânea (Pushbutton)
        const press = (e) => {
          e.preventDefault();
          btn.classList.add("pressed");
          if (!chk.checked) this.engine?.setDigitalInput(ch, true);
        };

        const release = (e) => {
          e.preventDefault();
          btn.classList.remove("pressed");
          if (!chk.checked) this.engine?.setDigitalInput(ch, false);
        };

        btn.addEventListener("mousedown", press);
        window.addEventListener("mouseup", release);
        btn.addEventListener("touchstart", press, { passive: false });
        window.addEventListener("touchend", release);

        // Evento de Chave com Trava (Toggle Switch)
        chk.addEventListener("change", () => {
          this.engine?.setDigitalInput(ch, chk.checked);
        });

        grid.appendChild(item);
      });

      bodyEl.appendChild(inputModule);
    }

    // 2. Módulo: Entradas Remotas (R) / Web & MQTT
    const sortedRemotes = Array.from(this.discoveredIO.remotes).sort((a, b) => a - b);
    if (sortedRemotes.length > 0) {
      const remoteModule = document.createElement("div");
      remoteModule.className = "rack-module remote-module";
      remoteModule.innerHTML = `
        <div class="module-title">
          <span>Entradas Remotas (R)</span>
          <span style="font-size: 9px; color: #38bdf8;">🌐 Web / MQTT</span>
        </div>
        <div class="module-grid" id="rack-remotes-grid"></div>
      `;

      const grid = remoteModule.querySelector("#rack-remotes-grid");

      sortedRemotes.forEach(ch => {
        const item = document.createElement("div");
        item.className = "pushbutton-wrapper remote-wrapper";
        item.innerHTML = `
          <button class="pushbutton remote-pushbutton" id="btn-remote-${ch}" title="Enviar Pulso R${ch} (MQTT / Web)">
            <span class="remote-btn-icon">📡</span>
          </button>
          <div class="pushbutton-label remote-label">R${ch}</div>
          <div class="switch-wrapper" title="Manter R${ch} Ativo (MQTT Retain / Flag)">
            <label class="toggle-switch">
              <input type="checkbox" id="chk-remote-${ch}">
              <span class="slider-toggle remote-toggle"></span>
            </label>
          </div>
        `;

        const btn = item.querySelector(`#btn-remote-${ch}`);
        const chk = item.querySelector(`#chk-remote-${ch}`);

        // Eventos de Botoeira Momentânea (Pushbutton Remoto)
        const press = (e) => {
          e.preventDefault();
          btn.classList.add("pressed");
          if (!chk.checked) this.engine?.setRemoteInput(ch, true);
        };

        const release = (e) => {
          e.preventDefault();
          btn.classList.remove("pressed");
          if (!chk.checked) this.engine?.setRemoteInput(ch, false);
        };

        btn.addEventListener("mousedown", press);
        window.addEventListener("mouseup", release);
        btn.addEventListener("touchstart", press, { passive: false });
        window.addEventListener("touchend", release);

        // Evento de Chave com Trava (Toggle Remoto)
        chk.addEventListener("change", () => {
          this.engine?.setRemoteInput(ch, chk.checked);
        });

        grid.appendChild(item);
      });

      bodyEl.appendChild(remoteModule);
    }

    // 3. Módulo: Entradas Analógicas (Sliders & Displays)
    const sortedAnalogs = Array.from(this.discoveredIO.analogs).sort((a, b) => a - b);
    if (sortedAnalogs.length > 0) {
      const analogModule = document.createElement("div");
      analogModule.className = "rack-module";
      analogModule.innerHTML = `
        <div class="module-title">
          <span>Entradas Analógicas (A)</span>
          <span style="font-size: 9px; color: #64748b;">0 a 1023 pts</span>
        </div>
        <div class="module-grid" id="rack-analogs-grid" style="flex-direction: column;"></div>
      `;

      const grid = analogModule.querySelector("#rack-analogs-grid");

      sortedAnalogs.forEach(ch => {
        const item = document.createElement("div");
        item.className = "analog-slider-wrapper";
        item.innerHTML = `
          <div class="analog-header">
            <span>Canal A${ch}</span>
            <span class="analog-value-badge" id="val-analog-${ch}">0</span>
          </div>
          <input type="range" class="analog-slider-input" id="slider-analog-${ch}" min="0" max="1023" value="0">
        `;

        const slider = item.querySelector(`#slider-analog-${ch}`);
        const valBadge = item.querySelector(`#val-analog-${ch}`);

        slider.addEventListener("input", () => {
          const val = Number(slider.value);
          valBadge.textContent = String(val);
          this.engine?.setAnalogInput(ch, val);
        });

        grid.appendChild(item);
      });

      bodyEl.appendChild(analogModule);
    }

    // 3. Módulo: Saídas Digitais (LEDs & Relés)
    const sortedOutputs = Array.from(this.discoveredIO.outputs).sort((a, b) => a - b);
    if (sortedOutputs.length > 0) {
      const outputModule = document.createElement("div");
      outputModule.className = "rack-module";
      outputModule.innerHTML = `
        <div class="module-title">
          <span>Saídas / Relés (Q)</span>
          <span style="font-size: 9px; color: #64748b;">Indicadores</span>
        </div>
        <div class="module-grid" id="rack-outputs-grid"></div>
      `;

      const grid = outputModule.querySelector("#rack-outputs-grid");

      sortedOutputs.forEach(ch => {
        const item = document.createElement("div");
        item.className = "led-indicator-wrapper";
        item.innerHTML = `
          <div class="led-indicator" id="led-output-${ch}"></div>
          <div class="relay-icon-wrapper" id="relay-output-${ch}" title="Relé Q${ch}">
            ⚡
          </div>
          <div class="pushbutton-label">Q${ch}</div>
        `;
        grid.appendChild(item);
      });

      bodyEl.appendChild(outputModule);
    }

    // 4. Módulo: Temporizadores (Timers)
    const sortedTimers = Array.from(this.discoveredIO.timers).sort((a, b) => a - b);
    if (sortedTimers.length > 0) {
      const timerModule = document.createElement("div");
      timerModule.className = "rack-module";
      timerModule.innerHTML = `
        <div class="module-title">
          <span>Temporizadores (T)</span>
          <span style="font-size: 9px; color: #64748b;">Tempo Real</span>
        </div>
        <div class="module-grid" id="rack-timers-grid" style="flex-direction: column;"></div>
      `;

      const grid = timerModule.querySelector("#rack-timers-grid");

      sortedTimers.forEach(ch => {
        const timerCfg = this.engine?.ir?.timers?.find(t => t.id === ch) || this.engine?.timers?.get(ch);
        const funct = timerCfg?.funct ?? timerCfg?.functionType ?? 1;
        const modeLabel = funct === 2 ? 'TOFF' : funct === 3 ? 'INT' : 'TON';
        const modeClass = funct === 2 ? 'toff' : funct === 3 ? 'int' : 'ton';

        const item = document.createElement("div");
        item.className = "timer-bar-wrapper";
        item.innerHTML = `
          <div class="timer-header">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>Timer T${ch}</span>
              <span class="timer-mode-badge ${modeClass}">${modeLabel}</span>
            </div>
            <span id="timer-val-${ch}" style="color: #38bdf8;">0.0s</span>
          </div>
          <div class="timer-progress-bg">
            <div class="timer-progress-fill" id="timer-bar-${ch}"></div>
          </div>
        `;
        grid.appendChild(item);
      });

      bodyEl.appendChild(timerModule);
    }
  }

  updateUI(state) {
    if (!state) return;

    // 1. Atualizar Saídas Digitais (LEDs e Relés)
    this.discoveredIO.outputs.forEach(ch => {
      const isEnergized = Boolean(state.outputs[ch]);
      const led = document.getElementById(`led-output-${ch}`);
      const relay = document.getElementById(`relay-output-${ch}`);

      if (led) led.classList.toggle("on", isEnergized);
      if (relay) relay.classList.toggle("energized", isEnergized);
    });

    // 1.1. Atualizar Entradas Remotas (R)
    if (state.remotes) {
      this.discoveredIO.remotes.forEach(ch => {
        const isRemoteActive = Boolean(state.remotes[ch]);
        const btn = document.getElementById(`btn-remote-${ch}`);
        if (btn) {
          btn.classList.toggle("active-remote", isRemoteActive);
        }
      });
    }

    // 2. Atualizar Temporizadores (TON, TOFF, INTERMITENTE)
    this.discoveredIO.timers.forEach(ch => {
      const timerState = state.timers[ch];
      const bar = document.getElementById(`timer-bar-${ch}`);
      const val = document.getElementById(`timer-val-${ch}`);

      if (timerState && bar && val) {
        const funct = timerState.funct || 1;
        const presetSec = (timerState.presetMs / 1000).toFixed(1);
        const elapsedSec = (timerState.elapsedMs / 1000).toFixed(1);

        if (funct === 3) {
          // INTERMITENTE (Oscilador)
          const tOn = timerState.presetMs > 0 ? timerState.presetMs : 1000;
          const tOff = timerState.offsetMs > 0 ? timerState.offsetMs : tOn;
          const totalCycle = (tOn + tOff) / 1000;
          const pct = Math.min(100, (timerState.elapsedMs / (tOn + tOff)) * 100);
          bar.style.width = `${pct}%`;
          bar.classList.toggle("done", timerState.done);
          bar.classList.toggle("intermittent-active", timerState.done);
          val.textContent = `${elapsedSec}s / ${totalCycle.toFixed(1)}s [${timerState.done ? 'ON' : 'OFF'}]`;
        } else if (funct === 2) {
          // TOFF (Atraso no Desligamento)
          const pct = timerState.presetMs > 0 
            ? Math.min(100, (timerState.elapsedMs / timerState.presetMs) * 100) 
            : 0;
          bar.style.width = `${pct}%`;
          bar.classList.toggle("done", timerState.done);
          bar.classList.toggle("toff-delay", timerState.done && !timerState.active);
          const statusDesc = timerState.active ? 'RETIDO' : (timerState.done ? 'ATRASO' : 'OFF');
          val.textContent = `${elapsedSec}s / ${presetSec}s (${statusDesc})`;
        } else {
          // TON (Atraso na Ligação)
          const pct = timerState.presetMs > 0 
            ? Math.min(100, (timerState.elapsedMs / timerState.presetMs) * 100) 
            : 0;
          bar.style.width = `${pct}%`;
          bar.classList.toggle("done", timerState.done);
          val.textContent = `${elapsedSec}s / ${presetSec}s`;
        }
      }
    });

    // 3. Atualizar Status Badge
    const statusBadge = document.getElementById("sim-status-display");
    if (statusBadge) {
      if (state.isRunning) {
        statusBadge.className = "sim-status-badge running";
        statusBadge.textContent = `EXECUÇÃO (Scan #${state.cycleCount})`;
      } else {
        statusBadge.className = "sim-status-badge paused";
        statusBadge.textContent = "PAUSADO";
      }
    }

    // 4. Atualizar Realce no Canvas (Etapas Ativas e Transições Prontas)
    this.updateCanvasHighlights(state);
  }

  updateCanvasHighlights(state) {
    const canvasEl = document.getElementById("canvas");
    if (!canvasEl) return;

    // Atualizar Etapas Ativas (.sim-active-step)
    const boxes = canvasEl.querySelectorAll(".box");
    boxes.forEach(b => {
      const stepId = parseInt(b.getAttribute("data-id"), 10);
      const innerText = b.querySelector(".inner-rect")?.textContent?.trim();
      const visualId = innerText ? parseInt(innerText, 10) : NaN;
      const isActive = state.activeSteps.includes(stepId) || (!isNaN(visualId) && state.activeSteps.includes(visualId));
      b.classList.toggle("sim-active-step", isActive);
    });

    // Atualizar Transições Franqueáveis (.sim-ready)
    const transBars = canvasEl.querySelectorAll(".transition, .branch-transition");
    transBars.forEach(bar => {
      const parentBox = bar.closest(".box");
      if (!parentBox) return;
      const stepId = parseInt(parentBox.getAttribute("data-id"), 10);
      const innerText = parentBox.querySelector(".inner-rect")?.textContent?.trim();
      const visualId = innerText ? parseInt(innerText, 10) : NaN;

      const isReady = state.validTransitions.some(tId => {
        if (!this.engine || !this.engine.ir) return false;
        const trans = this.engine.ir.transitions.find(t => t.id === tId);
        if (!trans) return false;
        return trans.fromSteps.includes(stepId) || (!isNaN(visualId) && trans.fromSteps.includes(visualId));
      });

      bar.classList.toggle("sim-ready", isReady);
    });
  }

  clearCanvasHighlights() {
    const canvasEl = document.getElementById("canvas");
    if (!canvasEl) return;

    canvasEl.querySelectorAll(".box").forEach(b => {
      b.classList.remove("sim-active-step");
    });
    canvasEl.querySelectorAll(".transition, .branch-transition").forEach(t => {
      t.classList.remove("sim-ready");
    });
  }
}

// Instância global
if (typeof window !== "undefined") {
  window.simulationRack = new SimulationRackManager();
}
