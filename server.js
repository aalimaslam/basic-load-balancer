const express = require('express');
const app = express();

app.use(express.json());

app.use((req,res,next)=>{
    if(req.originalUrl === '/health') next();
    console.log(`Request received at ${req.originalUrl} on port ${process.env.PORT}`);
    console.count(`Request count on ${process.env.PORT}`)
    next();
})

app.get('/', (req,res)=>{
    const randomNum = Math.random() * 2000;
    setTimeout(() => {
        res.send(`Hello from the test server! ${process.env.PORT}`);
    }, randomNum);
});


app.listen(process.env.PORT || 3001, ()=> {
    console.log('Server is running on port', process.env.PORT || 3001);
})