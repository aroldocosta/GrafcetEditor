class Action {
    /**
     * Cria uma nova Action
     * @param {Object} params
     * @param {string|number} params.id - Identificador único
     * @param {string} [params.type='X'] - Tipo / Qualificador da ação
     * @param {Array<string>} [params.commands=[]] - Comandos da ação
     * @param {Array<Step>} [params.steps=[]] - Steps associados
     * @param {string} [params.qualifier='X'] - Qualificador (X, S, R, Z, T)
     * @param {string} [params.resourceType='Q'] - Tipo de recurso (Q, M, T, C, A)
     * @param {number} [params.channel=1] - Canal / ID do recurso (1..N)
     * @param {string} [params.target=''] - Alvo da bobina (ex: "Q1", "T2")
     * @param {string} [params.description=''] - Descrição
     * @param {number} [params.functionType] - Modo de operação do recurso (Timer, Contador, Comparador)
     * @param {number} [params.preset] - Preset / Valor Limite
     * @param {number} [params.offset] - Offset
     * @param {number} [params.port] - Porta analógica (Comparadores)
     */
    constructor({
      id,
      type = 'X',
      commands = [],
      steps = [],
      qualifier = 'X',
      resourceType = 'Q',
      channel = 1,
      target = '',
      description = '',
      functionType,
      preset,
      offset,
      port
    } = {}) {
      this.id = id;
      this.type = type || qualifier || 'X';
      this.commands = commands;
      this.steps = steps;
      this.qualifier = qualifier || type || 'X';
      this.resourceType = resourceType || 'Q';
      this.channel = Number(channel) || 1;
      this.target = target || `${this.resourceType}${this.channel}`;
      this.description = description || '';
      this.functionType = functionType;
      this.preset = preset;
      this.offset = offset;
      this.port = port;
    }
  
    addCommand(cmd) {
      this.commands.push(cmd);
    }
  
    removeCommand(cmd) {
      this.commands = this.commands.filter(c => c !== cmd);
    }
  
    addStep(step) {
      this.steps.push(step);
    }
  
    removeStep(step) {
      this.steps = this.steps.filter(s => s !== step);
    }
  
    setQualifier(qual) {
      this.qualifier = qual;
      this.type = qual;
    }
  
    setResourceType(res) {
      this.resourceType = res;
      this.target = `${this.resourceType}${this.channel}`;
    }

    setChannel(ch) {
      this.channel = Number(ch) || 1;
      this.target = `${this.resourceType}${this.channel}`;
    }

    setDescription(desc) {
      this.description = desc;
    }
  }

  