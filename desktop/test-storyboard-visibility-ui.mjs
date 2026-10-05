// Real compiled workbench in Electron; isolated data and fake account authorization.
import {createRequire} from 'node:module';
import {app,BrowserWindow,dialog} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const stage=path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-storyboard-visible-'));
app.setPath('userData',root);
const auth=require(path.join(stage,'access-session.cjs'));
const Original=auth.AccessSession;
auth.AccessSession=class extends Original {
  constructor(options){super({...options,request:async()=>Response.json({token:'test-session',user:{id:'11111111-1111-4111-8111-111111111111',account:'test-member',role:'member',expires_at:Date.now()+600000},server_time:Date.now(),session_expires_at:Date.now()+600000})});}
};
dialog.showMessageBox=async()=>({response:0});
dialog.showMessageBoxSync=()=>1;
const updates=require(path.join(stage,'software-update.cjs'));
const OriginalUpdate=updates.SoftwareUpdate;
updates.SoftwareUpdate=class extends OriginalUpdate {
  constructor(options){super({...options,fetch:async()=>{throw Error('isolated UI test: updates disabled');}});}
};
require(path.join(stage,'main.cjs'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
setTimeout(()=>{console.error('Visibility test timeout');app.exit(1);},60000).unref();
void app.whenReady().then(async()=>{
  try {
    let win;
    for(let i=0;i<150;i++){
      win=BrowserWindow.getAllWindows()[0];
      if(win && await win.webContents.executeJavaScript("!!document.querySelector('#access-account')").catch(()=>false))break;
      await delay(100);
    }
    assert(win);
    const js=code=>win.webContents.executeJavaScript(code);
    for(let i=0;i<150;i++) {
      if(await js("!!document.querySelector('.access-submit:not(:disabled)')"))break;
      await delay(100);
    }
    assert(await js("!!document.querySelector('.access-submit:not(:disabled)')"),'login must be ready before filling credentials');
    await js(`(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','test-key']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await delay(100);
    await js("document.querySelector('.access-card form').requestSubmit()");
    for(let i=0;i<200;i++){
      if(await js("!!document.querySelector('.storyboard-row')").catch(()=>false))break;
      await delay(100);
    }
    const checks=[];
    for(const width of [1450,1024,760]){
      win.setSize(width,820);await delay(150);
      const state=await js(`(()=>{const row=document.querySelector('.storyboard-row');const panel=row?.closest('.panel');const rect=row?.getBoundingClientRect();return {rows:document.querySelectorAll('.storyboard-row').length,assetVisible:!!document.querySelector('.asset-summary')?.getBoundingClientRect().height,panelDisplay:panel&&getComputedStyle(panel).display,rowHeight:rect?.height||0,rowWidth:rect?.width||0};})()`);
      await fs.writeFile(path.join(root,`storyboard-${width}.png`),(await win.webContents.capturePage()).toPNG());
      assert(state.rows>0,'fixture must contain storyboard data');
      assert(!state.assetVisible,'storyboard asset summary must be removed');
      assert(state.rowHeight>0 && state.rowWidth>0,`storyboard must remain visible after the asset panel: ${JSON.stringify(state)}`);
      checks.push({width,...state});
    }
    await js("document.querySelector('.theme-toggle').click()");await delay(150);
    assert(await js("document.querySelector('.storyboard-row').getBoundingClientRect().height>0"));
    await fs.writeFile(path.join(root,'storyboard-dark.png'),(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({passed:true,checks,screenshots:root}));
    win.destroy();app.quit();
  }catch(error){console.error(error);console.error('Screenshots: '+root);app.exit(1);}
});
