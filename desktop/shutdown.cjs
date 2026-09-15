const {spawn} = require('node:child_process');
const path = require('node:path');
const alive = child => !!child && child.exitCode === null && child.signalCode == null;
async function terminateBackend(child) {
  if (!alive(child)) return;
  if (process.platform !== 'win32') { child.kill('SIGKILL'); return; }
  // Only this app's owned backend tree; never kill by image name or include account Chrome windows.
  await new Promise(resolve => {
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'), ['/PID',String(child.pid),'/T','/F'], {shell:false, windowsHide:true, stdio:'ignore'});
    const timeout = setTimeout(resolve, 1500);
    const done = () => {clearTimeout(timeout);resolve();};
    killer.once('error', done);killer.once('exit', done);
  });
}
function createShutdown({getBackend, stopHelper, log, exit, forceBackend = terminateBackend, graceMs = 5000, helperMs = 2000}) {
  let running;
  return () => running ||= new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if(finished)return;finished=true;clearTimeout(deadline);
      let didExit=false;
      const complete=()=>{if(didExit)return;didExit=true;clearTimeout(flushDeadline);exit(0);resolve();};
      const flushDeadline=setTimeout(complete,200);
      void Promise.resolve().then(()=>log('Shutdown complete.')).catch(()=>{}).finally(complete);
    };
    // Register the deadline before IPC/cleanup: synchronous failures must not disable the fallback.
    const deadline = setTimeout(() => {
      void log('Shutdown deadline reached; terminating owned backend tree.');
      void Promise.resolve().then(()=>forceBackend(getBackend())).catch(()=>log('Backend termination failed.')).finally(finish);
    }, graceMs);
    void (async () => {
      void log('Shutdown started after windows accepted closing.');
      let helperTimer;
      try {
        await Promise.race([
          Promise.resolve().then(stopHelper),
          new Promise(resolve=>{helperTimer=setTimeout(()=>{void log('Helper stop timed out; continuing shutdown.');resolve();},helperMs);}),
        ]);
        void log('Helper stop stage finished.');
      } catch { void log('Helper stop failed; continuing shutdown.'); }
      finally { clearTimeout(helperTimer); }
      if (finished) return;
      const child=getBackend();
      if (!alive(child)) { finish(); return; }
      child.once('exit', finish);
      if (!child.connected) { void log('Backend IPC disconnected; waiting for exit/deadline.'); return; }
      try {
        child.send({type:'stop'}, error=>{ if(error)void log('Backend stop IPC failed; deadline remains active.'); });
        void log('Backend stop requested.');
      } catch { void log('Backend stop IPC threw; deadline remains active.'); }
    })().catch(()=>{void log('Unexpected shutdown failure; deadline remains active.');});
  });
}
module.exports = {createShutdown, terminateBackend};
