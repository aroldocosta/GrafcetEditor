const canvas = document.getElementById("canvas");
const palette = document.getElementById("palette");
const testBtn = document.getElementById("test-states");
let currentConnection = null;
const connections = [];
const stepsList = [];
let transitionCounter = 0;
let boxCounter = 0;
let clickTimeout = null;

const STORAGE_KEY = "grafcet_saved_diagram";
let saveTimeout = null;

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
  debouncedSaveDiagram();
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
      if (moved) {
        debouncedSaveDiagram();
      }
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
            debouncedSaveDiagram();
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
        debouncedSaveDiagram();
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
    debouncedSaveDiagram();
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

        const commandsText = (action.commands && Array.isArray(action.commands))
          ? action.commands.join(", ")
          : coilLabel;

        box.textContent = commandsText;

        box.style.cursor = "pointer";

        // Clique esquerdo na ação para abrir o modal correspondente
        box.addEventListener("click", (e) => {
          e.stopPropagation();
          const tooltip = canvas.querySelector(".action-tooltip");
          if (tooltip) tooltip.remove();

          const rType = r.toUpperCase();
          if (['T', 'C', 'A'].includes(rType)) {
            // Abrir diretamente o modal de parâmetros para T, C ou A
            showResourceConfigModal({
              resourceType: rType,
              channel: parseInt(c, 10) || 1,
              functionType: action.functionType,
              preset: action.preset,
              offset: action.offset,
              port: action.port
            }, (savedParams) => {
              Object.assign(action, savedParams);
              console.log(`Parâmetros de ${rType}${c} salvos via clique no canvas:`, savedParams);
            });
          } else {
            // Para relés Q e memórias M, abre o modal de ações do Step
            showActionsModal(step);
          }
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

  const hwPattern = /^(I[1-8]|E[1-8]|Q[1-8]|R[1-8]|M([1-9]|[1-5][0-9]|6[0-4])|X([1-9]|[1-5][0-9]|6[0-4])|T([1-9]|1[0-6])|C[1-8]|A[1-8]|1|0)$/i;

  const rawTokens = normalized.match(/([a-zA-Z]+\d+|\d+|[+*!()])/g) || [];
  const fullReconstructed = rawTokens.join('');
  const errors = [];

  if (fullReconstructed !== normalized) {
    errors.push('Símbolo inválido detectado na expressão.');
  }

  for (const tok of rawTokens) {
    if (!/^[+*!()]$/.test(tok)) {
      if (!hwPattern.test(tok)) {
        errors.push(`Identificador '${tok}' fora dos limites de hardware (I1-I8, Q1-Q8, R1-R8, M1-M64, T1-T16, C1-C8, A1-A8, 1, 0).`);
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
    if (/^[+*]$/.test(rawTokens[i]) && /^[+*]$/.test(rawTokens[i+1])) {
      errors.push(`Operadores duplos consecutivos: '${rawTokens[i]}${rawTokens[i+1]}'.`);
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
    
    const needSpaceBefore = /^[+*]$/.test(textToInsert) && start > 0 && val[start-1] !== ' ';
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

  modal.innerHTML = `
    <h2>Ações do Step ${step.id}</h2>
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
      <button class="btn-config-param" title="Configurar Parâmetros (fun, pst, ofs)" style="height: 32px; width: 32px; min-width: 32px; margin: 0; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; display: ${['T','C','A'].includes(resourceType) ? 'inline-flex' : 'none'}; align-items: center; justify-content: center; vertical-align: middle;">⚙️</button>

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

function testOpenReceptivityModal() {
  const dummyTransition = new Transition({
    id: 1,
    triggered: false,
    receptivity: 'I1 * T1 + !Q2',
    inputSteps: [1],
    outputSteps: [2],
    description: 'Teste de Receptividade'
  });
  const dummyBar = document.createElement("div");
  dummyBar.innerHTML = '<span class="receptivity-label">I1 * T1 + !Q2</span>';
  showReceptivityModal(dummyTransition, dummyBar);
}

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
          commands: a.commands ? [...a.commands] : [],
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
        toStepId: parseInt(c.to.box.getAttribute("data-id")),
        toConnector: c.to.connector
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
}

function restoreDiagram(data) {
  if (!data || !Array.isArray(data.steps)) return false;

  clearCanvasDOM();

  boxCounter = data.counters?.boxCounter || 0;
  transitionCounter = data.counters?.transitionCounter || 0;

  const svg = getOrCreateSVG();

  // 1. Reconstruir steps
  data.steps.forEach(sData => {
    const template = palette.querySelector(`.${sData.type}`);
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
    if (state === "active") {
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
    if (step.transitions && step.transitions.length > 0 && step.transitions[0].receptivity) {
      const receptivityLabel = clone.querySelector(".receptivity-label");
      if (receptivityLabel) {
        receptivityLabel.textContent = step.transitions[0].receptivity;
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
        from: { box: fromBox, connector: cData.fromConnector },
        to: { box: toBox, connector: cData.toConnector }
      };

      connections.push(connObj);
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

function clearDiagram() {
  if (confirm("Tem certeza que deseja limpar todo o diagrama? Essa ação não pode ser desfeita.")) {
    clearCanvasDOM();
    boxCounter = 0;
    transitionCounter = 0;
    localStorage.removeItem(STORAGE_KEY);
    console.log("Diagrama limpo com sucesso.");
  }
}

function exportDiagram() {
  saveDiagramToStorage();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    alert("Nenhum diagrama para exportar.");
    return;
  }
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grafcet_diagram_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
        saveDiagramToStorage();
        alert("Diagrama importado com sucesso!");
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

window.addEventListener("beforeunload", saveDiagramToStorage);
setTimeout(loadDiagramFromStorage, 100);

