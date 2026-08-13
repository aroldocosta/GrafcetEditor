class Transition {
    /**
     * Cria uma nova Transição
     * @param {Object} params
     * @param {string} params.id - Identificador único
     * @param {boolean} [params.triggered=false] - Se a transição está acionada
     * @param {string} [params.receptivity=''] - Expressão de receptividade
     * @param {string} [params.description=''] - Descrição da transição
     */
    constructor({
      id,
      triggered = false,
      receptivity = '',
      description = ''
    }) {
      this.id = id;
      this.triggered = triggered;
      this.receptivity = receptivity;
      this.description = description;
    }
  
    setTriggered(newState) {
      this.triggered = newState;
    }
  
    setReceptivity(expr) {
      this.receptivity = expr;
    }
  
    setDescription(desc) {
      this.description = desc;
    }
  }
  
