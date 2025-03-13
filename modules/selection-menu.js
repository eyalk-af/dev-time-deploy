const {readLine, wrapInGreen} = require("./script_utils");

class MenuItem {
    value;
    displayName;

    constructor(value, displayName) {
        this.value = value;
        this.displayName = displayName;
        this.selected = false;
    }
}

const SEPARATOR = "---------------------------------------------------------";

module.exports.SelectionMenu = class SelectionMenu {
    title;
    prompt;
    processor;

    constructor(title, values = [], nameProperty = '') {
        this.title = title;
        this.items = [];
        for (const value of values) {
            this.addItem(value[nameProperty], value);
        }
    }

    addItem(displayName, value,) {
        this.items.push(new MenuItem(value, displayName));
    }

    setSelectedValue(value) {
        for (const item of this.items) {
            item.selected = item.value === value;
        }
    }

    setInputProcessor(processor) {
        this.processor = processor;
    }

    setSelectedIndex(index) {
        for (let i = 0; i < this.items.length; i++) {
            this.items[i].selected = i === index;
        }
    }

    async show() {
        while (true) {
            try {
                let value = await this.promptMenu();
                console.log(SEPARATOR);
                return value;
            } catch (e) {
                console.log(e.message);
                await readLine("Press enter to retry");
            }
        }
    }

    async promptMenu() {
        console.log(SEPARATOR);
        console.log(this.title);
        console.log(SEPARATOR);
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            console.log(`${i + 1}. ${item.name}`);
        }
        console.log(SEPARATOR);
        let value;
        let answer = await readLine(this.prompt);
        let isNumber = !isNaN(parseInt(answer));
        if (isNumber) {
            let index = parseInt(answer);
            index--;
            if (index >= 0 && index <= item.length - 1) {
                value = this.items[index].value;
                return (value);
            } else {
                throw new Error("Invalid number");
            }
        } else {
            if (this.processor) {
                return await this.processor(answer);
            } else {
                throw new Error("Invalid number");
            }
        }
    }

}

async function selectService() {
    async function promptService() {
        let services = configuration.services;
        console.log(SEPARATOR);
        console.log("   Recent Services:");
        console.log(SEPARATOR);

        let answer;
        if (services.length === 0) {
            console.log("-- No recent services --");
            answer = (await readLine('Enter service directory path: ')).trim();
        } else {
            for (let i = 0; i < services.length; i++) {
                const service = services[i];
                let selected = i === 0 ? ">>" : "  ";

                let message = `${selected}${lz(i + 1)}. ${service.name}`;
                if (i === 0) {
                    message = wrapInGreen(message);
                }
                console.log(message);
            }
            console.log(SEPARATOR);
            answer = (await readLine("Select a service or enter directory path: ")).trim();
        }

        let index = parseInt(answer);
        if (isNaN(index)) {
            if (answer === '') {
                index = 0;
            } else {
                return buildServiceData(answer);
            }
        } else {
            index--;
        }

        if (index >= 0 && index <= services.length - 1) {
            return services[index];
        } else {
            throw new Error("Invalid service number");
        }
    }

    let service = null;
    while (!service) {
        try {
            service = await promptService();
            process.stdout.write(MOVE_CURSOR_UP);
            console.log("Selected service: " + wrapInGreen(service.name));
            console.log(SEPARATOR);
            console.log("");
        } catch (e) {
            console.log(e.message);
            console.log("Press any key to retry");
            await readLine();
            console.log();
            console.log();
        }
    }

    let index = configuration.services.findIndex(x => x.name === service.name);
    if (index !== -1) {
        configuration.services.splice(index, 1);
    }
    configuration.services.unshift(service);
    saveConfiguration();

    selectedService = service;
}
