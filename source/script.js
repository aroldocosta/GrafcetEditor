const canvas = document.getElementById("canvas");
const palette = document.getElementById("palette");
const testBtn = document.getElementById("test-states");
let currentConnection = null;
const connections = [];
const stepsList = [];
let transitionCounter = 0;
let boxCounter = 0;
let clickTimeout = null;

palette.querySelectorAll(".box").forEach(box => {
  box.addEventListener("dragstart", e => {
    // Centralizar cursor no centro do objeto na paleta usando setDragImage
    e.dataTransfer.setData("type", box.classList.contains("start_step") ? "start_step" : "active_step");

    // Clonar elemento para usar como drag image
    const clone = box.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.top = "-1000px"; // fora da viewport
    clone.style.left = "-1000px";
    clone.style.pointerEvents = "none"; // não interfere
    document.body.appendChild(clone);

    const rect = clone.getBoundingClientRect();
    // Centralizar no meio
    const offsetX = rect.width / 2;
    const offsetY = rect.height / 2;

    e.dataTransfer.setDragImage(clone, offsetX, offsetY);

    // Remover clone após dragstart para não poluir o DOM
    setTimeout(() => document.body.removeChild(clone), 0);
  });
});

canvas.addEventListener("dragover", e => e.preventDefault());

canvas.addEventListener("drop", e => {
  e.preventDefault();
  const type = e.dataTransfer.getData("type");
  const template = palette.querySelector(`.${type}`);
  if (!template) return;

  const clone = template.cloneNode(true);
  clone.style.position = "absolute";
  clone.style.left = e.offsetX - 50 + "px";
  clone.style.top = e.offsetY - 45 + "px";
  clone.draggable = false;

  // Definir o state conforme o tipo
  const state = (type === "start_step") ? "active" : "inactive";
  clone.setAttribute("data-state", state);

  const inner = clone.querySelector(".inner-rect");
  if (state === "active") {
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
  stepsList.push(step);

  createTransitionForStep(step);  // <-- adiciona uma transition associada

  clone.setAttribute("data-id", step.id);

  printSteps();
});

function makeDraggable(box) {
  let startX, startY, boxStartLeft, boxStartTop;
  let moved = false;

  box.addEventListener("mousedown", e => {
    if (e.target.classList.contains("connector")) return;
    startX = e.clientX;
    startY = e.clientY;
    boxStartLeft = parseFloat(box.style.left);
    boxStartTop = parseFloat(box.style.top);
    moved = false;

    function move(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        moved = true;
      }
      box.style.left = boxStartLeft + dx + "px";
      box.style.top = boxStartTop + dy + "px";
      updateConnections(box);
    }

    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      // Quando soltar, marca na propriedade dataset se moveu
      box.dataset.wasMoved = moved ? "true" : "false";
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}


function attachConnectorListeners(box) {
  box.querySelectorAll(".connector").forEach(connector => {
    connector.addEventListener("click", e => {
      e.stopPropagation();
      const svg = getOrCreateSVG();
      const rect = canvas.getBoundingClientRect();
      const connRect = connector.getBoundingClientRect();
      const x = connRect.left + connRect.width / 2 - rect.left;
      const y = connector.classList.contains("top") ? connRect.top - rect.top : connRect.bottom - rect.top;

      if (!currentConnection) {
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
            conn.from.box.querySelector(".inner-rect").classList.add("hover-highlight");
            conn.to?.box?.querySelector(".inner-rect")?.classList.add("hover-highlight");
          }
        });
        polyline.addEventListener("mouseleave", () => {
          polyline.classList.remove("hover-highlight");
          const conn = connections.find(c => c.polyline === polyline);
          if (conn) {
            conn.from.box.querySelector(".inner-rect").classList.remove("hover-highlight");
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
          }
        });

        currentConnection = {
          polyline,
          from: { box, connector: connector.classList.contains("top") ? "top" : "bottom" },
          mouseMoveHandler: ev => {
            const mx = ev.clientX - rect.left;
            const my = ev.clientY - rect.top;
            currentConnection.polyline.setAttribute("points", `${x},${y} ${mx},${my}`);
          }
        };

        document.addEventListener("mousemove", currentConnection.mouseMoveHandler);
      } else {
        if (currentConnection.mouseMoveHandler) {
          document.removeEventListener("mousemove", currentConnection.mouseMoveHandler);
        }

        const fromConn = currentConnection.from.box.querySelector(`.connector.${currentConnection.from.connector}`);
        const fromRect = fromConn.getBoundingClientRect();
        const fromX = fromRect.left + 3 - rect.left;
        const fromY = currentConnection.from.connector === "bottom"
          ? fromRect.bottom - rect.top
          : fromRect.top - rect.top;

        const toX = x;
        const toY = y;
        let points = "";

        if (currentConnection.from.connector === "bottom" &&
            connector.classList.contains("top") &&
            toY < fromY) {
          const offsetX = Math.min(fromX, toX) - 50;
          const y1 = fromY + 10;
          const y2 = toY - 10;
          points = [
            `${fromX},${fromY}`,
            `${fromX},${y1}`,
            `${offsetX},${y1}`,
            `${offsetX},${y2}`,
            `${toX},${y2}`,
            `${toX},${toY}`
          ].join(" ");
        } else {
          points = `${fromX},${fromY} ${toX},${toY}`;
        }

        currentConnection.polyline.setAttribute("points", points);

        connections.push({
          ...currentConnection,
          to: { box, connector: connector.classList.contains("top") ? "top" : "bottom" }
        });

        addStepConnection(currentConnection.from.box, box);

        currentConnection = null;

        printSteps();
      }
    });
  });
}

function attachHoverListeners(box) {
  
  const inner = box.querySelector(".inner-rect");
  box.addEventListener("mouseenter", () => {
    inner.classList.add("hover-highlight");
  });
  box.addEventListener("mouseleave", () => {
    inner.classList.remove("hover-highlight");
  });

  inner.addEventListener("click", (e) => {
    e.stopPropagation();
   
    if( shouldIgnoreClickDueToMove(box) ) return;

    clickTimeout = setTimeout(() => {
      const stepId = parseInt(box.getAttribute("data-id"));
      const step = stepsList.find(s => s.id === stepId);
      if (step) {
        showActionsModal(step);
      }
    }, 320);
  });
  
  const transitionBar = box.querySelector(".transition");
  transitionBar.addEventListener("mouseenter", () => {
    transitionBar.classList.add("hover-highlight");
  });
  transitionBar.addEventListener("mouseleave", () => {
    transitionBar.classList.remove("hover-highlight");
  });

  // Novo listener de click para abrir o modal
  transitionBar.addEventListener("click", (e) => {
    e.stopPropagation();

    if( shouldIgnoreClickDueToMove(box) ) return;
  
    const stepId = parseInt(box.getAttribute("data-id"));
    const step = stepsList.find(s => s.id === stepId);
    if (!step || !step.transitions || step.transitions.length === 0) {
      console.warn("Nenhuma transição encontrada para este step.");
      return;
    }
    const transition = step.transitions[0]; // assumindo uma única transição
    showReceptivityModal(transition, transitionBar);
  });

  // Criar elemento <span> que mostrará a receptividade
  const receptivityLabel = document.createElement("span");
  receptivityLabel.className = "receptivity-label";
  receptivityLabel.textContent = "";
  receptivityLabel.style.position = "absolute";
  receptivityLabel.style.left = "30px"; // à direita do tracinho
  receptivityLabel.style.top = "50%";
  receptivityLabel.style.transform = "translateY(-50%)";
  receptivityLabel.style.fontSize = "14px";
  receptivityLabel.style.color = "#333";
  receptivityLabel.style.fontWeight = "bold";
  receptivityLabel.style.pointerEvents = "none";
  transitionBar.appendChild(receptivityLabel);

}


function attachRemoveListener(box) {
  box.addEventListener("dblclick", (e) => {

    e.stopPropagation()

    // Cancelar click pendente (se houver)
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
    canvas.removeChild(box);

    const stepIndex = stepsList.findIndex(s => s.element === box);
    if (stepIndex !== -1) {
      stepsList.splice(stepIndex, 1);
    }

    renumberBoxes();
    printSteps();
  });
}

function renumberBoxes() {
  const boxes = [...canvas.querySelectorAll(".box")];
  boxes.forEach((box, index) => {
    box.querySelector(".inner-rect").textContent = index + 1;
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

function updateConnections(box) {
  const rect = canvas.getBoundingClientRect();
  connections.forEach(conn => {
    if (conn.from.box === box || conn.to.box === box) {
      const fromConn = conn.from.box.querySelector(`.connector.${conn.from.connector}`);
      const toConn = conn.to.box.querySelector(`.connector.${conn.to.connector}`);

      const fromX = fromConn.getBoundingClientRect().left + 3 - rect.left;
      const fromY = conn.from.connector === "top"
        ? fromConn.getBoundingClientRect().top - rect.top
        : fromConn.getBoundingClientRect().bottom - rect.top;

      const toX = toConn.getBoundingClientRect().left + 3 - rect.left;
      const toY = conn.to.connector === "top"
        ? toConn.getBoundingClientRect().top - rect.top
        : toConn.getBoundingClientRect().bottom - rect.top;

      let points = "";
      if (conn.from.connector === "bottom" && conn.to.connector === "top" && toY < fromY) {
        const offsetX = Math.min(fromX, toX) - 50;
        const y1 = fromY + 10;
        const y2 = toY - 10;
        points = [
          `${fromX},${fromY}`,
          `${fromX},${y1}`,
          `${offsetX},${y1}`,
          `${offsetX},${y2}`,
          `${toX},${y2}`,
          `${toX},${toY}`
        ].join(" ");
      } else {
        points = `${fromX},${fromY} ${toX},${toY}`;
      }

      conn.polyline.setAttribute("points", points);
    }
  });
}

function addStepConnection(fromBox, toBox) {
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
}

function removeStepConnection(connection) {
  const fromId = parseInt(connection.from.box.getAttribute("data-id"));
  const toId = parseInt(connection.to.box.getAttribute("data-id"));
  if (isNaN(fromId) || isNaN(toId)) return;

  const fromStep = stepsList.find(s => s.id === fromId);
  const toStep = stepsList.find(s => s.id === toId);
  if (!fromStep || !toStep) return;

  fromStep.outputs = fromStep.outputs.filter(id => id !== toId);
  toStep.inputs = toStep.inputs.filter(id => id !== fromId);
}

function updateStepsView() {
  // Antes de atualizar, limpa todos os elementos de ação existentes
  const oldActionBoxes = canvas.querySelectorAll(".action-box, .action-line, .action-tooltip");
  oldActionBoxes.forEach(el => el.remove());

  stepsList.forEach(step => {
    const inner = step.element.querySelector(".inner-rect");
    if (step.state === "active") {
      inner.style.border = step.type === "start_step"
        ? "5px double darkblue"
        : "3px solid darkblue";
    } else {
      inner.style.border = "";
    }

    // Renderizar Actions ao lado direito do Step
    if (step.actions && step.actions.length > 0) {
      const rect = step.element.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const baseLeft = parseFloat(step.element.style.left) + 110; // desloca para direita
      const baseTop = parseFloat(step.element.style.top) + 20; // alinhamento vertical

      step.actions.forEach((action, idx) => {

        if(idx == 0) { //Primeia ação
        // Linha de conexão
          const line = document.createElement("div");
          line.className = "action-line";
          line.style.left = (baseLeft - 30 + idx * 110) + "px";
          line.style.top = (baseTop + 20) + "px";
          canvas.appendChild(line);
        }

        // Caixa da ação
        const box = document.createElement("div");
        box.className = "action-box";
        box.style.left = (baseLeft - 10 + idx * 110) + "px";
        box.style.top = (baseTop - 8) + "px";
        box.style.fontSize = "1.1em";
        box.style.textAlign = "center";
        box.style.fontStyle = "italic";
        box.style.fontWeight = "bold";
        box.style.overflowWrap = "anywhere";

        const commandsText = action.commands.map(c => `${c}`).join(", ");
        box.textContent = commandsText;
        box.textContent.marginTop = "20px";

        // Tooltip ao passar o mouse
        box.addEventListener("mouseenter", (e) => {
          const tooltip = document.createElement("div");
          tooltip.className = "action-tooltip";
          tooltip.innerHTML = `
            <strong>ID:</strong> ${action.id || "-"}<br>
            <strong>Type:</strong> ${action.type || "-"}<br>
            <strong>Qualifier:</strong> ${action.qualifier || "-"}<br>
            <strong>Description:</strong> ${action.description || "-"}
          `;
          tooltip.style.left = (parseFloat(box.style.left) + 110) + "px";
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
      if(step.state === "active" && t.triggered) {
        t.triggered = false;
        step.state = "inactive";
        step.outputs.forEach(stepId => {
            stepsList[stepId-1].state = "active";
        });
      }
    });
  });
}

function showReceptivityModal(transition, transitionBar) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";

  modal.innerHTML = `
    <h2>Editar Receptividade</h2>
    <input type="text" id="receptivity-input" placeholder="Digite a receptividade" value="${transition.receptivity}">
    <div style="text-align:right;">
      <button id="save-receptivity">Salvar</button>
      <button id="cancel-receptivity">Cancelar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector("#save-receptivity").addEventListener("click", () => {
    const value = modal.querySelector("#receptivity-input").value.trim();
    transition.setReceptivity(value);

    const label = transitionBar.querySelector(".receptivity-label");
    if (label) {
      label.textContent = value;
    }

    document.body.removeChild(overlay);
    console.log(`Receptividade da transição ${transition.id} atualizada para: "${value}"`);
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

  modal.innerHTML = `
    <h2>Ações do Step ${step.id}</h2>
    <div id="actions-container"></div>
    <button id="add-action">Adicionar Ação</button>
    <div style="margin-top:10px; text-align:right;">
      <button id="save-actions">Salvar Todas</button>
      <button id="cancel-actions">Cancelar</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const actionsContainer = modal.querySelector("#actions-container");

  // Função para criar campos de uma ação
  function createActionFields(action = {}) {
    const div = document.createElement("div");
    div.className = "action-fields";
    div.style.border = "1px solid #ccc";
    div.style.padding = "5px";
    div.style.marginBottom = "5px";

    div.innerHTML = `
      <input type="text" placeholder="ID" value="${action.id || ''}" style="width: 60px; margin-right:3px;">
      <input type="text" placeholder="Type" value="${action.type || ''}" style="width: 80px; margin-right:3px;">
      <input type="text" placeholder="Commands" value="${(action.commands || []).join(',')}" style="width: 120px; margin-right:3px;">
      <input type="text" placeholder="Qualifier" value="${action.qualifier || ''}" style="width: 80px; margin-right:3px;">
      <input type="text" placeholder="Description" value="${action.description || ''}" style="width: 100px; margin-right:3px;">
      <button class="remove-action">X</button>
    `;

    div.querySelector(".remove-action").addEventListener("click", () => {
      actionsContainer.removeChild(div);
    });

    actionsContainer.appendChild(div);
  }

  // Carregar ações existentes
  if (step.actions.length > 0) {
    step.actions.forEach(a => createActionFields(a));
  } else {
    createActionFields();
  }

  modal.querySelector("#add-action").addEventListener("click", () => {
    createActionFields();
  });

  modal.querySelector("#save-actions").addEventListener("click", () => {
    const actionDivs = [...actionsContainer.querySelectorAll(".action-fields")];
    const newActions = actionDivs.map(div => {
      const inputs = div.querySelectorAll("input");
      return new Action({
        id: inputs[0].value.trim(),
        type: inputs[1].value.trim(),
        commands: inputs[2].value.trim() ? inputs[2].value.trim().split(",").map(s=>s.trim()) : [],
        qualifier: inputs[3].value.trim(),
        description: inputs[4].value.trim()
      });
    });
    step.actions = newActions;
    document.body.removeChild(overlay);
    console.log(`Step ${step.id} - ${newActions.length} ações salvas:`, newActions);
  });

  modal.querySelector("#cancel-actions").addEventListener("click", () => {
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
