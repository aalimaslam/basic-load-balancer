# Basic Load Balancer
This is a robust load balancer that distributes traffic based on connection load, response time, and health status of target servers.

## Features

- Advanced Load Distribution (based on connection count and response time)
- Circuit Breaker Pattern
- Automatic Retry Mechanism
- Health Check System
- Register/Deregister Machines Dynamically
- Fault Tolerance with Failover
- Configurable Timeouts and Thresholds

## Architecture

The system consists of three components:
1. Load Balancer (index.js) - Handles traffic distribution
2. Target Servers (server.js) - Multiple instances running on different ports
3. Load Testing Tool (hit-load.js) - For testing the load balancer

## Setup and Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the target servers (this will open separate terminals for each server):
   ```bash
   npm run servers
   ```

3. In a new terminal, start the load balancer:
   ```bash
   node index.js
   ```
   The load balancer will run on port 3000.

4. (Optional) Run the load testing tool:
   ```bash
   node hit-load.js
   ```

## Configuration

The load balancer can be configured through the CONFIG object in index.js:
- REQUEST_TIMEOUT: 5000ms
- RETRY_ATTEMPTS: 3
- CIRCUIT_BREAKER_THRESHOLD: 5
- CIRCUIT_BREAKER_RESET_TIMEOUT: 30000ms
- HEALTH_CHECK_INTERVAL: 5000ms

## API Endpoints

- `POST /register` - Register a new server
- `POST /deregister` - Remove a server
- Health checks are performed automatically every 5 seconds