class Step {
    /**
     * Cria uma nova Step
     * @param {string} type - Tipo da step ("start_step" ou "active_step")
     * @param {HTMLElement} boxElement - Elemento HTML da step
     * @param {string} state - Estado inicial ("active" ou "inactive")
     */
    constructor(type, boxElement, state) {
      this.type = type;
      this.element = boxElement;
      this.inputs = [];
      this.outputs = [];
      this.actions = [];
      this.transitions = [];
      this.state = state;
      this.id = null;
    }
  }
  
  function createTransitionForStep(step) {
    const newTransition = new Transition({
      id: ++transitionCounter,
      triggered: false,
      receptivity: '',
      inputSteps: [],
      outputSteps: [],
      description: ''
    });
    step.transitions.push(newTransition);
  }
  
  function printSteps() {
    console.clear();
    stepsList.forEach(step => {
      //console.log("Step: ", step);
    });
  }