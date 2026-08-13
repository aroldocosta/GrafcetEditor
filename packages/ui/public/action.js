class Action {
    /**
     * Cria uma nova Action
     * @param {Object} params
     * @param {string} params.id - Identificador único
     * @param {string} params.type - Tipo da ação
     * @param {Array<string>} [params.commands=[]] - Comandos da ação
     * @param {Array<Step>} [params.steps=[]] - Steps associados
     * @param {string} [params.qualifier=''] - Qualificador
     * @param {string} [params.description=''] - Descrição
     */
    constructor({
      id,
      type,
      commands = [],
      steps = [],
      qualifier = '',
      description = ''
    }) {
      this.id = id;
      this.type = type;
      this.commands = commands;
      this.steps = steps;
      this.qualifier = qualifier;
      this.description = description;
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
    }
  
    setDescription(desc) {
      this.description = desc;
    }
  }
  