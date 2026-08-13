function compile(steps) {
    let stepsStr = "";
    let length = stepsList.length

    stepsList.forEach((s, index) => {
        let item = "!M" + s.id; 
        if(index < length - 1) item += "*";
        console.log(item)
        stepsStr += item;
    });
    console.log("SM1=" + stepsStr + "+M"+stepsList[0].inputs[0]);
}


