const express = require('express')
const ftp = require("basic-ftp") 
const fs = require('fs')
const app = express()
const port = 3003
const CryptoJS = require("crypto-js");
const dotenv = require('dotenv');
dotenv.config(); // Configure to access .env files

// CLEAR /temp folder
setInterval(() => {
  fs.readdirSync(__dirname+'/temp').forEach(f => fs.rmSync(`${__dirname+'/temp'}/${f}`));
}, 600000*12)

// Decryption
function decryptedPath(cipher) {
  try {
    var decrypted = CryptoJS.Rabbit.decrypt(cipher, process.env.PRIVATE_KEY);
    var originalText = decrypted.toString(CryptoJS.enc.Utf8);
    var result = {
      account: originalText.split('/')[0], 
      project: originalText.split('/')[1], 
      survey: originalText.split('/')[2], 
      response: originalText.split('/')[3], 
      id: originalText.split('/')[4]
    }
    return result
  } catch (error) {
    console.log(error)
    return null 
  }
}

async function DOWNLOADITEM(account, project, survey, response, id) {
  const client = new ftp.Client()
  client.ftp.verbose = process.env.NODE_ENV == 'dev' ? true : false
  try {
    await client.access({
        host: process.env.FTP_ADDRESS,
        user: process.env.FTP_USERNAME,
        password: process.env.FTP_PASSWORD,
    })
    var result = await client.downloadTo("temp/"+id,`/accounts/${account}/${project}/${survey}/${response}/${id}`).catch((err) => console.log(err))
    client.close()
    return result;
  }
  catch(err) {
      client.close()
      return {code: -1}
  }
}

app.use(express.static('temp'));

app.get('/static/:path', async (req, res) => {
  // Decrypt URL
  const encryptedPath = req.params.path.replaceAll('*', '/');
  if (decryptedPath(encryptedPath) != null) {
    var account = decryptedPath(encryptedPath).account;
    var project = decryptedPath(encryptedPath).project;
    var survey = decryptedPath(encryptedPath).survey;
    var response = decryptedPath(encryptedPath).response;
    var id = decryptedPath(encryptedPath).id;
  } else
    return res.status(500).send("Something went wrong")
    
  // Find in Cache
  fs.readdirSync(__dirname+'/temp').forEach(file => {
    if (id == file)
      return res.status(200).sendFile('./temp/'+id, { root: __dirname });
  });

  try {
    var result = await DOWNLOADITEM(account, project, survey, response, id) 
    if (result.code >= 200 || result.code <= 300)
      return res.status(200).sendFile('./temp/'+id, { root: __dirname });
    else 
      return res.status(500).send("Something went wrong")
  } catch (error) {
    return res.status(500).send("Something went wrong")
  }
})

app.listen(port, () => {
  console.log(`File server listening on port ${port}`)
})