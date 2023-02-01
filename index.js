const express = require('express')
const ftp = require("basic-ftp") 
const fs = require('fs')
const app = express()
const port = 3003
const CryptoJS = require("crypto-js");
const dotenv = require('dotenv');
const fileUpload = require('express-fileupload');
const ObjectID = require('bson').ObjectID;
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
      account: originalText.split('/')[1], 
      project: originalText.split('/')[2], 
      survey: originalText.split('/')[3], 
      response: originalText.split('/')[4], 
      id: originalText.split('/')[5]
    }
    return result
  } catch (error) {
    console.log(error)
    return null 
  }
}
// Decrypt Upload Key
function decryptKey(cipher) {
  
  const cryptkey = CryptoJS.enc.Utf8.parse(process.env.PRIVATE_KEY);
  const cryptiv = CryptoJS.enc.Utf8.parse(process.env.IV);

  // Decryption
  const crypted = CryptoJS.enc.Base64.parse(cipher.toString());
  var bytes = CryptoJS.AES.decrypt({ ciphertext: crypted }, cryptkey, {
      iv: cryptiv,
      mode: CryptoJS.mode.CTR,
  });

  try {
    var originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText;
  } catch (error) {
    console.log(error);
    return false;
  }
}
// Verify key
function verifyKey(key) {
  var mins = parseInt(key.slice(0,8))
  var serverMins = parseInt(new Date().getTime().toString().slice(0,8))
  if (mins == serverMins) return true
  else return false
}
// Random String Generation
function generateString(length) {
  let result = '';
  const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for ( let i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

async function UPLOADITEM(account, project, survey, response, filename) {
  const client = new ftp.Client()
  client.ftp.verbose = process.env.NODE_ENV == 'dev' ? true : false
  try {
    await client.access({
        host: process.env.FTP_ADDRESS,
        user: process.env.FTP_USERNAME,
        password: process.env.FTP_PASSWORD,
    })
    await client.ensureDir(`/accounts/${account}/${project}/${survey}/${response}`)
    await client.clearWorkingDir()
    var result = await client.uploadFrom("temp/"+filename,`/accounts/${account}/${project}/${survey}/${response}/${filename}`).catch((err) => console.log(err))
    client.close()
    return result;
  }
  catch(err) {
      client.close()
      return {code: -1}
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
app.use(fileUpload());

app.get('/file/static/:path', async (req, res) => {
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
/*
  /file/upload?
  ext=<file-extention>
  &response=<response-id>
  &project=<project-name>
  &survey=<short-survey-id>
  &account=<short-org-id>

  Header:
    seckey:<secret-key>
  Body:
    enc-type: form-data/multipart
    name: file
*/
app.post('/file/upload', async (req, res) => {
  let uploadPath;
  let ext = req.query.ext;
  let response = req.query.response;
  let survey = req.query.survey;
  let project = req.query.project;
  let account = req.query.account;
  let key = req.header('seckey');

  if (!verifyKey(decryptKey(key)))
    return res.status(401).send('Unauthorized')
  
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded');
  }
  
  // Grab the file
  var theFile = req.files.file;
  
  // File Type Check
  if (!["application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "video/mp4",
        "image/png",
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.rar",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
        "text/plain"
      ].includes(theFile.mimetype))
    return res.status(403).send("Invalid File Type")
  
  // Generated Random File name and upload to /temp
  var rnd_file_name = generateString(12);
  uploadPath = __dirname + '/temp/'+rnd_file_name+'.'+ext;

  // Use the mv() method to place the file somewhere on your server
  theFile.mv(uploadPath, async function(err) {
    if (err)
      return res.status(500).send(err);
    // Then send to FTP
    try {
      var result = await UPLOADITEM(account, project, survey, response, rnd_file_name+'.'+ext)
      if (result.code >= 200 || result.code <= 300)
        return res.status(200).json({fn: rnd_file_name+'.'+ext})
      else 
        return res.status(500).send("Something went wrong")
    } catch (error) {
      return res.status(500).send("Something went wrong")
    }
  });
})

app.listen(port, () => {
  console.log(`File server listening on port ${port}`)
})
