const { default: axios } = require("axios");
const express = require("express");
const app = express();

const CONFIG = {
    REQUEST_TIMEOUT: 5000,
    RETRY_ATTEMPTS: 3,
    CIRCUIT_BREAKER_THRESHOLD: 5,
    CIRCUIT_BREAKER_RESET_TIMEOUT: 30000,
    HEALTH_CHECK_INTERVAL: 5000,
};

app.use(express.json());

const machines = [
    {
        status: "active",
        connections: 0,
        maxConnections: 1000,
        lastResponseTime: 0,
        host: "127.0.0.1",
        port: 3001,
        failureCount: 0,
        lastFailureTime: null,
        circuitBreakerStatus: "closed", 
    },
    {
        status: "active",
        connections: 0,
        maxConnections: 100,
        lastResponseTime: 0,
        host: "127.0.0.1",
        port: 3002,
        failureCount: 0,
        lastFailureTime: null,
        circuitBreakerStatus: "closed",
    },
    {
        status: "active",
        connections: 0,
        maxConnections: 100,
        lastResponseTime: 0,
        host: "127.0.0.1",
        port: 3003,
        failureCount: 0,
        lastFailureTime: null,
        circuitBreakerStatus: "closed",
    },
];

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    console.log(
        `Request Method: ${req.method}, Request URL: ${req.originalUrl}`
    );
    console.count("request count");
    next();
});

app.post("/register", async (req, res) => {
    const { host, port, maxConnections } = req.body;
    if (!host || !port || !maxConnections) {
        return res.status(400).send("Missing required fields");
    }

    const existingMachine = machines.find(
        (machine) => machine.host === host && machine.port === port
    );

    if (existingMachine) {
        return res.status(409).send("Machine already registered");
    }

    const startTime = new Date().getTime();
    await axios.get(`http://${host}:${port}`);
    const endTime = new Date().getTime();

    const newMachine = {
        status: "active",
        connections: 0,
        maxConnections,
        lastResponseTime: endTime - startTime,
        host,
        port,
    };
    machines.push(newMachine);
    res.status(201).send("Machine registered successfully");
});

app.post("/deregister", async (req, res) => {
    const { host, port } = req.body;
    if (!host || !port) {
        return res.status(400).send("Missing required fields");
    }

    const existingMachine = machines.find(
        (machine) => machine.host === host && machine.port === port
    );

    if (!existingMachine) {
        return res.status(404).send("Machine not found");
    }

    const index = machines.findIndex(
        (machine) => machine.host === host && machine.port === port
    );
    machines.splice(index, 1);
    return res.status(200).send("Machine deregistered successfully");
});

app.use(async (req, res, next) => {
    const availableMachines = machines.filter(
        (machine) =>
            machine.status === "active" &&
            machine.connections < machine.maxConnections &&
            (machine.circuitBreakerStatus === "closed" ||
                machine.circuitBreakerStatus === "half-open")
    );

    // Sort by load and response time for better load distribution
    const targetMachine = availableMachines.sort((a, b) => {
        const loadA = a.connections / a.maxConnections;
        const loadB = b.connections / b.maxConnections;
        return loadA - loadB || a.lastResponseTime - b.lastResponseTime;
    })[0];

    const path = req.originalUrl;

    if (targetMachine) {
        targetMachine.connections++;
        const startTime = new Date().getTime();

        try {
            const proxiedResponse = await tryRequest(targetMachine, {
                url: `http://${targetMachine.host}:${targetMachine.port}${path}`,
                headers: req.headers,
                method: req.method,
                data: req.body,
            });

            const endTime = new Date().getTime();
            targetMachine.lastResponseTime = endTime - startTime;
            targetMachine.connections--;

            return res
                .status(proxiedResponse.status)
                .send(proxiedResponse.data);
        } catch (error) {
            targetMachine.connections--;

            // Try next available machine if exists
            const remainingMachines = availableMachines.filter(
                (m) => m !== targetMachine
            );
            if (remainingMachines.length > 0) {
                req.retryCount = (req.retryCount || 0) + 1;
                if (req.retryCount <= CONFIG.RETRY_ATTEMPTS) {
                    return next();
                }
            }
        
            return res
                .status(503)
                .send("Service Unavailable - Request failed after retries");
        }
    } else {
        return res
            .status(503)
            .send("Service Unavailable - No machines available");
    }
});

app.listen(3000, () => {
    console.log("Load balancer listening on port 3000");
});

setInterval(async () => {
    for (const machine of machines) {
        const isHealthy = await healthCheck(machine.host, machine.port);
        updateMachineStatus(machine, isHealthy);
    }
}, CONFIG.HEALTH_CHECK_INTERVAL);

async function healthCheck(host, port) {
    try {
        const response = await axios.get(`http://${host}:${port}/health`, {
            timeout: CONFIG.REQUEST_TIMEOUT,
        });
        return response.status >= 200 && response.status < 500;
    } catch (error) {
        return false;
    }
}

function updateMachineStatus(machine, isHealthy) {
    if (!isHealthy) {
        machine.failureCount++;
        machine.lastFailureTime = Date.now();

        if (machine.failureCount >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
            machine.circuitBreakerStatus = "open";
            machine.status = "inactive";
        }
    } else {
        machine.failureCount = 0;
        machine.lastFailureTime = null;

        if (machine.circuitBreakerStatus === "open") {
            const timeInOpenState = Date.now() - machine.lastFailureTime;
            if (timeInOpenState >= CONFIG.CIRCUIT_BREAKER_RESET_TIMEOUT) {
                machine.circuitBreakerStatus = "half-open";
            }
        } else if (machine.circuitBreakerStatus === "half-open") {
            machine.circuitBreakerStatus = "closed";
            machine.status = "active";
        }
    }
}

async function tryRequest(machine, config) {
    let lastError;
    for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
        try {
            const response = await axios.request({
                ...config,
                timeout: CONFIG.REQUEST_TIMEOUT,
            });
            updateMachineStatus(machine, true);
            return response;
        } catch (error) {
            lastError = error;
            updateMachineStatus(machine, false);
            if (attempt === CONFIG.RETRY_ATTEMPTS) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
    }
    throw lastError;
}
