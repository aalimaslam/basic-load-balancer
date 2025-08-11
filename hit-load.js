const { default: axios } = require("axios");

for(let i = 0; i < 1_000; i++){
    axios.get('http://localhost:3000');
}