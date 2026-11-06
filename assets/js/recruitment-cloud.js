/* Recruitment Hub Supabase cloud adapter.
   Enabled only with a configured public project URL and publishable/anon key.
   Never pass service_role secrets to the browser.
*/
(function(){
  'use strict';
  const config=window.RW_RECRUITMENT_CLOUD||{};
  if(!config.url||!config.anonKey||!document.documentElement.classList.contains('rh-cloud-configured'))return;
  const bridge=window.RHRecruitmentBridge;
  const $=id=>document.getElementById(id);
  const gate=$('rhCloudGate'),form=$('rhCloudLoginForm'),message=$('rhCloudMessage'),joinPanel=$('rhCloudJoinPanel');
  const badge=$('rhCloudBadge'),syncLabel=$('rhCloudSyncStatus');
  const actor=$('actorSelect');
  const remoteVersions=new Map();
  const savedJobs=new Map();
  let client=null,sessionUser=null,member=null,ready=false,syncing=false,saveQueued=false;
  let refreshTimer=0,subscription=null,authSubscription=null,blocked=false,recoveryMode=false;
  const originals=['connectDisk','saveDiskNow','importJsonBtn','importCsvBtn','resetDemo'];
  const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function status(value,isError){
    if(syncLabel){syncLabel.textContent=value;syncLabel.style.color=isError?'#b3261e':'#137333'}
    const dataStatus=$('storageStatus');if(dataStatus)dataStatus.textContent=value;
  }
  function loginMessage(value,isError=false){
    if(message){message.textContent=value;message.style.color=isError?'#b3261e':'#5f6368'}
  }
  function access(mode){
    const isReady=mode==='ready'&&!recoveryMode;
    document.documentElement.classList.toggle('rh-cloud-ready',isReady);
    if(gate)gate.hidden=isReady;
    if(badge)badge.textContent=isReady?'Shared database · '+member.csp_name:'Shared database · sign in';
  }
  function exportEmergency(){
    const data=bridge.getState();
    const blob=new Blob([JSON.stringify({version:6,exportedAt:new Date().toISOString(),reason:'Unsynced cloud changes',...data},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='recruitment-unsynced-backup.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function setBlocked(error){
    blocked=true;ready=false;
    status('NOT SAVED to cloud: '+String(error?.message||error),true);
    const panel=$('rhCloudError');
    if(panel){panel.hidden=false;$('rhCloudErrorText').textContent='Cloud write failed: '+String(error?.message||error)+'. Export your unsynced changes before reloading.'}
    console.error('Recruitment Cloud error:',error);
  }
  const api={
    get ready(){return ready&&!blocked},
    get identity(){return member?.csp_name||''},
    persist(){queueSave()},
    logout:async()=>{ready=false;await client?.auth.signOut();clearTeam();access('locked');loginMessage('Signed out.');}
  };
  window.RHCloud=api;
  function clearTeam(){
    if(subscription){client?.removeChannel(subscription);subscription=null}
    member=null;sessionUser=null;ready=false;syncing=false;saveQueued=false;blocked=false;recoveryMode=false;
    if($('rhCloudLoginForm'))$('rhCloudLoginForm').hidden=false;
    if($('rhCloudRecoveryForm'))$('rhCloudRecoveryForm').hidden=true;
    if($('rhCloudRequestReset'))$('rhCloudRequestReset').hidden=false;
    if(joinPanel)joinPanel.hidden=true;
    if($('rhCloudAdminTools'))$('rhCloudAdminTools').hidden=true;
    savedJobs.clear();remoteVersions.clear();
    actor.disabled=false;actor.value='';
    bridge.replaceState({jobs:[],history:[]});
    if($('rhCloudError'))$('rhCloudError').hidden=true;
  }
  async function loadServerData(force=false){
    if(!member)return;
    if((syncing||saveQueued||$('modal')?.classList.contains('open'))&&!force){
      scheduleRefresh();return;
    }
    const [jobsResult,historyResult]=await Promise.all([
      client.from('rh_jobs').select('job_id,data,version').order('updated_at',{ascending:false}).limit(10000),
      client.from('rh_history').select('job_id,job_number,owner_name,actor_name,action,details,created_at').order('created_at',{ascending:false}).limit(10000)
    ]);
    if(jobsResult.error)throw jobsResult.error;
    if(historyResult.error)throw historyResult.error;
    const jobs=(jobsResult.data||[]).map(x=>x.data);
    const history=(historyResult.data||[]).map(row=>({
      jobId:row.job_id,number:row.job_number,owner:row.owner_name,
      actor:row.actor_name,action:row.action,detail:row.details,at:row.created_at
    }));
    savedJobs.clear();remoteVersions.clear();
    for(const row of jobsResult.data||[]){
      savedJobs.set(row.job_id,JSON.stringify(row.data));
      remoteVersions.set(row.job_id,row.version);
    }
    bridge.replaceState({jobs,history});
    updateLocalMigrationBanner();
    status('Synced · '+new Date().toLocaleTimeString('en-GB'));
  }

  function updateLocalMigrationBanner(){
    const panel=$('rhCloudMigrationBanner');
    if(!panel)return;
    panel.hidden=true;
    if(member?.role!=='admin')return;
    let local;
    try{local=JSON.parse(localStorage.getItem('recruitment-hub-v3')||'null')}catch(_){return}
    if(!Array.isArray(local?.jobs)||!local.jobs.length)return;
    const cloud=bridge.getState().jobs||[];
    const ids=new Set(cloud.map(j=>String(j.id)));
    const numbers=new Set(cloud.map(j=>String(j.number||'').trim().toLowerCase()));
    const count=local.jobs.filter(j=>!ids.has(String(j.id))&&!numbers.has(String(j.number||'').trim().toLowerCase())).length;
    if(!count)return;
    $('rhCloudMigrationCount').textContent=count+' original local jobs have not been imported. Notes are included and your browser copy will remain intact.';
    panel.hidden=false;
  }
  function lastActionFor(id,state){
    return (state.history||[]).find(h=>String(h.jobId||'')===String(id))
      ||(state.history||[]).find(h=>state.jobs.some(j=>j.id===id&&j.number===h.number))
      ||{action:'Updated',detail:'CSP updated job data'};
  }
  async function saveOne(id,data,history){
    const expected=remoteVersions.get(id)||0;
    const act=lastActionFor(id,history);
    const result=await client.rpc('rh_apply_change',{
      p_job_id:id,p_data:data,p_expected_version:expected,
      p_action:act.action||'Updated',p_details:act.detail||''
    });
    if(result.error)throw result.error;
    const version=Number(result.data);
    if(data===null){remoteVersions.delete(id);savedJobs.delete(id)}
    else{remoteVersions.set(id,version);savedJobs.set(id,JSON.stringify(data))}
  }
  function diff(snapshot){
    const changes=[];
    const live=new Map((snapshot.jobs||[]).map(j=>[String(j.id),j]));
    for(const [id,j] of live){
      if(!savedJobs.has(id)||savedJobs.get(id)!==JSON.stringify(j))changes.push({id,data:j});
    }
    for(const id of savedJobs.keys()){
      if(!live.has(id))changes.push({id,data:null});
    }
    return changes;
  }
  function queueSave(){
    if(!ready||blocked){status('Not signed in. Cloud save blocked.',true);return;}
    saveQueued=true;
    status('Syncing changes with shared database...');
    if(!syncing)void flush();
  }
  async function flush(){
    if(syncing||blocked||!ready)return;
    syncing=true;
    try{
      while(saveQueued&&!blocked){
        saveQueued=false;
        const snapshot=bridge.getState();
        const changes=diff(snapshot);
        for(const change of changes){
          await saveOne(change.id,change.data,snapshot);
        }
      }
      // All writes confirmed, now read server-canonical actor IDs/timestamps.
      syncing=false;
      await loadServerData();
    }catch(error){
      syncing=false;
      setBlocked(error);
    }
  }
  function scheduleRefresh(){
    if(refreshTimer)clearTimeout(refreshTimer);
    refreshTimer=setTimeout(async()=>{
      refreshTimer=0;
      if(!ready||blocked)return;
      if(syncing||saveQueued||$('modal')?.classList.contains('open')){scheduleRefresh();return;}
      try{await loadServerData()}catch(error){status('Connection error: '+error.message,true)}
    },1100);
  }
  function disableDangerousLocalOperations(){
    for(const id of originals){
      const item=$(id);if(item){item.disabled=true;item.title='Disabled in authenticated shared mode to protect team data'}
    }
    const storage=$('storageStatus');
    if(storage)storage.textContent='Shared database connected · edits are saved to Supabase, not to local disk';
    const title=storage?.closest('.panel')?.querySelector('h3');
    if(title)title.textContent='Shared database and backups';
    const paragraphs=storage?.closest('.panel')?.querySelectorAll('p.muted.small')||[];
    if(paragraphs.length>1)paragraphs[paragraphs.length-1].textContent='All CSP changes are written to the shared database. Local restore, CSV import and disk synchronisation are disabled in cloud mode. Use JSON backups for recovery.';
    const notice=document.querySelector('.notice');
    if(notice){
      const label=notice.querySelector('b');if(label)label.textContent='Secure team workspace';
      const copy=[...notice.childNodes].find(node=>node.nodeType===3&&node.textContent.includes('All CSPs'));
      if(copy)copy.textContent=' · Every CSP can edit job cards. Changes are synchronized in Supabase and recorded under a verified account. Completed jobs remain on CSP cards for at least 7 full days, then move to Closed on Saturday at 12:00 Amsterdam time.';
    }
    const note=$('rhCloudImportHelp');
    if(note)note.hidden=member?.role!=='admin';
    const importButton=$('rhCloudImportLocal');
    if(importButton)importButton.hidden=member?.role!=='admin';
    const importBackup=$('rhCloudImportBackup');
    if(importBackup)importBackup.hidden=member?.role!=='admin';
  }
  async function importLocal(sourceJobs){
    if(!ready||member.role!=='admin')return;
    // Merge only records with new IDs and job numbers; never overwrite cloud jobs.
    await loadServerData(true);
    let local;
    try{local=sourceJobs?{jobs:sourceJobs}:JSON.parse(localStorage.getItem('recruitment-hub-v3')||'null')}
    catch(_){}
    if(!local||!Array.isArray(local.jobs)||!local.jobs.length){
      alert('No jobs found. Use the original browser or choose a saved Recruitment Hub JSON backup.');return;
    }
    const existing=bridge.getState().jobs;
    const ids=new Set(existing.map(j=>String(j.id)));
    const numbers=new Set(existing.map(j=>String(j.number).trim().toLowerCase()));
    const unique=local.jobs.filter(j=>!ids.has(String(j.id))&&!numbers.has(String(j.number||'').trim().toLowerCase()));
    const skipped=local.jobs.length-unique.length;
    if(!unique.length){alert('No new jobs to import. '+skipped+' already exist by ID or job number. No cloud records were changed.');return;}
    if(!confirm('Import '+unique.length+' NEW jobs to shared database? '+skipped+' duplicates will be skipped, never overwritten. A local JSON copy will remain unchanged.'))return;
    $('rhCloudImportLocal').disabled=true;
    try{
      for(const job of unique){
        if(!job?.id||!job.owner||!job.number||!job.title)throw new Error('Invalid job in local backup');
        await saveOne(String(job.id),job,{history:[{jobId:job.id,action:'Imported',detail:'Admin imported local job and notes'}],jobs:[job]});
      }
      await loadServerData(true);status('Imported '+unique.length+' new jobs to the shared database');
      alert('Imported '+unique.length+' new jobs, skipped '+skipped+' duplicates without overwriting. Verify team records.');
    }catch(error){setBlocked(error)}
    finally{$('rhCloudImportLocal').disabled=false}
  }
  async function signedIn(user){
    if(!user){clearTeam();access('locked');return;}
    let membership=await client.from('rh_members').select('csp_name,role,active').eq('user_id',user.id).maybeSingle();
    if(membership.error)throw membership.error;
    if(!membership.data?.active){
      // Claim the very first administrator ONLY for the confirmed owner address.
      const claimed=await client.rpc('rh_claim_owner');
      if(claimed.error)throw claimed.error;
      if(claimed.data)membership=await client.from('rh_members').select('csp_name,role,active').eq('user_id',user.id).maybeSingle();
      if(membership.error)throw membership.error;
    }
    if(!membership.data?.active||!['Rafal','Tanja','Daim','Ivana'].includes(membership.data.csp_name)){
      sessionUser=user;member=null;ready=false;
      form.hidden=true;
      if(joinPanel)joinPanel.hidden=false;
      access('locked');
      loginMessage('Email verified. Enter the one-time CSP invitation code from the Recruitment Hub administrator.',true);
      return;
    }
    if(joinPanel)joinPanel.hidden=true;
    form.hidden=false;
    member=membership.data;sessionUser=user;
    actor.value=member.csp_name;actor.disabled=true;
    await loadServerData(true);
    ready=true;
    disableDangerousLocalOperations();
    if($('rhCloudAdminTools'))$('rhCloudAdminTools').hidden=member.role!=='admin';
    access('ready');
    if(!subscription){
      subscription=client.channel('rh-shared-jobs').on('postgres_changes',
        {event:'*',schema:'public',table:'rh_jobs'},()=>scheduleRefresh()).subscribe();
    }
  }
  async function begin(){
    loginMessage('Connecting to secure login...');
    try{
      if(!window.supabase?.createClient){
        await new Promise((resolve,reject)=>{
          const tag=document.createElement('script');
          tag.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
          tag.onload=resolve;tag.onerror=()=>reject(new Error('Unable to load Supabase client'));
          document.head.appendChild(tag);
        });
      }
      client=window.supabase.createClient(config.url,config.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      client.auth.onAuthStateChange((event)=>{
        if(event==='SIGNED_OUT'){clearTeam();access('locked');loginMessage('Signed out.')}
        if(event==='PASSWORD_RECOVERY'){
          recoveryMode=true;ready=false;
          $('rhCloudLoginForm').hidden=true;
          $('rhCloudRecoveryForm').hidden=false;
          $('rhCloudRequestReset').hidden=true;
          access('locked');
          loginMessage('Set your new password to activate this invitation or recovery session.');
        }
      });
      const {data,error}=await client.auth.getUser();
      if(error&&!/session missing/i.test(error.message||''))throw error;
      if(data?.user&&!recoveryMode){await signedIn(data.user)}
      else if(!recoveryMode)loginMessage('Sign in, or create an account with your own email. The administrator account must use the verified organization owner email.');
    }catch(error){loginMessage('Login unavailable: '+error.message,true)}
  }
  form?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!client){loginMessage('Supabase client not loaded',true);return;}
    const submit=$('rhCloudSignIn');submit.disabled=true;
    loginMessage('Authenticating...');
    try{
      const email=$('rhCloudEmail').value.trim(),password=$('rhCloudPassword').value;
      const {data,error}=await client.auth.signInWithPassword({email,password});
      if(error)throw error;
      $('rhCloudPassword').value='';
      await signedIn(data.user);
    }catch(error){loginMessage(error.message||'Authentication failed',true)}
    finally{submit.disabled=false}
  });
  

  // Sign up only creates a Supabase Auth account. Shared recruitment data
  // stays protected until the verified owner claims admin or the user redeems an invite.
  $('rhCloudSignUp')?.addEventListener('click',async()=>{
    if(!client){loginMessage('Database connection is not ready.',true);return;}
    const email=$('rhCloudEmail')?.value.trim(),password=$('rhCloudPassword')?.value||'';
    if(!email||password.length<12){loginMessage('Enter your email and a new password with at least 12 characters.',true);return;}
    const button=$('rhCloudSignUp');button.disabled=true;
    try{
      const {data,error}=await client.auth.signUp({email,password});
      if(error)throw error;
      $('rhCloudPassword').value='';
      if(data?.session&&data?.user)await signedIn(data.user);
      else loginMessage('Account requested. Check your email for a confirmation link. After confirming, return to this page and sign in.');
    }catch(error){loginMessage(error.message,true)}
    finally{button.disabled=false}
  });
  $('rhCloudJoinForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const token=$('rhCloudInviteCode')?.value.trim();
    const button=$('rhCloudJoinButton');button.disabled=true;
    try{
      const {data,error}=await client.rpc('rh_claim_invite',{p_code:token});
      if(error)throw error;
      if(!data)throw new Error('Invite invalid, expired, already used, or email not verified.');
      $('rhCloudInviteCode').value='';
      const {data:auth}=await client.auth.getUser();
      await signedIn(auth?.user);
    }catch(error){loginMessage(error.message,true)}
    finally{button.disabled=false}
  });
  $('rhCloudCreateInvite')?.addEventListener('click',async()=>{
    if(!ready||member?.role!=='admin')return;
    const button=$('rhCloudCreateInvite');button.disabled=true;
    try{
      const {data,error}=await client.rpc('rh_create_invite',{p_csp_name:$('rhCloudInviteCsp').value});
      if(error)throw error;
      $('rhCloudInviteResult').value=data||'';
      $('rhCloudInviteHelp').textContent='Share this one-time code privately. It expires in 14 days. The colleague creates an email/password account and enters the code after email confirmation.';
    }catch(error){$('rhCloudInviteHelp').textContent=error.message||'Could not issue invitation.'}
    finally{button.disabled=false}
  });
  $('rhCloudCopyInvite')?.addEventListener('click',()=>{
    const input=$('rhCloudInviteResult');if(!input?.value)return;
    navigator.clipboard?.writeText(input.value).catch(()=>{input.select()});
  });
  $('rhCloudLocalBackup')?.addEventListener('click',()=>{
    const raw=localStorage.getItem('recruitment-hub-v3');
    if(!raw){loginMessage('No local Recruitment Hub backup found in this browser and website.',true);return;}
    try{
      const data=JSON.parse(raw);
      if(!Array.isArray(data.jobs))throw new Error('Invalid local data');
      const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='recruitment-hub-original-local-backup.json';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      loginMessage('Downloaded the original local jobs and notes. They remain in this browser.');
    }catch(error){loginMessage('Cannot export local backup: '+error.message,true)}
  });

  $('rhCloudRequestReset')?.addEventListener('click',async()=>{
    if(!client){loginMessage('Database connection is not ready',true);return}
    const email=$('rhCloudEmail')?.value.trim();
    if(!email){loginMessage('Enter your invited email first.',true);$('rhCloudEmail')?.focus();return}
    try{
      const redirectTo=window.location.origin+window.location.pathname;
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
      if(error)throw error;
      loginMessage('If this account exists, a password setup/reset link has been sent. Check your email.');
    }catch(error){loginMessage(error.message,true)}
  });
  $('rhCloudRecoveryForm')?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!client)return;
    const password=$('rhCloudNewPassword')?.value||'';
    if(password.length<12){loginMessage('Use at least 12 characters.',true);return}
    const button=$('rhCloudUpdatePassword');button.disabled=true;
    try{
      const {data,error}=await client.auth.updateUser({password});
      if(error)throw error;
      recoveryMode=false;
      $('rhCloudNewPassword').value='';
      $('rhCloudRecoveryForm').hidden=true;
      $('rhCloudLoginForm').hidden=false;
      $('rhCloudRequestReset').hidden=false;
      const user=data?.user||(await client.auth.getUser()).data?.user;
      if(user)await signedIn(user);
      else loginMessage('Password saved. Sign in using your email.');
    }catch(error){loginMessage(error.message,true)}
    finally{button.disabled=false}
  });

  $('rhCloudSignOut')?.addEventListener('click',()=>void api.logout());
  $('rhCloudImportLocal')?.addEventListener('click',()=>void importLocal());
  $('rhCloudImportDetected')?.addEventListener('click',()=>void importLocal());
  $('rhCloudImportBackup')?.addEventListener('click',()=>$('rhCloudImportInput')?.click());
  $('rhCloudImportInput')?.addEventListener('change',async(event)=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    try{
      const backup=JSON.parse(await file.text());
      if(!backup||!Array.isArray(backup.jobs))throw new Error('JSON backup must contain a jobs array.');
      await importLocal(backup.jobs);
    }catch(error){alert('Import could not start: '+error.message)}
  });
  $('rhCloudBackup')?.addEventListener('click',exportEmergency);
  $('rhCloudReload')?.addEventListener('click',async()=>{
    if(!confirm('Discard UNSAVED local changes and reload the latest team data from the server? Download a backup first.'))return;
    blocked=false;ready=true;
    $('rhCloudError').hidden=true;
    try{await loadServerData(true)}catch(error){setBlocked(error)}
  });
  // If an editor leaves a modal, process any incoming remote edits.
  new MutationObserver(()=>{if(!$('modal').classList.contains('open'))scheduleRefresh()})
    .observe($('modal'),{attributes:true,attributeFilter:['class']});
  access('locked');
  void begin();
})();
