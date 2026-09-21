const fs=require('node:fs/promises');
const path=require('node:path');
function createRememberedLogin({file,safeStorage}){
  const available=()=>safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.()!=='basic_text';
  async function clear(){await fs.rm(file,{force:true});}
  async function read(){
    if(!available())return {available:false};
    try{const data=JSON.parse(safeStorage.decryptString(await fs.readFile(file)));if(typeof data.account!=='string'||typeof data.key!=='string')throw Error('invalid');return {...data,available:true};}
    catch(error){return {available:true,...(error.code==='ENOENT'?{}:{error:'已保存的登录信息无法解密，请重新输入。'})};}
  }
  async function save(account,key){
    if(!available())throw Error('Secure storage unavailable');
    if(typeof account!=='string'||typeof key!=='string'||!account||!key||account.length>64||key.length>128)throw Error('Invalid credentials');
    const encrypted=safeStorage.encryptString(JSON.stringify({account,key}));
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file+'.tmp',encrypted,{mode:0o600});await fs.rename(file+'.tmp',file);
  }
  return {read,save,clear};
}
module.exports={createRememberedLogin};
