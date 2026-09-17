/**
 * Grafcet Simulator Engine (Client-side IEC 60848 Virtual PLC Engine)
 * Motor de simulação desacoplado e em tempo real para o GrafcetEditor.
 */

class ExpressionEvaluator {
  static evaluate(expression, context) {
    if (!expression) return false;
    let expr = String(expression).trim();
    if (expr === '1' || expr.toUpperCase() === 'TRUE') return true;
    if (expr === '0' || expr.toUpperCase() === 'FALSE') return false;

    expr = expr
      .replace(/\bAND\b/gi, '*')
      .replace(/\bOR\b/gi, '+')
      .replace(/\bNOT\b/gi, '!')
      .replace(/&&/g, '*')
      .replace(/\|\|/g, '+');

    expr = this.evaluateAnalogComparisons(expr, context.analogs);
    return this.evaluateBooleanExpression(expr, context);
  }

  static evaluateAnalogComparisons(expr, analogs) {
    const compRegex = /\bA(\d+)\s*(>=|<=|>|<|==|!=|=)\s*(\d+(?:\.\d+)?)\b/gi;
    return expr.replace(compRegex, (match, channelStr, op, thresholdStr) => {
      const channel = parseInt(channelStr, 10);
      const threshold = parseFloat(thresholdStr);
      const val = analogs.get(channel) ?? 0;

      let result = false;
      switch (op) {
        case '>': result = val > threshold; break;
        case '>=': result = val >= threshold; break;
        case '<': result = val < threshold; break;
        case '<=': result = val <= threshold; break;
        case '==':
        case '=': result = val === threshold; break;
        case '!=': result = val !== threshold; break;
      }
      return result ? '1' : '0';
    });
  }

  static evaluateBooleanExpression(expr, context) {
    const tokens = expr.match(/([()!*+]|[A-Za-z]\w*|\d+)/g);
    if (!tokens || tokens.length === 0) return false;

    const outputQueue = [];
    const operatorStack = [];
    const precedence = { '!': 3, '*': 2, '+': 1 };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '(') {
        operatorStack.push(token);
      } else if (token === ')') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
          outputQueue.push(operatorStack.pop());
        }
        operatorStack.pop();
      } else if (token in precedence) {
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1] !== '(' &&
          precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
        ) {
          outputQueue.push(operatorStack.pop());
        }
        operatorStack.push(token);
      } else {
        outputQueue.push(token);
      }
    }

    while (operatorStack.length > 0) {
      outputQueue.push(operatorStack.pop());
    }

    const evalStack = [];
    for (const token of outputQueue) {
      if (token === '!') {
        const a = evalStack.pop() ?? false;
        evalStack.push(!a);
      } else if (token === '*') {
        const b = evalStack.pop() ?? false;
        const a = evalStack.pop() ?? false;
        evalStack.push(a && b);
      } else if (token === '+') {
        const b = evalStack.pop() ?? false;
        const a = evalStack.pop() ?? false;
        evalStack.push(a || b);
      } else {
        evalStack.push(this.resolveOperand(token, context));
      }
    }

    return evalStack.pop() ?? false;
  }

  static resolveOperand(token, context) {
    if (token === '1') return true;
    if (token === '0') return false;

    const prefix = token.charAt(0).toUpperCase();
    const num = parseInt(token.substring(1), 10);
    if (isNaN(num)) return false;

    switch (prefix) {
      case 'I': return context.inputs.get(num) ?? false;
      case 'R': return context.remotes?.get(num) ?? false;
      case 'M': return context.memories.get(num) ?? false;
      case 'X': return context.steps.get(num) ?? false;
      case 'T': return context.timers.get(num) ?? false;
      case 'C': return context.counters.get(num) ?? false;
      default: return false;
    }
  }
}

class GrafcetSimulatorEngine {
  constructor(ir = null) {
    this.ir = null;
    this.activeSteps = new Set();
    this.previousActiveSteps = new Set();

    this.inputs = new Map();
    this.remotes = new Map();
    this.analogs = new Map();
    this.outputs = new Map();
    this.memories = new Map();
    this.timers = new Map();

    this.cycleCount = 0;
    this.isRunning = false;
    this.intervalId = null;
    this.scanRateMs = 50;

    this.onStateChangeCallbacks = [];

    if (ir) {
      this.loadIR(ir);
    }
  }

  loadIR(ir) {
    this.stop();
    this.ir = ir;
    this.reset();
  }

  reset() {
    this.activeSteps.clear();
    this.previousActiveSteps.clear();
    this.inputs.clear();
    this.remotes.clear();
    this.outputs.clear();
    this.memories.clear();
    this.timers.clear();
    this.cycleCount = 0;

    if (!this.ir) return;

    // Inicializar timers declarados em ir.timers
    if (this.ir.timers) {
      for (const t of this.ir.timers) {
        this.timers.set(t.id, {
          id: t.id,
          funct: t.funct ?? t.functionType ?? 1,
          presetMs: (t.preset ?? 5) * 1000,
          offsetMs: (t.offset ?? 0) * 1000,
          elapsedMs: 0,
          done: false,
          active: false
        });
      }
    }

    // Auto-descobrir timers em ações de etapas caso não declarados em ir.timers
    for (const step of this.ir.steps) {
      if (step.actions) {
        for (const a of step.actions) {
          if ((a.resourceType === 'T' || a.qualifier === 'T') && a.channel) {
            const ch = Number(a.channel);
            if (!isNaN(ch) && (!this.timers.has(ch) || a.preset !== undefined)) {
              this.timers.set(ch, {
                id: ch,
                funct: a.functionType ?? (this.timers.get(ch)?.funct ?? 1),
                presetMs: (a.preset !== undefined ? a.preset : (this.timers.get(ch)?.presetMs ? this.timers.get(ch).presetMs / 1000 : 5)) * 1000,
                offsetMs: (a.offset !== undefined ? a.offset : (this.timers.get(ch)?.offsetMs ? this.timers.get(ch).offsetMs / 1000 : 0)) * 1000,
                elapsedMs: 0,
                done: false,
                active: false
              });
            }
          }
        }
      }
    }

    // Auto-descobrir timers em receptividades de transições caso não declarados
    for (const trans of this.ir.transitions) {
      if (trans.receptivity) {
        const matches = trans.receptivity.match(/\bT(\d+)\b/gi);
        if (matches) {
          for (const m of matches) {
            const ch = parseInt(m.substring(1), 10);
            if (!isNaN(ch) && !this.timers.has(ch)) {
              this.timers.set(ch, {
                id: ch,
                funct: 1,
                presetMs: 5000,
                offsetMs: 0,
                elapsedMs: 0,
                done: false,
                active: false
              });
            }
          }
        }
      }
    }

    for (const step of this.ir.steps) {
      if (step.isInitial) {
        this.activeSteps.add(step.id);
      }
    }

    this.updateTimers(0);
    this.executeActions(0);
    this.notifyState();
  }

  setDigitalInput(channel, value) {
    this.inputs.set(Number(channel), Boolean(value));
    this.notifyState();
  }

  setRemoteInput(channel, value) {
    this.remotes.set(Number(channel), Boolean(value));
    this.notifyState();
  }

  setAnalogInput(channel, value) {
    this.analogs.set(Number(channel), Number(value));
    this.notifyState();
  }

  forceStep(stepId, state) {
    const id = Number(stepId);
    if (state) {
      this.activeSteps.add(id);
    } else {
      this.activeSteps.delete(id);
    }
    this.executeActions(0);
    this.notifyState();
  }

  step(dtMs = this.scanRateMs) {
    if (!this.ir) return;

    this.cycleCount++;
    this.updateTimers(dtMs);

    const context = this.buildContext();
    const transitionsToClear = [];

    for (const transition of this.ir.transitions) {
      const isValidated = transition.fromSteps.every(stepId => this.activeSteps.has(stepId));
      if (isValidated) {
        const isReceptive = ExpressionEvaluator.evaluate(transition.receptivity, context);
        if (isReceptive) {
          transitionsToClear.push(transition);
        }
      }
    }

    if (transitionsToClear.length > 0) {
      const stepsToDeactivate = new Set();
      const stepsToActivate = new Set();

      for (const trans of transitionsToClear) {
        for (const fromId of trans.fromSteps) {
          stepsToDeactivate.add(fromId);
        }
        for (const toId of trans.toSteps) {
          stepsToActivate.add(toId);
        }
      }

      this.previousActiveSteps = new Set(this.activeSteps);

      for (const stepId of stepsToDeactivate) {
        if (!stepsToActivate.has(stepId)) {
          this.activeSteps.delete(stepId);
        }
      }

      for (const stepId of stepsToActivate) {
        this.activeSteps.add(stepId);
      }
    }

    this.executeActions(dtMs);
    this.notifyState();
  }

  start(scanRateMs = 50) {
    if (this.isRunning) return;
    this.scanRateMs = scanRateMs;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.step(this.scanRateMs);
    }, this.scanRateMs);
    this.notifyState();
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notifyState();
  }

  stop() {
    this.pause();
    this.reset();
  }

  subscribe(callback) {
    this.onStateChangeCallbacks.push(callback);
    callback(this.getState());
    return () => {
      const idx = this.onStateChangeCallbacks.indexOf(callback);
      if (idx !== -1) this.onStateChangeCallbacks.splice(idx, 1);
    };
  }

  getState() {
    const validTransitions = [];
    if (this.ir) {
      const context = this.buildContext();
      for (const trans of this.ir.transitions) {
        const isValidated = trans.fromSteps.every(id => this.activeSteps.has(id));
        if (isValidated && ExpressionEvaluator.evaluate(trans.receptivity, context)) {
          validTransitions.push(trans.id);
        }
      }
    }

    const timersObj = {};
    this.timers.forEach((t, k) => { timersObj[k] = { ...t }; });

    const inputsObj = {};
    this.inputs.forEach((v, k) => { inputsObj[k] = v; });

    const remotesObj = {};
    this.remotes.forEach((v, k) => { remotesObj[k] = v; });

    const analogsObj = {};
    this.analogs.forEach((v, k) => { analogsObj[k] = v; });

    const outputsObj = {};
    this.outputs.forEach((v, k) => { outputsObj[k] = v; });

    const memoriesObj = {};
    this.memories.forEach((v, k) => { memoriesObj[k] = v; });

    return {
      activeSteps: Array.from(this.activeSteps),
      validTransitions: validTransitions,
      inputs: inputsObj,
      remotes: remotesObj,
      analogs: analogsObj,
      outputs: outputsObj,
      memories: memoriesObj,
      timers: timersObj,
      cycleCount: this.cycleCount,
      isRunning: this.isRunning
    };
  }

  updateTimers(dtMs) {
    if (!this.ir) return;
    const activeTimerChannels = new Set();

    for (const stepId of this.activeSteps) {
      const stepNode = this.ir.steps.find(s => s.id === stepId);
      if (stepNode && stepNode.actions) {
        for (const action of stepNode.actions) {
          if (action.qualifier === 'T' || action.resourceType === 'T') {
            activeTimerChannels.add(Number(action.channel));
          }
        }
      }
    }

    this.timers.forEach((timer, channel) => {
      const isInputActive = activeTimerChannels.has(channel);
      timer.active = isInputActive;

      switch (timer.funct) {
        case 1: // TON - On-Delay
        default:
          if (isInputActive) {
            if (!timer.done) {
              timer.elapsedMs += dtMs;
              if (timer.elapsedMs >= timer.presetMs) {
                timer.elapsedMs = timer.presetMs;
                timer.done = true;
              }
            }
          } else {
            timer.elapsedMs = 0;
            timer.done = false;
          }
          break;

        case 2: // TOFF - Off-Delay
          if (isInputActive) {
            timer.done = true;
            timer.elapsedMs = 0;
          } else {
            if (timer.done) {
              timer.elapsedMs += dtMs;
              if (timer.elapsedMs >= timer.presetMs) {
                timer.elapsedMs = timer.presetMs;
                timer.done = false;
              }
            } else {
              timer.elapsedMs = 0;
            }
          }
          break;

        case 3: // INTERMITENTE - Oscilador Cíclico
          if (isInputActive) {
            const tOn = timer.presetMs > 0 ? timer.presetMs : 1000;
            const tOff = timer.offsetMs > 0 ? timer.offsetMs : tOn;
            const totalCycle = tOn + tOff;

            timer.elapsedMs = (timer.elapsedMs + dtMs) % totalCycle;
            timer.done = (timer.elapsedMs < tOn);
          } else {
            timer.elapsedMs = 0;
            timer.done = false;
          }
          break;
      }
    });
  }

  executeActions(dtMs) {
    if (!this.ir) return;

    const continuousOutputs = new Set();
    const continuousMemories = new Set();

    for (const stepId of this.activeSteps) {
      const stepNode = this.ir.steps.find(s => s.id === stepId);
      if (!stepNode || !stepNode.actions) continue;

      const isFirstCycleOfStep = !this.previousActiveSteps.has(stepId);

      for (const action of stepNode.actions) {
        const qualifier = action.qualifier || 'X';
        const resource = action.resourceType || 'Q';
        const channel = Number(action.channel) || 1;

        if (resource === 'Q') {
          switch (qualifier) {
            case 'X':
              continuousOutputs.add(channel);
              this.outputs.set(channel, true);
              break;
            case 'S':
              if (isFirstCycleOfStep || !this.outputs.get(channel)) {
                this.outputs.set(channel, true);
              }
              break;
            case 'R':
              if (isFirstCycleOfStep || this.outputs.get(channel)) {
                this.outputs.set(channel, false);
              }
              break;
            case 'Z':
              if (isFirstCycleOfStep) {
                const cur = this.outputs.get(channel) ?? false;
                this.outputs.set(channel, !cur);
              }
              break;
            case 'P':
              if (isFirstCycleOfStep) {
                this.outputs.set(channel, true);
                continuousOutputs.add(channel);
              }
              break;
          }
        } else if (resource === 'M') {
          switch (qualifier) {
            case 'X':
              continuousMemories.add(channel);
              this.memories.set(channel, true);
              break;
            case 'S':
              this.memories.set(channel, true);
              break;
            case 'R':
              this.memories.set(channel, false);
              break;
            case 'Z':
              if (isFirstCycleOfStep) {
                const cur = this.memories.get(channel) ?? false;
                this.memories.set(channel, !cur);
              }
              break;
          }
        }
      }
    }

    this.outputs.forEach((val, channel) => {
      const hasStoredAction = this.hasStoredActionFor('Q', channel);
      if (!hasStoredAction && !continuousOutputs.has(channel)) {
        this.outputs.set(channel, false);
      }
    });

    this.memories.forEach((val, channel) => {
      const hasStoredAction = this.hasStoredActionFor('M', channel);
      if (!hasStoredAction && !continuousMemories.has(channel)) {
        this.memories.set(channel, false);
      }
    });
  }

  hasStoredActionFor(resourceType, channel) {
    if (!this.ir) return false;
    for (const s of this.ir.steps) {
      if (s.actions) {
        for (const a of s.actions) {
          if (a.resourceType === resourceType && Number(a.channel) === channel && 
             (a.qualifier === 'S' || a.qualifier === 'R' || a.qualifier === 'Z')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  buildContext() {
    const timerBools = new Map();
    this.timers.forEach((t, k) => timerBools.set(k, t.done));

    const stepBools = new Map();
    if (this.ir) {
      for (const s of this.ir.steps) {
        stepBools.set(s.id, this.activeSteps.has(s.id));
      }
    }

    return {
      inputs: this.inputs,
      remotes: this.remotes,
      analogs: this.analogs,
      memories: this.memories,
      steps: stepBools,
      timers: timerBools,
      counters: new Map()
    };
  }

  notifyState() {
    if (this.onStateChangeCallbacks.length === 0) return;
    const state = this.getState();
    for (const cb of this.onStateChangeCallbacks) {
      cb(state);
    }
  }
}

// Exportar globalmente para a UI do navegador
if (typeof window !== "undefined") {
  window.GrafcetSimulatorEngine = GrafcetSimulatorEngine;
  window.ExpressionEvaluator = ExpressionEvaluator;
}
