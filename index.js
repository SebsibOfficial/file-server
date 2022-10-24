const express = require('express')
const ftp = require("basic-ftp") 

// const app = express()
// const port = 3003

example()

async function example() {
    const client = new ftp.Client()
    client.ftp.verbose = true
    try {
        await client.access({
            host: "127.0.0.1",
            user: "yoseph",
            password: "ftpserver",
            secure: true,
            secureOptions: { rejectUnauthorized: false }
        })
        console.log(await client.list())
    }
    catch(err) {
        console.log(err)
    }
    client.close()
}

// app.get('/', (req, res) => {
//   var fileID = req.params.id;
  
//   res.send('Hello World! JUST EDITEDD')
// })

// app.listen(port, () => {
//   console.log(`File server listening on port ${port}`)
// })