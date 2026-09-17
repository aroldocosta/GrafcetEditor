const canvas = document.getElementById("canvas");
const palette = document.getElementById("palette");
const testBtn = document.getElementById("test-states");
let currentConnection = null;
const connections = [];
const stepsList = [];
let transitionCounter = 0;
let boxCounter = 0;
let clickTimeout = null;

// Modo de Simulação Virtual IEC 60848
let isSimulationActive = false;

// Controle de Zoom do Canvas
let currentZoom = 1.0;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.01;

const STORAGE_KEY = "grafcet_saved_diagram";
let saveTimeout = null;

let _draggedType = null;

// ==========================================================================
// Gerenciamento de Seleção Múltipla
// ==========================================================================
const selectedBoxes = new Set();

function selectBox(box, additive = false) {
  if (!additive) {
    clearSelection();
  }
  selectedBoxes.add(box);
  box.classList.add("selected");
}

function deselectBox(box) {
  selectedBoxes.delete(box);
  box.classList.remove("selected");
}

function toggleBoxSelection(box) {
  if (selectedBoxes.has(box)) {
    deselectBox(box);
  } else {
    selectedBoxes.add(box);
    box.classList.add("selected");
  }
}

function clearSelection() {
  selectedBoxes.forEach(b => b.classList.remove("selected"));
  selectedBoxes.clear();
}

function selectAllBoxes() {
  clearSelection();
  const boxes = canvas.querySelectorAll(".box");
  boxes.forEach(b => {
    selectedBoxes.add(b);
    b.classList.add("selected");
  });
}

palette.querySelectorAll(".box").forEach(box => {
  box.addEventListener("dragstart", e => {
    let type = "active_step";
    if (box.classList.contains("start_step")) type = "start_step";
    else if (box.classList.contains("active_step")) type = "active_step";
    else if (box.classList.contains("or_divergence")) type = "or_divergence";
    else if (box.classList.contains("or_convergence")) type = "or_convergence";
    else if (box.classList.contains("and_divergence")) type = "and_divergence";
    else if (box.classList.contains("and_convergence")) type = "and_convergence";

    _draggedType = type;

    if (e.dataTransfer) {
      e.dataTransfer.setData("type", type);
      e.dataTransfer.setData("text/plain", type);
      e.dataTransfer.effectAllowed = "copy";
    }

    const clone = box.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.top = "-1000px";
    clone.style.left = "-1000px";
    document.body.appendChild(clone);
    if (e.dataTransfer) {
      e.dataTransfer.setDragImage(clone, 50, 30);
    }
    setTimeout(() => document.body.removeChild(clone), 0);
  });

  box.addEventListener("dragend", () => {
    _draggedType = null;
  });
});

function handleCanvasDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  if (isSimulationActive) {
    if (typeof showToast === "function") {
      showToast("Modo Simulação ativo. Pare a simulação para adicionar novos elementos.");
    }
    return;
  }
  let type = e.dataTransfer ? e.dataTransfer.getData("type") : null;
  if (!type) {
    type = _draggedType || "active_step";
  }
  if (!type || typeof type !== "string") return;

  if (type === "start_step" || type === "active_step") {
    const realStepsCount = stepsList.filter(s => s.type === "start_step" || s.type === "active_step").length;
    if (realStepsCount >= 127) {
      alert("Limite de 127 memórias para etapas atingido! A memória M128 é reservada para a inicialização direta do sistema.");
      return;
    }
  }

  const template = palette.querySelector(`.${type}`);
  if (!template) return;

  const rect = canvas.getBoundingClientRect();
  const isBranch = type === "or_divergence" || type === "or_convergence" || type === "and_divergence" || type === "and_convergence";
  const boxWidth = isBranch ? 360 : 100;
  const left = (e.clientX - rect.left) / currentZoom - (boxWidth / 2);
  const top = (e.clientY - rect.top) / currentZoom - 30;

  const clone = template.cloneNode(true);
  clone.style.position = "absolute";
  clone.style.left = left + "px";
  clone.style.top = top + "px";
  clone.draggable = false;

  const state = (type === "start_step") ? "active" : "inactive";
  clone.setAttribute("data-state", state);

  const inner = clone.querySelector(".inner-rect");
  if (inner && state === "active") {
    inner.style.border = "5px double darkblue";
  }

  canvas.appendChild(clone);
  makeDraggable(clone);
  attachConnectorListeners(clone);
  attachHoverListeners(clone);
  attachRemoveListener(clone);
  renumberBoxes();

  const step = new Step(type, clone, state);
  step.id = ++boxCounter;
  step.branchOutputs = {};
  step.branchInputs = {};

  if (type === "or_divergence") {
    step.transitions = [
      new Transition({ id: ++transitionCounter, receptivity: '1', description: 'Ramo 1' }),
      new Transition({ id: ++transitionCounter, receptivity: '1', description: 'Ramo 2' })
    ];
  } else if (type === "and_convergence") {
    step.transitions = [
      new Transition({ id: ++transitionCounter, receptivity: '1', description: 'Transição de Sincronização' })
    ];
  } else if (type === "or_convergence" || type === "and_divergence") {
    step.transitions = [];
  } else {
    createTransitionForStep(step);
  }

  clone.setAttribute("data-id", step.id);
  stepsList.push(step);

  printSteps();
  debouncedSaveDiagram();
  _draggedType = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

canvas.addEventListener("dragover", handleDragOver);
canvas.addEventListener("drop", handleCanvasDrop);

const canvasViewportEl = document.getElementById("canvas-viewport");
if (canvasViewportEl) {
  canvasViewportEl.addEventListener("dragover", handleDragOver);
  canvasViewportEl.addEventListener("drop", handleCanvasDrop);
}

canvas.addEventListener("click", e => {
  const actionBox = e.target.closest(".action-box");
  if (actionBox) {
    e.stopPropagation();
    const tooltip = canvas.querySelector(".action-tooltip");
    if (tooltip) tooltip.remove();

    const stepId = actionBox.getAttribute("data-step-id");
    const targetStep = actionBox._step || stepsList.find(s => s.id == stepId || parseInt(s.id, 10) === parseInt(stepId, 10));
    if (targetStep) {
      showActionsModal(targetStep);
    }
  }
});

function makeDraggable(box) {
  let startX, startY;
  let moved = false;
  const initialPositions = new Map();

  box.addEventListener("mousedown", e => {
    if (e.target.classList.contains("connector")) return;
    if (e.button !== 0) return; // Apenas botão esquerdo para arrastar

    e.stopPropagation();

    // Em modo de simulação, o clique em uma etapa alterna o forçamento manual (IEC 60848)
    if (isSimulationActive) {
      const rawId = box.getAttribute("data-id");
      const stepId = parseInt(rawId, 10);
      const innerText = box.querySelector(".inner-rect")?.textContent?.trim();
      const visualId = innerText ? parseInt(innerText, 10) : NaN;
      if (window.simulationRack && window.simulationRack.engine) {
        const engine = window.simulationRack.engine;
        const targetId = !isNaN(visualId) && engine.ir?.steps?.some(s => s.id === visualId) ? visualId : stepId;
        const isCurrentActive = engine.activeSteps.has(targetId);
        engine.forceStep(targetId, !isCurrentActive);
      }
      return;
    }

    startX = e.clientX;
    startY = e.clientY;
    moved = false;

    // Gerenciamento da seleção no clique do bloco
    if (e.shiftKey) {
      toggleBoxSelection(box);
      if (!selectedBoxes.has(box)) return; // Se removeu da seleção, não arrasta
    } else {
      // Se não estiver no grupo selecionado, seleciona apenas ele
      if (!selectedBoxes.has(box)) {
        selectBox(box);
      }
      // Se já estava selecionado, mantém o grupo ativo para arrastar todos juntos
    }

    // Grava as posições iniciais de TODOS os blocos do grupo selecionado
    initialPositions.clear();
    selectedBoxes.forEach(b => {
      initialPositions.set(b, {
        left: parseFloat(b.style.left) || 0,
        top: parseFloat(b.style.top) || 0
      });
    });

    function move(ev) {
      const dx = (ev.clientX - startX) / currentZoom;
      const dy = (ev.clientY - startY) / currentZoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        moved = true;
      }

      selectedBoxes.forEach(b => {
        const init = initialPositions.get(b);
        if (init) {
          b.style.left = (init.left + dx) + "px";
          b.style.top = (init.top + dy) + "px";
          updateConnections(b);
        }
      });
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);

      // Se foi apenas um clique simples (sem arraste) e havia múltiplos selecionados:
      // se não foi com Shift, foca a seleção exclusivamente neste bloco
      if (!moved && !e.shiftKey && selectedBoxes.size > 1) {
        selectBox(box);
      }

      box.dataset.wasMoved = moved ? "true" : "false";
      if (moved) {
        debouncedSaveDiagram();
      }
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}


function getConnectorElement(box, connectorType, branch) {
  if (!box) return null;
  if (branch !== null && branch !== undefined && branch !== "") {
    const specific = box.querySelector(`.connector.${connectorType}[data-branch="${branch}"]`);
    if (specific) return specific;
  }
  return box.querySelector(`.connector.${connectorType}`);
}

/**
 * Identifica se uma etapa pertence a algum ramal de uma Divergência em "E" ativa.
 * Retorna o ID da divergência e o índice do ramal (0, 1...), ou null se for etapa comum.
 */
function findParallelBranch(stepNodeId) {
  const andDivergences = stepsList.filter(s => s.type === "and_divergence");
  for (const div of andDivergences) {
    if (!div.branchOutputs) continue;
    for (const [branchIdx, rootStepId] of Object.entries(div.branchOutputs)) {
      if (!rootStepId) continue;
      const visited = new Set();
      const queue = [rootStepId];
      while (queue.length > 0) {
        const curr = queue.shift();
        if (visited.has(curr)) continue;
        visited.add(curr);
        if (curr === stepNodeId) {
          return { divId: div.id, branch: String(branchIdx) };
        }
        const currNode = stepsList.find(s => s.id === curr);
        if (currNode && currNode.outputs) {
          for (const nextId of currNode.outputs) {
            const nextNode = stepsList.find(s => s.id === nextId);
            if (nextNode && nextNode.type !== "and_convergence" && !visited.has(nextId)) {
              queue.push(nextId);
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Verifica se um conector específico (por caixa, tipo 'top'/'bottom' e branch) já está ocupado por alguma conexão.
 */
function isSpecificConnectorOccupied(targetBox, connectorType, branchVal) {
  const normBranch = (branchVal !== null && branchVal !== undefined && branchVal !== "") ? String(branchVal) : null;
  return connections.some(c => {
    if (c.from?.box === targetBox && c.from?.connector === connectorType) {
      const cFromBranch = (c.from?.branch !== null && c.from?.branch !== undefined && c.from?.branch !== "") ? String(c.from?.branch) : null;
      if (normBranch === null || cFromBranch === normBranch) return true;
    }
    if (c.to?.box === targetBox && c.to?.connector === connectorType) {
      const cToBranch = (c.to?.branch !== null && c.to?.branch !== undefined && c.to?.branch !== "") ? String(c.to?.branch) : null;
      if (normBranch === null || cToBranch === normBranch) return true;
    }
    return false;
  });
}

function attachConnectorListeners(box) {
  box.querySelectorAll(".connector").forEach(connector => {
    connector.addEventListener("click", e => {
      e.stopPropagation();
      if (isSimulationActive) return;
      const svg = getOrCreateSVG();
      const rect = canvas.getBoundingClientRect();
      const connRect = connector.getBoundingClientRect();
      const x = (connRect.left + connRect.width / 2 - rect.left) / currentZoom;
      const y = (connector.classList.contains("top") ? connRect.top - rect.top : connRect.bottom - rect.top) / currentZoom;
      const connBranch = connector.getAttribute("data-branch");

      if (!currentConnection) {
        // Validação IEC 60848: conectores de ramal e topo/base de divergência/convergência aceitam apenas 1 conexão
        const isRestrictedConnector = connector.hasAttribute("data-branch") || 
          (box.classList.contains("and_divergence") && connector.classList.contains("top")) ||
          (box.classList.contains("or_divergence") && connector.classList.contains("top")) ||
          (box.classList.contains("and_convergence") && connector.classList.contains("bottom")) ||
          (box.classList.contains("or_convergence") && connector.classList.contains("bottom"));

        if (isRestrictedConnector && isSpecificConnectorOccupied(box, connector.classList.contains("top") ? "top" : "bottom", connBranch)) {
          alert("Este conector já possui uma conexão ligada a ele. Pela norma IEC 60848, é permitida apenas 1 linha por conector de ramal.");
          return;
        }

        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("stroke", "lightblue");
        polyline.setAttribute("stroke-width", "2");
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("points", `${x},${y}`);
        svg.appendChild(polyline);

        polyline.addEventListener("mouseenter", () => {
          polyline.classList.add("hover-highlight");
          const conn = connections.find(c => c.polyline === polyline);
          if (conn) {
            conn.from.box.querySelector(".inner-rect")?.classList.add("hover-highlight");
            conn.to?.box?.querySelector(".inner-rect")?.classList.add("hover-highlight");
          }
        });
        polyline.addEventListener("mouseleave", () => {
          polyline.classList.remove("hover-highlight");
          const conn = connections.find(c => c.polyline === polyline);
          if (conn) {
            conn.from.box.querySelector(".inner-rect")?.classList.remove("hover-highlight");
            conn.to?.box?.querySelector(".inner-rect")?.classList.remove("hover-highlight");
          }
        });
        polyline.addEventListener("dblclick", e => {
          e.stopPropagation();
          svg.removeChild(polyline);
          const index = connections.findIndex(c => c.polyline === polyline);
          if (index !== -1) {
            const connRemoved = connections[index];
            removeStepConnection(connRemoved);
            connections.splice(index, 1);
            printSteps();
            debouncedSaveDiagram();
          }
        });

        currentConnection = {
          polyline,
          from: {
            box,
            connector: connector.classList.contains("top") ? "top" : "bottom",
            branch: connBranch
          },
          mouseMoveHandler: ev => {
            const mx = (ev.clientX - rect.left) / currentZoom;
            const my = (ev.clientY - rect.top) / currentZoom;
            currentConnection.polyline.setAttribute("points", `${x},${y} ${mx},${my}`);
          }
        };

        document.addEventListener("mousemove", currentConnection.mouseMoveHandler);
      } else {
        if (currentConnection.mouseMoveHandler) {
          document.removeEventListener("mousemove", currentConnection.mouseMoveHandler);
        }

        const toConnectorType = connector.classList.contains("top") ? "top" : "bottom";
        const fromConnectorType = currentConnection.from.connector;
        const fromBox = currentConnection.from.box;
        const toBox = box;

        // Impedir auto-conexão no mesmo conector do mesmo bloco
        if (fromBox === toBox && fromConnectorType === toConnectorType && currentConnection.from.branch === connBranch) {
          svg.removeChild(currentConnection.polyline);
          currentConnection = null;
          return;
        }

        // Validação IEC 60848: Aridade 1:1 para conectores de ramal e topo/base de divergência/convergência
        const isDestRestricted = connector.hasAttribute("data-branch") || 
          (toBox.classList.contains("and_divergence") && toConnectorType === "top") ||
          (toBox.classList.contains("or_divergence") && toConnectorType === "top") ||
          (toBox.classList.contains("and_convergence") && toConnectorType === "bottom") ||
          (toBox.classList.contains("or_convergence") && toConnectorType === "bottom");

        if (isDestRestricted && isSpecificConnectorOccupied(toBox, toConnectorType, connBranch)) {
          svg.removeChild(currentConnection.polyline);
          currentConnection = null;
          alert("Este conector de destino já possui uma conexão conectada (aridade 1:1 segundo a norma IEC 60848).");
          return;
        }

        const fromId = parseInt(fromBox.getAttribute("data-id"));
        const toId = parseInt(toBox.getAttribute("data-id"));

        // Validação de Divergência em "E": Impedir que a mesma etapa seja alimentada por múltiplos ramais da mesma divergência
        if (fromBox.classList.contains("and_divergence") && fromConnectorType === "bottom") {
          const alreadyFedByThisDiv = connections.some(c => 
            (c.from?.box === fromBox && c.to?.box === toBox) ||
            (c.to?.box === fromBox && c.from?.box === toBox)
          );
          if (alreadyFedByThisDiv) {
            svg.removeChild(currentConnection.polyline);
            currentConnection = null;
            alert("Conexão inválida (IEC 60848): A mesma etapa não pode ser ativada por múltiplos ramais da mesma divergência em 'E'.");
            return;
          }
        }

        // Validação de Convergência em "E": Impedir cruzamento de ramal e conexões duplicadas da mesma etapa
        if (toBox.classList.contains("and_convergence") && toConnectorType === "top") {
          const alreadyConnectedToThisConv = connections.some(c => 
            (c.from?.box === fromBox && c.to?.box === toBox) ||
            (c.to?.box === fromBox && c.from?.box === toBox)
          );
          if (alreadyConnectedToThisConv) {
            svg.removeChild(currentConnection.polyline);
            currentConnection = null;
            alert("Conexão inválida (IEC 60848): A mesma etapa não pode ser conectada mais de uma vez na mesma barra de convergência.");
            return;
          }

          const branchFrom = findParallelBranch(fromId);
          if (branchFrom && branchFrom.branch !== null) {
            const destBranch = (connBranch !== null && connBranch !== undefined && connBranch !== "") ? String(connBranch) : "0";
            if (String(branchFrom.branch) !== destBranch) {
              svg.removeChild(currentConnection.polyline);
              currentConnection = null;
              alert(`Conexão inválida (IEC 60848 item 3.1): Cruzamento proibido! A Etapa pertence ao Ramal ${parseInt(branchFrom.branch) + 1} e deve ser conectada ao pino do Ramal ${parseInt(branchFrom.branch) + 1} da Convergência em "E", e não ao Ramal ${parseInt(destBranch) + 1}.`);
              return;
            }
          }
        }

        // Validação IEC 60848 item 3.1: Proibir cruzamentos parciais entre ramais paralelos independentes
        if (!isNaN(fromId) && !isNaN(toId)) {
          const fromNode = stepsList.find(s => s.id === fromId);
          const toNode = stepsList.find(s => s.id === toId);
          if (fromNode && toNode && toNode.type !== "and_convergence") {
            const branchFrom = findParallelBranch(fromId);
            const branchTo = findParallelBranch(toId);
            if (branchFrom && branchTo && branchFrom.divId === branchTo.divId && branchFrom.branch !== branchTo.branch) {
              svg.removeChild(currentConnection.polyline);
              currentConnection = null;
              alert(`Conexão inválida (IEC 60848 item 3.1): Cruzamento parcial proibido! Não é permitido saltar do Ramal ${parseInt(branchFrom.branch) + 1} para o Ramal ${parseInt(branchTo.branch) + 1} antes de fechar a estrutura na Convergência em "E".`);
              return;
            }
          }
        }

        const fromConn = getConnectorElement(currentConnection.from.box, currentConnection.from.connector, currentConnection.from.branch);
        const fromRect = fromConn ? fromConn.getBoundingClientRect() : null;
        const fromX = fromRect ? (fromRect.left + fromRect.width / 2 - rect.left) / currentZoom : x;
        const fromY = fromRect ? (currentConnection.from.connector === "bottom"
          ? fromRect.bottom - rect.top
          : fromRect.top - rect.top) / currentZoom : y;

        const toX = x;
        const toY = y;
        const points = calculatePolylinePoints(fromX, fromY, toX, toY, currentConnection.from.connector, connector.classList.contains("top") ? "top" : "bottom");

        currentConnection.polyline.setAttribute("points", points);

        const newConn = {
          ...currentConnection,
          to: {
            box,
            connector: connector.classList.contains("top") ? "top" : "bottom",
            branch: connBranch
          }
        };
        connections.push(newConn);

        addStepConnection(currentConnection.from.box, box, currentConnection.from.branch, connBranch);

        currentConnection = null;

        printSteps();
        debouncedSaveDiagram();
      }
    });
  });
}

function attachHoverListeners(box) {
  const isOrDiv = box.classList.contains("or_divergence");
  const isOrConv = box.classList.contains("or_convergence");
  const isAndDiv = box.classList.contains("and_divergence");
  const isAndConv = box.classList.contains("and_convergence");

  if (isOrDiv || isAndConv) {
    const branchTransitions = box.querySelectorAll(".branch-transition");
    branchTransitions.forEach(bt => {
      const branchIdx = parseInt(bt.getAttribute("data-branch") || "0", 10);

      let receptivityLabel = bt.querySelector(".receptivity-label");
      if (!receptivityLabel) {
        receptivityLabel = document.createElement("span");
        receptivityLabel.className = "receptivity-label";
        receptivityLabel.textContent = "";
        receptivityLabel.style.position = "absolute";
        receptivityLabel.style.left = "32px";
        receptivityLabel.style.top = "50%";
        receptivityLabel.style.transform = "translateY(-50%)";
        receptivityLabel.style.fontSize = "13px";
        receptivityLabel.style.color = "#1e293b";
        receptivityLabel.style.fontWeight = "bold";
        receptivityLabel.style.pointerEvents = "none";
        receptivityLabel.style.whiteSpace = "nowrap";
        bt.appendChild(receptivityLabel);
      }

      bt.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isSimulationActive) return;
        if (shouldIgnoreClickDueToMove(box)) return;
        const stepId = parseInt(box.getAttribute("data-id"));
        const step = stepsList.find(s => s.id === stepId);
        if (!step || !step.transitions || !step.transitions[branchIdx]) return;
        showReceptivityModal(step.transitions[branchIdx], bt);
      });
    });
    return;
  }

  if (isOrConv || isAndDiv) {
    return;
  }

  const inner = box.querySelector(".inner-rect");
  if (inner) {
    box.addEventListener("mouseenter", () => {
      inner.classList.add("hover-highlight");
    });
    box.addEventListener("mouseleave", () => {
      inner.classList.remove("hover-highlight");
    });

    inner.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isSimulationActive) {
        const rawId = box.getAttribute("data-id");
        const stepId = parseInt(rawId, 10);
        const innerText = inner.textContent?.trim();
        const visualId = innerText ? parseInt(innerText, 10) : NaN;
        if (window.simulationRack && window.simulationRack.engine) {
          const engine = window.simulationRack.engine;
          const targetId = !isNaN(visualId) && engine.ir?.steps?.some(s => s.id === visualId) ? visualId : stepId;
          const isCurrentActive = engine.activeSteps.has(targetId);
          engine.forceStep(targetId, !isCurrentActive);
        }
        return;
      }
      if (shouldIgnoreClickDueToMove(box)) return;

      clickTimeout = setTimeout(() => {
        if (isSimulationActive) return;
        const stepId = parseInt(box.getAttribute("data-id"));
        const step = stepsList.find(s => s.id === stepId);
        if (step) {
          showActionsModal(step);
        }
      }, 320);
    });
  }

  const transitionBar = box.querySelector(".transition");
  if (transitionBar) {
    transitionBar.addEventListener("mouseenter", () => {
      transitionBar.classList.add("hover-highlight");
    });
    transitionBar.addEventListener("mouseleave", () => {
      transitionBar.classList.remove("hover-highlight");
    });

    transitionBar.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isSimulationActive) return;
      if (shouldIgnoreClickDueToMove(box)) return;

      const stepId = parseInt(box.getAttribute("data-id"));
      const step = stepsList.find(s => s.id === stepId);
      if (!step || !step.transitions || step.transitions.length === 0) {
        console.warn("Nenhuma transição encontrada para este step.");
        return;
      }
      const transition = step.transitions[0];
      showReceptivityModal(transition, transitionBar);
    });

    let receptivityLabel = transitionBar.querySelector(".receptivity-label");
    if (!receptivityLabel) {
      receptivityLabel = document.createElement("span");
      receptivityLabel.className = "receptivity-label";
      receptivityLabel.textContent = "";
      receptivityLabel.style.position = "absolute";
      receptivityLabel.style.left = "32px";
      receptivityLabel.style.top = "50%";
      receptivityLabel.style.transform = "translateY(-50%)";
      receptivityLabel.style.fontSize = "14px";
      receptivityLabel.style.color = "#333";
      receptivityLabel.style.fontWeight = "bold";
      receptivityLabel.style.pointerEvents = "none";
      transitionBar.appendChild(receptivityLabel);
    }
  }
}

function attachRemoveListener(box) {
  box.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (isSimulationActive) return;

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }

    const svg = getOrCreateSVG();
    for (let i = connections.length - 1; i >= 0; i--) {
      const c = connections[i];
      if (c.from.box === box || c.to.box === box) {
        svg.removeChild(c.polyline);
        removeStepConnection(c);
        connections.splice(i, 1);
        printSteps();
      }
    }
    selectedBoxes.delete(box);
    canvas.removeChild(box);

    const stepIndex = stepsList.findIndex(s => s.element === box);
    if (stepIndex !== -1) {
      stepsList.splice(stepIndex, 1);
    }

    renumberBoxes();
    printSteps();
    debouncedSaveDiagram();
  });
}

function renumberBoxes() {
  const boxes = [...canvas.querySelectorAll(".box:not(.or_divergence):not(.or_convergence):not(.and_divergence):not(.and_convergence)")];
  boxes.forEach((box, index) => {
    const inner = box.querySelector(".inner-rect");
    if (inner) inner.textContent = index + 1;
  });
}

function getOrCreateSVG() {
  let svg = canvas.querySelector("svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    canvas.appendChild(svg);
  }
  return svg;
}

function calculatePolylinePoints(fromX, fromY, toX, toY, fromConnector, toConnector) {
  if (fromConnector === "bottom" && toConnector === "top" && toY < fromY) {
    const canvasRect = canvas.getBoundingClientRect();
    let minLeft = Math.min(fromX, toX);

    const boxes = canvas.querySelectorAll(".box");
    boxes.forEach(b => {
      const bRect = b.getBoundingClientRect();
      const bLeft = (bRect.left - canvasRect.left) / currentZoom;
      const bTop = (bRect.top - canvasRect.top) / currentZoom;
      const bBottom = (bRect.bottom - canvasRect.top) / currentZoom;

      if (bBottom >= toY - 40 && bTop <= fromY + 40) {
        if (bLeft < minLeft) {
          minLeft = bLeft;
        }
      }
    });

    const offsetX = Math.min(minLeft - 40, Math.min(fromX, toX) - 50);
    const y1 = fromY + 15;
    const y2 = toY - 15;

    return [
      `${fromX},${fromY}`,
      `${fromX},${y1}`,
      `${offsetX},${y1}`,
      `${offsetX},${y2}`,
      `${toX},${y2}`,
      `${toX},${toY}`
    ].join(" ");
  }

  return `${fromX},${fromY} ${toX},${toY}`;
}

function updateConnections(box) {
  const rect = canvas.getBoundingClientRect();
  connections.forEach(conn => {
    if (conn.from.box === box || conn.to.box === box) {
      const fromConn = getConnectorElement(conn.from.box, conn.from.connector, conn.from.branch);
      const toConn = getConnectorElement(conn.to.box, conn.to.connector, conn.to.branch);
      if (!fromConn || !toConn) return;

      const fromRect = fromConn.getBoundingClientRect();
      const toRect = toConn.getBoundingClientRect();

      const fromX = (fromRect.left + fromRect.width / 2 - rect.left) / currentZoom;
      const fromY = (conn.from.connector === "top"
        ? fromRect.top - rect.top
        : fromRect.bottom - rect.top) / currentZoom;

      const toX = (toRect.left + toRect.width / 2 - rect.left) / currentZoom;
      const toY = (conn.to.connector === "top"
        ? toRect.top - rect.top
        : toRect.bottom - rect.top) / currentZoom;

      const points = calculatePolylinePoints(fromX, fromY, toX, toY, conn.from.connector, conn.to.connector);

      conn.polyline.setAttribute("points", points);
    }
  });
}

function addStepConnection(fromBox, toBox, fromBranch, toBranch) {
  const fromId = parseInt(fromBox.getAttribute("data-id"));
  const toId = parseInt(toBox.getAttribute("data-id"));
  if (isNaN(fromId) || isNaN(toId)) return;

  const fromStep = stepsList.find(s => s.id === fromId);
  const toStep = stepsList.find(s => s.id === toId);
  if (!fromStep || !toStep) return;

  if (!fromStep.outputs.includes(toStep.id)) {
    fromStep.outputs.push(toStep.id);
  }
  if (!toStep.inputs.includes(fromStep.id)) {
    toStep.inputs.push(fromStep.id);
  }

  // Mapear saídas por ramo na divergência OR ou AND
  if (fromStep.type === "or_divergence" || fromStep.type === "and_divergence") {
    fromStep.branchOutputs = fromStep.branchOutputs || {};
    const b = (fromBranch !== null && fromBranch !== undefined && fromBranch !== "") ? String(fromBranch) : "0";
    fromStep.branchOutputs[b] = toStep.id;
  }

  // Mapear entradas por ramo na convergência OR ou AND
  if (toStep.type === "or_convergence" || toStep.type === "and_convergence") {
    toStep.branchInputs = toStep.branchInputs || {};
    const b = (toBranch !== null && toBranch !== undefined && toBranch !== "") ? String(toBranch) : "0";
    toStep.branchInputs[b] = fromStep.id;
  }

  // Ocultar transição do step se conectado à divergência OR ou convergência AND
  if ((fromStep.type === "start_step" || fromStep.type === "active_step") && 
      (toStep.type === "or_divergence" || toStep.type === "and_convergence")) {
    fromBox.classList.add("connected-to-branch");
  }
}

function removeStepConnection(connection) {
  const fromBox = connection.from?.box;
  const toBox = connection.to?.box;
  if (!fromBox || !toBox) return;

  const fromId = parseInt(fromBox.getAttribute("data-id"));
  const toId = parseInt(toBox.getAttribute("data-id"));
  if (isNaN(fromId) || isNaN(toId)) return;

  const fromStep = stepsList.find(s => s.id === fromId);
  const toStep = stepsList.find(s => s.id === toId);
  if (!fromStep || !toStep) return;

  fromStep.outputs = fromStep.outputs.filter(id => id !== toId);
  toStep.inputs = toStep.inputs.filter(id => id !== fromId);

  if ((fromStep.type === "or_divergence" || fromStep.type === "and_divergence") && fromStep.branchOutputs) {
    for (const [k, v] of Object.entries(fromStep.branchOutputs)) {
      if (v === toStep.id) delete fromStep.branchOutputs[k];
    }
  }

  if ((toStep.type === "or_convergence" || toStep.type === "and_convergence") && toStep.branchInputs) {
    for (const [k, v] of Object.entries(toStep.branchInputs)) {
      if (v === fromStep.id) delete toStep.branchInputs[k];
    }
  }

  // Restaurar visual da transição se o step não estiver mais conectado a nenhuma divergência OR nem convergência AND
  if (fromStep.type === "start_step" || fromStep.type === "active_step") {
    const stillConnectedToBranch = connections.some(c =>
      c !== connection && c.from?.box === fromBox && (
        c.to?.box?.classList.contains("or_divergence") ||
        c.to?.box?.classList.contains("and_convergence")
      )
    );
    if (!stillConnectedToBranch) {
      fromBox.classList.remove("connected-to-branch");
    }
  }
}

function updateStepsView() {
  // Antes de atualizar, limpa todos os elementos de ação existentes
  const oldActionBoxes = canvas.querySelectorAll(".action-box, .action-line, .action-tooltip");
  oldActionBoxes.forEach(el => el.remove());

  stepsList.forEach(step => {
    if (!step || !step.element) return;
    const inner = step.element.querySelector(".inner-rect");
    if (inner) {
      if (step.state === "active") {
        inner.style.border = step.type === "start_step"
          ? "5px double darkblue"
          : "3px solid darkblue";
      } else {
        inner.style.border = "";
      }
    }

    // Renderizar Actions ao lado direito do Step
    if (step.actions && step.actions.length > 0 && inner) {
      const rect = step.element.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const baseLeft = parseFloat(step.element.style.left) + 110; // desloca para direita
      const baseTop = parseFloat(step.element.style.top) + 20; // alinhamento vertical

      const actionWidth = 55; // 56px de largura com 1px de sobreposição de borda

      step.actions.forEach((action, idx) => {
        if (idx === 0) { // Primeira ação (conecta a linha ao Step)
          const innerRect = step.element.querySelector(".inner-rect");
          const stepLeft = parseFloat(step.element.style.left);
          const innerRightX = stepLeft + innerRect.offsetLeft + innerRect.offsetWidth;
          const actionBoxLeft = baseLeft - 10; // X onde a caixa da ação começa
          const lineWidth = Math.max(0, actionBoxLeft - innerRightX);

          const line = document.createElement("div");
          line.className = "action-line";
          line.style.left = innerRightX + "px";
          line.style.width = lineWidth + "px";
          line.style.top = (baseTop + 20) + "px";
          canvas.appendChild(line);
        }

        // Caixa da ação (colada no quadro anterior)
        const box = document.createElement("div");
        box.className = "action-box";
        box.style.left = (baseLeft - 10 + idx * actionWidth) + "px";
        box.style.top = (baseTop - 8) + "px";
        box.style.fontSize = "1.1em";
        box.style.textAlign = "center";
        box.style.fontStyle = "italic";
        box.style.fontWeight = "bold";
        box.style.overflowWrap = "anywhere";

        // Formatar rótulo da bobina (ex: XQ1, SM5)
        const q = action.qualifier || 'X';
        const r = action.resourceType || (action.target ? action.target.replace(/\d+/g, '') : 'Q');
        const c = action.channel || (action.target ? action.target.replace(/\D+/g, '') : 1);
        const coilLabel = action.target ? `${q}${action.target}` : `${q}${r}${c}`;

        const commandsText = (action.commands && Array.isArray(action.commands) && action.commands.length > 0)
          ? action.commands.join(", ")
          : coilLabel;

        box.textContent = commandsText;
        box.setAttribute("data-step-id", step.id);
        box._step = step;
        box.style.cursor = "pointer";
        box.style.zIndex = "10";
        box.style.pointerEvents = "auto";

        box.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });

        // Clique em qualquer quadro de ação abre o modal de edição de ações do Step
        box.addEventListener("click", (e) => {
          e.stopPropagation();
          const tooltip = canvas.querySelector(".action-tooltip");
          if (tooltip) tooltip.remove();
          showActionsModal(step);
        });

        // Tooltip ao passar o mouse
        box.addEventListener("mouseenter", (e) => {
          const tooltip = document.createElement("div");
          tooltip.className = "action-tooltip";
          tooltip.innerHTML = `
            <strong>Bobina:</strong> ${coilLabel}<br>
            <strong>Qualificador:</strong> ${q}<br>
            <strong>Tipo:</strong> ${r}<br>
            <strong>Canal:</strong> ${c}<br>
            <strong>Descrição:</strong> ${action.description || "-"}
          `;
          tooltip.style.left = (parseFloat(box.style.left) + 65) + "px";
          tooltip.style.top = (parseFloat(box.style.top) - 5) + "px";
          canvas.appendChild(tooltip);
        });

        box.addEventListener("mouseleave", () => {
          const tooltip = canvas.querySelector(".action-tooltip");
          if (tooltip) tooltip.remove();
        });

        canvas.appendChild(box);
      });
    }

    // Atualizar transições
    step.transitions.forEach(t => {
      if (step.state === "active" && t.triggered) {
        t.triggered = false;
        step.state = "inactive";
        step.outputs.forEach(stepId => {
          stepsList[stepId - 1].state = "active";
        });
      }
    });
  });
}

function validateReceptivityJS(expr) {
  if (!expr || expr.trim() === '') return { isValid: true, normalized: '1', errors: [] };

  const normalized = expr
    .replace(/\s+/g, '')
    .replace(/AND/gi, '*')
    .replace(/&&/g, '*')
    .replace(/OR/gi, '+')
    .replace(/\|\|/g, '+')
    .replace(/NOT/gi, '!')
    .replace(/~/g, '!');

  const hwPattern = /^(I[1-8]|E[1-8]|Q[1-8]|R[1-8]|M([1-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8])|X([1-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8])|T([1-9]|1[0-6])|C[1-8]|A[1-8]|1|0)$/i;

  const rawTokens = normalized.match(/([a-zA-Z]+\d+|\d+|[+*!()])/g) || [];
  const fullReconstructed = rawTokens.join('');
  const errors = [];

  if (fullReconstructed !== normalized) {
    errors.push('Símbolo inválido detectado na expressão.');
  }

  for (const tok of rawTokens) {
    if (!/^[+*!()]$/.test(tok)) {
      if (!hwPattern.test(tok)) {
        errors.push(`Identificador '${tok}' fora dos limites de hardware (I1-I8, Q1-Q8, R1-R8, M1-M128, T1-T16, C1-C8, A1-A8, 1, 0).`);
      }
    }
  }

  let parenDepth = 0;
  for (const tok of rawTokens) {
    if (tok === '(') parenDepth++;
    if (tok === ')') parenDepth--;
    if (parenDepth < 0) { errors.push("Parêntese ')' sem abertura '(' correspondente."); break; }
  }
  if (parenDepth > 0) errors.push(`Há ${parenDepth} parêntese(s) '(' não fechados.`);

  for (let i = 0; i < rawTokens.length - 1; i++) {
    if (/^[+*]$/.test(rawTokens[i]) && /^[+*]$/.test(rawTokens[i + 1])) {
      errors.push(`Operadores duplos consecutivos: '${rawTokens[i]}${rawTokens[i + 1]}'.`);
    }
  }

  return {
    isValid: errors.length === 0,
    normalized: normalized,
    errors: errors
  };
}

function showReceptivityModal(transition, transitionBar) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.minWidth = "640px";
  modal.style.maxWidth = "680px";

  // Função helper para criar o grupo de 4 chips + dropdown "Outros..."
  const makeResourceGroup = (title, prefix, maxQty) => {
    const visibleChips = [1, 2, 3, 4]
      .filter(n => n <= maxQty)
      .map(n => `<button type="button" class="chip-btn" data-val="${prefix}${n}">${prefix}${n}</button>`)
      .join('');

    let selectHTML = '';
    if (maxQty > 4) {
      const options = [];
      for (let i = 5; i <= maxQty; i++) {
        options.push(`<option value="${prefix}${i}">${prefix}${i}</option>`);
      }
      selectHTML = `
        <select class="chip-select" data-prefix="${prefix}">
          <option value="" selected disabled>(${prefix}5..${prefix}${maxQty})</option>
          ${options.join('')}
        </select>
      `;
    }

    return `
      <div class="chip-group-box">
        <div class="chip-group-label">${title}</div>
        <div class="chip-row">
          ${visibleChips}
          ${selectHTML}
        </div>
      </div>
    `;
  };

  const opChipsHTML = `
    <div class="chip-group-box">
      <div class="chip-group-label">Operadores & Constantes</div>
      <div class="chip-row">
        ${['*', '+', '!', '(', ')', '1', '0'].map(op => `<button type="button" class="chip-btn op-chip" data-val="${op}">${op}</button>`).join('')}
      </div>
    </div>
  `;

  const iGroupHTML = makeResourceGroup("Entradas Digitais (I)", "I", 8);
  const qGroupHTML = makeResourceGroup("Relés / Saídas (Q)", "Q", 8);
  const rGroupHTML = makeResourceGroup("Remotas (R)", "R", 8);
  const tGroupHTML = makeResourceGroup("Temporizadores (T)", "T", 16);
  const cGroupHTML = makeResourceGroup("Contadores (C)", "C", 8);
  const mGroupHTML = makeResourceGroup("Memórias (M)", "M", 64);
  const aGroupHTML = makeResourceGroup("Comparadores (A)", "A", 8);

  modal.innerHTML = `
    <h2 style="font-size:1.1rem; margin-bottom:10px;">Editar Receptividade da Transição ${transition.id || ''}</h2>
    <input type="text" id="receptivity-input" placeholder="Ex: I1 * T1 + !Q2" value="${transition.receptivity || ''}" style="font-family:monospace; font-weight:bold; font-size:1rem; height:38px; box-sizing:border-box;">
    
    <div id="receptivity-feedback" style="margin-top:6px; margin-bottom:10px; font-size:0.85rem; padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1; background:#f8fafc;">
      Digite a expressão booleana ou clique nos botões abaixo
    </div>

    <div style="font-size:0.8rem; font-weight:bold; color:#475569; margin-bottom:4px;">Atalhos Rápidos de Hardware e Operadores:</div>
    <div class="chip-grid">
      ${opChipsHTML}
      ${iGroupHTML}
      ${qGroupHTML}
      ${rGroupHTML}
      ${tGroupHTML}
      ${cGroupHTML}
      ${mGroupHTML}
      ${aGroupHTML}
    </div>

    <div style="text-align:right;">
      <button id="save-receptivity" style="background:#2563eb; color:#fff; padding:6px 16px; border:none; border-radius:4px; cursor:pointer;">Salvar Receptividade</button>
      <button id="cancel-receptivity" style="padding:6px 14px;">Cancelar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input = modal.querySelector("#receptivity-input");
  const feedback = modal.querySelector("#receptivity-feedback");
  const saveBtn = modal.querySelector("#save-receptivity");

  function insertAtCursor(textToInsert) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value;

    const needSpaceBefore = /^[+*]$/.test(textToInsert) && start > 0 && val[start - 1] !== ' ';
    const needSpaceAfter = /^[+*]$/.test(textToInsert);

    const formattedInsert = (needSpaceBefore ? ' ' : '') + textToInsert + (needSpaceAfter ? ' ' : '');
    input.value = val.substring(0, start) + formattedInsert + val.substring(end);

    const newPos = start + formattedInsert.length;
    input.setSelectionRange(newPos, newPos);
    input.focus();
    validateAndRenderFeedback();
  }

  function validateAndRenderFeedback() {
    const val = input.value;
    const res = validateReceptivityJS(val);

    if (res.isValid) {
      feedback.style.background = "#dcfce7";
      feedback.style.color = "#15803d";
      feedback.style.border = "1px solid #86efac";
      feedback.innerHTML = `✓ <strong>Sintaxe Válida:</strong> <code style="font-family:monospace; font-weight:bold;">${res.normalized || '1'}</code>`;
      saveBtn.disabled = false;
      saveBtn.style.opacity = "1";
      saveBtn.style.cursor = "pointer";
    } else {
      feedback.style.background = "#fee2e2";
      feedback.style.color = "#b91c1c";
      feedback.style.border = "1px solid #fca5a5";
      feedback.innerHTML = `⚠️ <strong>Erro:</strong> ${res.errors[0]}`;
      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.5";
      saveBtn.style.cursor = "not-allowed";
    }
  }

  input.addEventListener("input", validateAndRenderFeedback);
  validateAndRenderFeedback();

  // Escutador de clique nos chips de botão
  modal.querySelectorAll(".chip-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      insertAtCursor(btn.getAttribute("data-val"));
    });
  });

  // Escutador de alteração nos selects dropdowns ("Mais...")
  modal.querySelectorAll(".chip-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const selectedVal = sel.value;
      if (selectedVal) {
        insertAtCursor(selectedVal);
        sel.selectedIndex = 0; // Resetar dropdown para o cabeçalho "Mais..."
      }
    });
  });

  saveBtn.addEventListener("click", () => {
    const res = validateReceptivityJS(input.value);
    if (!res.isValid) return;

    const value = res.normalized || '1';
    transition.setReceptivity(value);

    const label = transitionBar.querySelector(".receptivity-label");
    if (label) {
      label.textContent = value;
    }

    document.body.removeChild(overlay);
    console.log(`Receptividade da transição ${transition.id} salva: "${value}"`);
    debouncedSaveDiagram();
  });

  modal.querySelector("#cancel-receptivity").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
}

function showActionsModal(step) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.minWidth = "520px";

  const stepNumber = step.element ? (step.element.querySelector(".inner-rect")?.textContent || step.id) : step.id;

  modal.innerHTML = `
    <h2>Ações da Etapa ${stepNumber}</h2>
    <p style="font-size:0.85rem; color:#666; margin-bottom:10px;">
      Sintaxe da Bobina: <code>{Qualificador}{Tipo}{Canal}</code> (Exemplo: <b>XQ3</b>, <b>SM5</b>, <b>ZQ2</b>)
    </p>
    <div id="actions-container"></div>
    <button id="add-action" style="margin-top:5px;">+ Adicionar Ação</button>
    <div style="margin-top:15px; text-align:right;">
      <button id="save-actions" style="background:#2563eb; color:#fff; padding:6px 14px; border:none; border-radius:4px; cursor:pointer;">Salvar Todas</button>
      <button id="cancel-actions" style="margin-left:5px; padding:6px 14px;">Cancelar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const actionsContainer = modal.querySelector("#actions-container");

  function createActionFields(action = {}) {
    const div = document.createElement("div");
    div.className = "action-fields";
    div.style.border = "1px solid #e2e8f0";
    div.style.borderRadius = "6px";
    div.style.padding = "8px 10px";
    div.style.marginBottom = "8px";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.background = "#f8fafc";

    const qualifier = action.qualifier || (action.type === 'S' ? 'S' : action.type === 'R' ? 'R' : action.type === 'Z' ? 'Z' : action.type === 'T' ? 'T' : 'X');
    let resourceType = action.resourceType || 'Q';
    let channel = Number(action.channel) || 1;

    // Compatibilidade com dados legados (ex: "Q1", "M5")
    if (action.target && !action.resourceType) {
      const match = action.target.match(/^([a-zA-Z]+)(\d+)$/);
      if (match) {
        resourceType = match[1].toUpperCase();
        channel = parseInt(match[2], 10);
      }
    }

    const channelOptions = [1, 2, 3, 4, 5, 6, 7, 8]
      .map(n => `<option value="${n}" ${channel === n ? 'selected' : ''}>${n}</option>`)
      .join('');

    div.innerHTML = `
      <!-- 1. Qualificador: Normal(X), Set(S), Reset(R), Toggle(Z), Timed(T) -->
      <select class="action-qualifier" title="Qualificador" style="height: 32px; margin: 0; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.88rem; background: #fff; vertical-align: middle;">
        <option value="X" ${qualifier === 'X' || qualifier === 'N' ? 'selected' : ''}>Normal(X)</option>
        <option value="S" ${qualifier === 'S' ? 'selected' : ''}>Set(S)</option>
        <option value="R" ${qualifier === 'R' ? 'selected' : ''}>Reset(R)</option>
        <option value="Z" ${qualifier === 'Z' ? 'selected' : ''}>Toggle(Z)</option>
        <option value="T" ${qualifier === 'T' ? 'selected' : ''}>Timed(T)</option>
      </select>

      <!-- 2. Tipo: Relé(Q), Memoria(M), Timer(T), Contador(C), Comparador(A) -->
      <select class="action-resource" title="Tipo" style="height: 32px; margin: 0; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.88rem; background: #fff; vertical-align: middle;">
        <option value="Q" ${resourceType === 'Q' ? 'selected' : ''}>Relé(Q)</option>
        <option value="M" ${resourceType === 'M' ? 'selected' : ''}>Memoria(M)</option>
        <option value="T" ${resourceType === 'T' ? 'selected' : ''}>Timer(T)</option>
        <option value="C" ${resourceType === 'C' ? 'selected' : ''}>Contador(C)</option>
        <option value="A" ${resourceType === 'A' ? 'selected' : ''}>Comparador(A)</option>
      </select>

      <!-- 3. Canal (1 a 8 com largura 25% maior: 65px) -->
      <select class="action-channel" title="Canal" style="height: 32px; width: 65px; min-width: 65px; margin: 0; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.88rem; background: #fff; vertical-align: middle;">
        ${channelOptions}
      </select>

      <!-- 4. Preview Badge (Fundo cinza claro, mesma altura 32px) -->
      <span class="action-preview" style="display: inline-flex; align-items: center; justify-content: center; height: 32px; margin: 0; padding: 0 10px; background: #e2e8f0; color: #334155; border: 1px solid #cbd5e1; border-radius: 4px; font-family: monospace; font-weight: bold; font-size: 0.9rem; min-width: 55px; box-sizing: border-box; vertical-align: middle;">
        ${qualifier}${resourceType}${channel}
      </span>

      <!-- 5. Descrição (Totalmente Alinhada, sem margem inferior, mesma altura 32px) -->
      <input type="text" class="action-description" placeholder="Descrição da Ação" value="${action.description || ''}" style="height: 32px; flex: 1; margin: 0 !important; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.88rem; background: #fff; vertical-align: middle;">

      <!-- 6. Botão de Parâmetros de Recursos T, C, A -->
      <button class="btn-config-param" title="Configurar Parâmetros (fun, pst, ofs)" style="height: 32px; width: 32px; min-width: 32px; margin: 0; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; display: ${['T', 'C', 'A'].includes(resourceType) ? 'inline-flex' : 'none'}; align-items: center; justify-content: center; vertical-align: middle;">⚙️</button>

      <button class="remove-action" style="height: 32px; width: 32px; min-width: 32px; margin: 0; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;">X</button>
    `;

    // Dados mutáveis da ação para guardar parâmetros de T, C, A
    const actionData = {
      functionType: action.functionType,
      preset: action.preset,
      offset: action.offset,
      port: action.port
    };

    // Atualizar preview e visibilidade do botão ⚙️ ao alterar os selects
    const qSelect = div.querySelector(".action-qualifier");
    const rSelect = div.querySelector(".action-resource");
    const cSelect = div.querySelector(".action-channel");
    const preview = div.querySelector(".action-preview");
    const btnParam = div.querySelector(".btn-config-param");

    function updatePreview() {
      const q = qSelect.value;
      const r = rSelect.value;
      const c = cSelect.value || 1;
      preview.textContent = `${q}${r}${c}`;

      if (['T', 'C', 'A'].includes(r)) {
        btnParam.style.display = "inline-flex";
      } else {
        btnParam.style.display = "none";
      }
    }

    qSelect.addEventListener("change", updatePreview);
    rSelect.addEventListener("change", updatePreview);
    cSelect.addEventListener("change", updatePreview);

    btnParam.addEventListener("click", () => {
      showResourceConfigModal({
        resourceType: rSelect.value,
        channel: parseInt(cSelect.value, 10) || 1,
        functionType: actionData.functionType,
        preset: actionData.preset,
        offset: actionData.offset,
        port: actionData.port
      }, (savedParams) => {
        Object.assign(actionData, savedParams);
        console.log(`Parâmetros de ${rSelect.value}${cSelect.value} salvos:`, actionData);
      });
    });

    div.querySelector(".remove-action").addEventListener("click", () => {
      actionsContainer.removeChild(div);
    });

    // Anexar objeto de dados ao elemento div para leitura ao salvar
    div._actionData = actionData;

    actionsContainer.appendChild(div);
  }

  // Carregar ações existentes
  if (step.actions && step.actions.length > 0) {
    step.actions.forEach(a => createActionFields(a));
  } else {
    createActionFields();
  }

  modal.querySelector("#add-action").addEventListener("click", () => {
    createActionFields();
  });

  modal.querySelector("#save-actions").addEventListener("click", () => {
    const actionDivs = [...actionsContainer.querySelectorAll(".action-fields")];
    const newActions = actionDivs.map((div, index) => {
      const q = div.querySelector(".action-qualifier").value;
      const r = div.querySelector(".action-resource").value;
      const c = parseInt(div.querySelector(".action-channel").value, 10) || 1;
      const desc = div.querySelector(".action-description").value.trim();

      const extraData = div._actionData || {};
      return {
        id: index + 1,
        qualifier: q,
        resourceType: r,
        channel: c,
        type: q,               // compatibilidade
        target: `${r}${c}`,   // ex: "Q3"
        description: desc,
        functionType: extraData.functionType,
        preset: extraData.preset,
        offset: extraData.offset,
        port: extraData.port
      };
    });

    step.actions = newActions;
    document.body.removeChild(overlay);
    console.log(`Step ${step.id} - ${newActions.length} ações salvas:`, newActions);
    debouncedSaveDiagram();
  });

  modal.querySelector("#cancel-actions").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
}

function showResourceConfigModal(actionData, onSave) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.zIndex = "10001";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.minWidth = "360px";

  const rType = (actionData.resourceType || 'T').toUpperCase();
  const channel = actionData.channel || 1;

  let title = `Configuração de Timer T${channel}`;
  let portHTML = '';
  if (rType === 'C') {
    title = `Configuração de Contador C${channel}`;
  } else if (rType === 'A') {
    title = `Configuração de Comparador Analógico A${channel}`;
    portHTML = `
      <div style="margin-bottom:10px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Porta (prt):</label>
        <input type="number" id="param-port" value="${actionData.port ?? 1}" min="1" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      </div>
    `;
  }

  modal.innerHTML = `
    <h2>${title}</h2>
    <div style="margin-bottom:10px;">
      <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">ID (Canal):</label>
      <input type="text" value="${channel}" disabled style="width:100%; height:32px; padding:4px 8px; border:1px solid #e2e8f0; background:#f1f5f9; border-radius:4px; box-sizing:border-box;">
    </div>

    ${portHTML}

    ${rType === 'T' ? `
      <div style="margin-bottom:10px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Modo do Temporizador (fun):</label>
        <select id="param-fun" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box; font-size:0.88rem; background:#fff;">
          <option value="1" ${(actionData.functionType ?? 1) == 1 ? 'selected' : ''}>1 - TON (Atraso na Ligação / On-Delay)</option>
          <option value="2" ${(actionData.functionType ?? 1) == 2 ? 'selected' : ''}>2 - TOFF (Atraso no Desligamento / Off-Delay)</option>
          <option value="3" ${(actionData.functionType ?? 1) == 3 ? 'selected' : ''}>3 - INTERMITENTE (Oscilador Cíclico / Blink)</option>
        </select>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Preset (pst) - Segundos:</label>
        <input type="number" step="any" min="0.1" id="param-pst" value="${actionData.preset ?? 5}" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      </div>
      <div style="margin-bottom:15px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Offset (ofs) - Segundos (Tempo OFF em Intermitente):</label>
        <input type="number" step="any" min="0" id="param-ofs" value="${actionData.offset ?? 0}" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      </div>
    ` : `
      <div style="margin-bottom:10px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Função (fun):</label>
        <input type="number" id="param-fun" value="${actionData.functionType ?? (rType === 'A' ? 2 : 1)}" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Preset (pst):</label>
        <input type="number" step="any" id="param-pst" value="${actionData.preset ?? (rType === 'A' ? 2.15 : 5)}" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      </div>
      <div style="margin-bottom:15px;">
        <label style="display:block; font-size:0.85rem; font-weight:bold; margin-bottom:3px;">Offset (ofs):</label>
        <input type="number" step="any" id="param-ofs" value="${actionData.offset ?? 0}" style="width:100%; height:32px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      </div>
    `}

    <div style="text-align:right;">
      <button id="save-resource-params" style="background:#2563eb; color:#fff; padding:6px 14px; border:none; border-radius:4px; cursor:pointer;">Salvar Parâmetros</button>
      <button id="cancel-resource-params" style="margin-left:5px; padding:6px 14px;">Cancelar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector("#save-resource-params").addEventListener("click", () => {
    const fun = parseFloat(modal.querySelector("#param-fun").value) || 0;
    const pst = parseFloat(modal.querySelector("#param-pst").value) || 0;
    const ofs = parseFloat(modal.querySelector("#param-ofs").value) || 0;
    const portEl = modal.querySelector("#param-port");
    const prt = portEl ? (parseInt(portEl.value, 10) || 1) : undefined;

    onSave({
      functionType: fun,
      preset: pst,
      offset: ofs,
      port: prt
    });

    document.body.removeChild(overlay);
    debouncedSaveDiagram();
  });

  modal.querySelector("#cancel-resource-params").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
}

function shouldIgnoreClickDueToMove(box) {
  if (box.dataset.wasMoved === "true") {
    box.dataset.wasMoved = "false";
    return true;
  }
  return false;
}

function doCompile() {
  compile(stepsList);
}

// Executar a cada 200 ms
setInterval(updateStepsView, 100);

/* ==========================================================================
   Funções de Persistência (localStorage, Auto-Save, Export / Import JSON)
   ========================================================================== */

function saveDiagramToStorage() {
  try {
    const data = {
      version: 1,
      timestamp: Date.now(),
      counters: {
        boxCounter,
        transitionCounter
      },
      steps: stepsList.map(step => ({
        id: step.id,
        type: step.type,
        state: step.state,
        position: {
          left: step.element.style.left,
          top: step.element.style.top
        },
        inputs: [...step.inputs],
        outputs: [...step.outputs],
        branchOutputs: step.branchOutputs ? { ...step.branchOutputs } : undefined,
        branchInputs: step.branchInputs ? { ...step.branchInputs } : undefined,
        transitions: (step.transitions || []).map(t => ({
          id: t.id,
          triggered: t.triggered,
          receptivity: t.receptivity,
          description: t.description
        })),
        actions: (step.actions || []).map(a => ({
          id: a.id,
          type: a.type,
          qualifier: a.qualifier,
          resourceType: a.resourceType,
          channel: a.channel,
          target: a.target,
          commands: (a.commands && a.commands.length > 0) ? [...a.commands] : undefined,
          description: a.description,
          functionType: a.functionType,
          preset: a.preset,
          offset: a.offset,
          port: a.port
        }))
      })),
      connections: connections.map(c => ({
        fromStepId: parseInt(c.from.box.getAttribute("data-id")),
        fromConnector: c.from.connector,
        fromBranch: c.from.branch,
        toStepId: parseInt(c.to.box.getAttribute("data-id")),
        toConnector: c.to.connector,
        toBranch: c.to.branch
      }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log("Diagrama salvo com sucesso no localStorage.");
  } catch (err) {
    console.error("Erro ao salvar diagrama no localStorage:", err);
  }
}

function debouncedSaveDiagram() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDiagramToStorage, 300);
}

function clearCanvasDOM() {
  const oldBoxes = canvas.querySelectorAll(".box");
  oldBoxes.forEach(box => box.remove());

  const svg = canvas.querySelector("svg");
  if (svg) svg.remove();

  const oldActionBoxes = canvas.querySelectorAll(".action-box, .action-line, .action-tooltip");
  oldActionBoxes.forEach(el => el.remove());

  stepsList.length = 0;
  connections.length = 0;
  clearSelection();
}

function restoreDiagram(data) {
  if (!data || !Array.isArray(data.steps)) return false;

  clearCanvasDOM();

  boxCounter = data.counters?.boxCounter || 0;
  transitionCounter = data.counters?.transitionCounter || 0;

  const svg = getOrCreateSVG();

  // 1. Reconstruir steps
  data.steps.forEach(sData => {
    const stepType = sData.type || "active_step";
    if (!stepType || typeof stepType !== "string") return;
    const template = palette.querySelector(`.${stepType}`);
    if (!template) return;

    const clone = template.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.left = sData.position?.left || "0px";
    clone.style.top = sData.position?.top || "0px";
    clone.draggable = false;

    const state = sData.state || "inactive";
    clone.setAttribute("data-state", state);
    clone.setAttribute("data-id", sData.id);

    const inner = clone.querySelector(".inner-rect");
    if (inner && state === "active") {
      inner.style.border = sData.type === "start_step" ? "5px double darkblue" : "3px solid darkblue";
    }

    canvas.appendChild(clone);
    makeDraggable(clone);
    attachConnectorListeners(clone);
    attachHoverListeners(clone);
    attachRemoveListener(clone);

    const step = new Step(sData.type, clone, state);
    step.id = sData.id;
    step.inputs = sData.inputs ? [...sData.inputs] : [];
    step.outputs = sData.outputs ? [...sData.outputs] : [];
    step.branchOutputs = sData.branchOutputs ? { ...sData.branchOutputs } : {};
    step.branchInputs = sData.branchInputs ? { ...sData.branchInputs } : {};

    if (Array.isArray(sData.transitions)) {
      step.transitions = sData.transitions.map(tData => new Transition({
        id: tData.id,
        triggered: tData.triggered,
        receptivity: tData.receptivity,
        description: tData.description
      }));
    }

    if (Array.isArray(sData.actions)) {
      step.actions = sData.actions.map(aData => new Action({
        id: aData.id,
        type: aData.type || aData.qualifier,
        qualifier: aData.qualifier,
        resourceType: aData.resourceType,
        channel: aData.channel,
        target: aData.target,
        commands: aData.commands,
        description: aData.description,
        functionType: aData.functionType,
        preset: aData.preset,
        offset: aData.offset,
        port: aData.port
      }));
    }

    // Atualizar label da receptividade se houver
    if (sData.type === "or_divergence" || sData.type === "and_convergence") {
      const branchTransitions = clone.querySelectorAll(".branch-transition");
      branchTransitions.forEach(bt => {
        const bIdx = parseInt(bt.getAttribute("data-branch") || "0", 10);
        if (step.transitions[bIdx] && step.transitions[bIdx].receptivity) {
          let rLabel = bt.querySelector(".receptivity-label");
          if (!rLabel) {
            rLabel = document.createElement("span");
            rLabel.className = "receptivity-label";
            rLabel.style.position = "absolute";
            rLabel.style.left = "32px";
            rLabel.style.top = "50%";
            rLabel.style.transform = "translateY(-50%)";
            rLabel.style.fontSize = "13px";
            rLabel.style.color = "#1e293b";
            rLabel.style.fontWeight = "bold";
            rLabel.style.pointerEvents = "none";
            rLabel.style.whiteSpace = "nowrap";
            bt.appendChild(rLabel);
          }
          rLabel.textContent = step.transitions[bIdx].receptivity;
        }
      });
    } else {
      if (step.transitions && step.transitions.length > 0 && step.transitions[0].receptivity) {
        const receptivityLabel = clone.querySelector(".receptivity-label");
        if (receptivityLabel) {
          receptivityLabel.textContent = step.transitions[0].receptivity;
        }
      }
    }

    stepsList.push(step);
  });

  renumberBoxes();

  // 2. Reconstruir conexões
  if (Array.isArray(data.connections)) {
    data.connections.forEach(cData => {
      const fromBox = canvas.querySelector(`.box[data-id="${cData.fromStepId}"]`);
      const toBox = canvas.querySelector(`.box[data-id="${cData.toStepId}"]`);
      if (!fromBox || !toBox) return;

      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("stroke", "lightblue");
      polyline.setAttribute("stroke-width", "2");
      polyline.setAttribute("fill", "none");

      svg.appendChild(polyline);

      polyline.addEventListener("mouseenter", () => {
        polyline.classList.add("hover-highlight");
        const conn = connections.find(c => c.polyline === polyline);
        if (conn) {
          conn.from.box.querySelector(".inner-rect")?.classList.add("hover-highlight");
          conn.to?.box?.querySelector(".inner-rect")?.classList.add("hover-highlight");
        }
      });

      polyline.addEventListener("mouseleave", () => {
        polyline.classList.remove("hover-highlight");
        const conn = connections.find(c => c.polyline === polyline);
        if (conn) {
          conn.from.box.querySelector(".inner-rect")?.classList.remove("hover-highlight");
          conn.to?.box?.querySelector(".inner-rect")?.classList.remove("hover-highlight");
        }
      });

      polyline.addEventListener("dblclick", e => {
        e.stopPropagation();
        svg.removeChild(polyline);
        const index = connections.findIndex(c => c.polyline === polyline);
        if (index !== -1) {
          const connRemoved = connections[index];
          removeStepConnection(connRemoved);
          connections.splice(index, 1);
          printSteps();
          debouncedSaveDiagram();
        }
      });

      const connObj = {
        polyline,
        from: { box: fromBox, connector: cData.fromConnector, branch: cData.fromBranch },
        to: { box: toBox, connector: cData.toConnector, branch: cData.toBranch }
      };

      connections.push(connObj);

      if (toBox.classList.contains("or_divergence") || toBox.classList.contains("and_convergence")) {
        fromBox.classList.add("connected-to-branch");
      }

      updateConnections(fromBox);
    });
  }

  updateStepsView();
  return true;
}

function loadDiagramFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return restoreDiagram(data);
  } catch (err) {
    console.error("Erro ao carregar diagrama do localStorage:", err);
    return false;
  }
}

/* ==========================================================================
   Gerenciamento de Arquivo de Projeto (Estilo Desktop + Fallback Web)
   ========================================================================== */

let currentFileHandle = null;
let currentFileName = null;
let toastTimeout = null;

function showToast(message, duration = 2800) {
  const toast = document.getElementById("toast-notification");
  if (!toast) return;
  toast.innerHTML = `<span style="font-size:15px">✔</span> ${message}`;
  toast.classList.add("show");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function updateProjectNameUI(name) {
  const label = document.getElementById("current-project-label");
  if (label) {
    label.textContent = name || "Sem título";
  }
  document.title = name ? `${name} - GRAFCET Editor` : "Drag & Drop GRAFCET";
}

function newDiagram() {
  if (stepsList.length > 0) {
    if (!confirm("Deseja iniciar um novo diagrama? As alterações não salvas serão perdidas.")) {
      return;
    }
  }
  clearCanvasDOM();
  boxCounter = 0;
  transitionCounter = 0;
  localStorage.removeItem(STORAGE_KEY);
  currentFileHandle = null;
  currentFileName = null;
  updateProjectNameUI("Sem título");
  showToast("Novo diagrama iniciado.");
  console.log("Novo diagrama em branco iniciado.");
}

function clearDiagram() {
  newDiagram();
}

async function openProject() {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: "Diagrama GRAFCET JSON (*.json)",
          accept: { "application/json": [".json"] }
        }],
        multiple: false
      });
      const file = await handle.getFile();
      const content = await file.text();
      const data = JSON.parse(content);
      if (restoreDiagram(data)) {
        currentFileHandle = handle;
        currentFileName = file.name;
        saveDiagramToStorage();
        updateProjectNameUI(currentFileName);
        showToast(`Arquivo "${currentFileName}" aberto com sucesso!`);
      } else {
        alert("Arquivo JSON de diagrama inválido.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("Erro no showOpenFilePicker, tentando fallback:", err);
        triggerImportDiagram();
      }
    }
  } else {
    // Fallback transparente para navegadores sem File System Access API
    triggerImportDiagram();
  }
}

async function saveProject() {
  saveDiagramToStorage();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || stepsList.length === 0) {
    showToast("Nenhum elemento no diagrama para salvar.", 2000);
    return;
  }

  if ("showSaveFilePicker" in window) {
    try {
      if (!currentFileHandle) {
        currentFileHandle = await window.showSaveFilePicker({
          suggestedName: currentFileName || "meu_grafcet.json",
          types: [{
            description: "Diagrama GRAFCET JSON (*.json)",
            accept: { "application/json": [".json"] }
          }]
        });
        currentFileName = currentFileHandle.name;
        updateProjectNameUI(currentFileName);
      }

      const writable = await currentFileHandle.createWritable();
      await writable.write(raw);
      await writable.close();
      showToast(`Salvo em "${currentFileName}"!`);
      console.log(`Diagrama gravado com sucesso em ${currentFileName}`);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("Erro ao salvar com File System Access API, usando fallback:", err);
        exportDiagram();
      }
    }
  } else {
    // Fallback transparente
    exportDiagram();
  }
}

function exportDiagram() {
  saveDiagramToStorage();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || stepsList.length === 0) {
    alert("Nenhum diagrama para salvar.");
    return;
  }
  const filename = currentFileName || `grafcet_diagram_${Date.now()}.json`;
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Download de "${filename}" concluído!`);
}

function triggerImportDiagram() {
  const input = document.getElementById("import-file-input");
  if (input) input.click();
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (restoreDiagram(data)) {
        currentFileHandle = null;
        currentFileName = file.name;
        saveDiagramToStorage();
        updateProjectNameUI(currentFileName);
        showToast(`Arquivo "${file.name}" carregado com sucesso!`);
      } else {
        alert("Arquivo JSON de diagrama inválido.");
      }
    } catch (err) {
      alert("Erro ao ler o arquivo JSON: " + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

// Atalho de teclado global Ctrl+S / Cmd+S
window.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveProject();
  }
});

window.addEventListener("beforeunload", saveDiagramToStorage);
setTimeout(() => {
  const loaded = loadDiagramFromStorage();
  updateCanvasWrapperSize();
  centerCanvasViewport();
  if (window.simulationRack) {
    window.simulationRack.init();
  }
}, 100);

/* ==========================================================================
   Navegação e Pan na Área de Trabalho (4 Folhas / Viewport)
   ========================================================================== */

const viewport = document.getElementById("canvas-viewport");

function updateCanvasWrapperSize() {
  const wrapper = document.getElementById("canvas-wrapper");
  if (wrapper) {
    wrapper.style.width = `${3200 * currentZoom}px`;
    wrapper.style.height = `${2400 * currentZoom}px`;
  }
}

function getMinZoom() {
  if (!viewport) return 0.25;
  const padding = 120; // 60px de respiro em cada lado
  const fitX = (viewport.clientWidth - padding) / 3200;
  const fitY = (viewport.clientHeight - padding) / 2400;
  // Enquadra as 4 folhas perfeitamente na janela do usuário (com piso seguro de 20% e teto de 50%)
  return Math.round(Math.max(0.20, Math.min(fitX, fitY, 0.50)) * 100) / 100;
}

function updateZoomDisplay() {
  const resetBtn = document.getElementById("nav-zoom-reset");
  if (resetBtn) {
    resetBtn.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

function setZoom(newZoom, clientX, clientY) {
  if (!viewport || !canvas) return;
  const minZoom = getMinZoom();
  const clampedZoom = Math.round(Math.min(Math.max(newZoom, minZoom), MAX_ZOOM) * 100) / 100;
  if (Math.abs(clampedZoom - currentZoom) < 0.005) return;

  const previousZoom = currentZoom;
  const rect = viewport.getBoundingClientRect();

  // Ponto focal: se fornecido o ponteiro (mouse/touchpad), usa sua posição relativa;
  // caso contrário (ex: clique no botão ou atalho), usa o centro da área visível.
  const mouseX = (clientX !== undefined) ? (clientX - rect.left) : (viewport.clientWidth / 2);
  const mouseY = (clientY !== undefined) ? (clientY - rect.top) : (viewport.clientHeight / 2);

  // Coordenadas mundiais antes do zoom
  const worldX = (viewport.scrollLeft + mouseX) / previousZoom;
  const worldY = (viewport.scrollTop + mouseY) / previousZoom;

  currentZoom = clampedZoom;
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform = `scale(${currentZoom})`;
  updateCanvasWrapperSize();

  // Reposiciona o scroll para manter o ponto fixo no mesmo local da tela
  viewport.scrollLeft = worldX * currentZoom - mouseX;
  viewport.scrollTop = worldY * currentZoom - mouseY;

  updateZoomDisplay();
}

function zoomIn() {
  setZoom(currentZoom + ZOOM_STEP);
}

function zoomOut() {
  setZoom(currentZoom - ZOOM_STEP);
}

function resetZoom() {
  setZoom(1.0);
}

function zoomToFit() {
  if (!viewport || !canvas) return;
  setZoom(getMinZoom());
  setTimeout(() => {
    centerCanvasViewport();
  }, 50);
}

function centerCanvasViewport() {
  if (!viewport || !canvas) return;
  const scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
  const scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
  viewport.scrollTo({
    left: Math.max(0, scrollLeft),
    top: Math.max(0, scrollTop),
    behavior: 'smooth'
  });
}

// 1. Navegação Pan e Seleção Elástica (Marquee Selection)
let isPanning = false;
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;
let isSpacePressed = false;

window.addEventListener("keydown", e => {
  if (e.code === "Space" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
    isSpacePressed = true;
    document.body.classList.add("space-pressed");
  }
});

window.addEventListener("keyup", e => {
  if (e.code === "Space") {
    isSpacePressed = false;
    document.body.classList.remove("space-pressed");
  }
});

if (viewport) {
  viewport.addEventListener("mousedown", e => {
    const isCanvasBg = e.target === canvas || 
      e.target === viewport || 
      e.target.id === "canvas-wrapper" || 
      e.target.classList.contains("quadrant-divider") || 
      e.target.tagName.toLowerCase() === "svg";

    // Pan é ativado por:
    // 1. Botão do Meio (1)
    // 2. Botão Direito (2)
    // 3. Barra de Espaço + Botão Esquerdo (0)
    const isPanAction = e.button === 1 || e.button === 2 || (isSpacePressed && e.button === 0);

    if (isPanAction) {
      if (e.button === 2) e.preventDefault(); // Previne menu de contexto se botão direito
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = viewport.scrollLeft;
      startScrollTop = viewport.scrollTop;
      viewport.classList.add("panning");
      return;
    }

    // Se for Botão Esquerdo puro (0) no fundo sem barra de espaço:
    // Inicia a Caixa Elástica de Seleção (Marquee Selection)
    if (e.button === 0 && isCanvasBg && !isSimulationActive) {
      const marqueeEl = document.getElementById("selection-marquee");
      const rect = canvas.getBoundingClientRect();
      const startCanvasX = (e.clientX - rect.left) / currentZoom;
      const startCanvasY = (e.clientY - rect.top) / currentZoom;
      let isMarquee = false;
      const initialSelected = e.shiftKey ? new Set(selectedBoxes) : new Set();

      function onMarqueeMove(ev) {
        const currentCanvasX = (ev.clientX - rect.left) / currentZoom;
        const currentCanvasY = (ev.clientY - rect.top) / currentZoom;

        const mx = Math.min(startCanvasX, currentCanvasX);
        const my = Math.min(startCanvasY, currentCanvasY);
        const mw = Math.abs(currentCanvasX - startCanvasX);
        const mh = Math.abs(currentCanvasY - startCanvasY);

        if (mw > 3 || mh > 3) {
          isMarquee = true;
          if (marqueeEl) {
            marqueeEl.style.display = "block";
            marqueeEl.style.left = `${mx}px`;
            marqueeEl.style.top = `${my}px`;
            marqueeEl.style.width = `${mw}px`;
            marqueeEl.style.height = `${mh}px`;
          }

          // Teste de interseção AABB com os blocos presentes no canvas
          const boxes = canvas.querySelectorAll(".box");
          boxes.forEach(b => {
            const bLeft = parseFloat(b.style.left) || 0;
            const bTop = parseFloat(b.style.top) || 0;
            const bWidth = b.offsetWidth || 100;
            const bHeight = b.offsetHeight || 100;

            const intersects = (mx < bLeft + bWidth) && (mx + mw > bLeft) &&
                               (my < bTop + bHeight) && (my + mh > bTop);

            if (intersects) {
              selectedBoxes.add(b);
              b.classList.add("selected");
            } else if (!initialSelected.has(b)) {
              selectedBoxes.delete(b);
              b.classList.remove("selected");
            }
          });
        }
      }

      function onMarqueeUp() {
        window.removeEventListener("mousemove", onMarqueeMove);
        window.removeEventListener("mouseup", onMarqueeUp);

        if (marqueeEl) {
          marqueeEl.style.display = "none";
        }

        // Se foi apenas um clique simples no fundo sem arrastar e sem Shift, limpa a seleção
        if (!isMarquee && !e.shiftKey) {
          clearSelection();
        }
      }

      window.addEventListener("mousemove", onMarqueeMove);
      window.addEventListener("mouseup", onMarqueeUp);
    }
  });

  viewport.addEventListener("contextmenu", e => {
    if (isPanning) e.preventDefault();
  });

  window.addEventListener("mousemove", e => {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    viewport.scrollLeft = startScrollLeft - dx;
    viewport.scrollTop = startScrollTop - dy;
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      viewport.classList.remove("panning");
    }
  });

  // 2. Evento Wheel: Combinação de Scroll e Zoom (Abordagem A)
  // Ctrl + Roda (ou pinch no touchpad) -> Zoom In / Zoom Out focado no cursor
  // Shift + Roda -> Rolagem horizontal
  // Roda normal -> Rolagem vertical padrão
  viewport.addEventListener("wheel", e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Se for tick discreto da roda do mouse, avança exatamente 1 passo (1%)
      // Se for trackpad/gesto de pinça (deltaY fracionário e contínuo), calcula proporcionalmente
      const zoomDelta = (e.deltaMode === 0 && Math.abs(e.deltaY) < 30)
        ? -e.deltaY * 0.0005
        : -Math.sign(e.deltaY) * ZOOM_STEP;
      setZoom(currentZoom + zoomDelta, e.clientX, e.clientY);
    } else if (e.shiftKey) {
      e.preventDefault();
      viewport.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

// 3. Botões de Navegação Flutuante (Setas, Centralizar e Zoom)
document.getElementById("nav-up")?.addEventListener("click", () => {
  if (viewport) viewport.scrollBy({ top: -300, behavior: 'smooth' });
});
document.getElementById("nav-down")?.addEventListener("click", () => {
  if (viewport) viewport.scrollBy({ top: 300, behavior: 'smooth' });
});
document.getElementById("nav-left")?.addEventListener("click", () => {
  if (viewport) viewport.scrollBy({ left: -300, behavior: 'smooth' });
});
document.getElementById("nav-right")?.addEventListener("click", () => {
  if (viewport) viewport.scrollBy({ left: 300, behavior: 'smooth' });
});
document.getElementById("nav-center")?.addEventListener("click", e => {
  if (e.shiftKey || e.ctrlKey) {
    zoomToFit();
  } else {
    centerCanvasViewport();
  }
});
document.getElementById("nav-center")?.addEventListener("dblclick", () => {
  zoomToFit();
});
document.getElementById("nav-zoom-in")?.addEventListener("click", () => {
  zoomIn();
});
document.getElementById("nav-zoom-out")?.addEventListener("click", () => {
  zoomOut();
});
document.getElementById("nav-zoom-reset")?.addEventListener("click", () => {
  resetZoom();
});

// 4. Atalhos de Teclado Globais para Zoom, Seleção e Simulação
window.addEventListener("keydown", e => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
    return;
  }

  // Atalhos de Simulação
  if (e.key === "F5") {
    e.preventDefault();
    toggleSimulationMode();
    return;
  }
  if (e.key === "F10") {
    e.preventDefault();
    stepSimulationMode();
    return;
  }

  // Atalhos de Seleção Múltipla
  if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
    e.preventDefault();
    selectAllBoxes();
    return;
  }

  if (e.key === "Escape") {
    clearSelection();
    return;
  }

  // Atalhos de Zoom
  if (e.ctrlKey || e.metaKey) {
    if (e.shiftKey && (e.key === "0" || e.code === "Numpad0" || e.key === ")")) {
      e.preventDefault();
      zoomToFit();
    } else if (e.key === "=" || e.key === "+" || e.code === "NumpadAdd") {
      e.preventDefault();
      zoomIn();
    } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") {
      e.preventDefault();
      zoomOut();
    } else if (e.key === "0" || e.code === "Numpad0") {
      e.preventDefault();
      resetZoom();
    }
  }
});

/* ==========================================================================
   Controles do Modo de Simulação Virtual GRAFCET (IEC 60848)
   ========================================================================== */

function toggleSimulationMode() {
  const toggleBtn = document.getElementById("btn-toggle-simulation");
  const stepBtn = document.getElementById("btn-step-simulation");
  const simIcon = document.getElementById("sim-main-icon");
  const simLabel = document.getElementById("sim-main-label");
  const statusDisplay = document.getElementById("sim-status-display");
  const rack = window.simulationRack;

  if (!isSimulationActive) {
    if (!stepsList || stepsList.length === 0) {
      if (typeof showToast === "function") {
        showToast("Adicione pelo menos uma etapa antes de simular o GRAFCET.", 3000);
      } else {
        alert("Adicione pelo menos uma etapa antes de simular o GRAFCET.");
      }
      return;
    }

    let ir = null;
    try {
      if (typeof buildGrafcetIR === "function") {
        ir = buildGrafcetIR(stepsList);
      }
    } catch (err) {
      console.error("Erro ao compilar GRAFCET para simulação:", err);
      if (typeof showToast === "function") {
        showToast("Erro na validação do diagrama para simulação.", 3000);
      }
      return;
    }

    if (!ir || !ir.steps || ir.steps.length === 0) {
      if (typeof showToast === "function") {
        showToast("Diagrama vazio ou sem etapas válidas para simular.", 3000);
      }
      return;
    }

    isSimulationActive = true;
    clearSelection();
    document.body.classList.add("sim-mode-active");

    if (toggleBtn) {
      toggleBtn.classList.add("btn-sim-stop");
      toggleBtn.title = "Parar Simulação do GRAFCET (F5)";
    }
    if (simIcon) simIcon.textContent = "⏹";
    if (simLabel) simLabel.textContent = "PARAR";

    if (stepBtn) {
      stepBtn.style.display = "inline-flex";
    }
    if (statusDisplay) {
      statusDisplay.style.display = "inline-flex";
    }

    if (rack) {
      rack.startSimulation(ir);
    }

    if (typeof showToast === "function") {
      showToast("Simulação iniciada! Use o Rack de E/S ou clique nas etapas para forçar.", 3500);
    }
  } else {
    isSimulationActive = false;
    document.body.classList.remove("sim-mode-active");

    if (toggleBtn) {
      toggleBtn.classList.remove("btn-sim-stop");
      toggleBtn.title = "Iniciar Simulação do GRAFCET (F5)";
    }
    if (simIcon) simIcon.textContent = "▶";
    if (simLabel) simLabel.textContent = "SIMULAR";

    if (stepBtn) {
      stepBtn.style.display = "none";
    }
    if (statusDisplay) {
      statusDisplay.style.display = "none";
    }

    if (rack) {
      rack.stopSimulation();
    }

    if (typeof showToast === "function") {
      showToast("Simulação finalizada.", 2000);
    }
  }
}

function stepSimulationMode() {
  if (!isSimulationActive) {
    toggleSimulationMode();
    return;
  }
  const rack = window.simulationRack;
  if (rack && rack.engine) {
    rack.stepSimulation();
  }
}

window.toggleSimulationMode = toggleSimulationMode;
window.stepSimulationMode = stepSimulationMode;

document.getElementById("btn-toggle-simulation")?.addEventListener("click", toggleSimulationMode);
document.getElementById("btn-step-simulation")?.addEventListener("click", stepSimulationMode);



