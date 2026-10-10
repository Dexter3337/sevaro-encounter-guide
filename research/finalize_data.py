import json,csv,re,hashlib,zipfile,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent;OUT=ROOT.parent/'outputs'/'01a124a6'
kb=json.loads((OUT/'knowledge_base.json').read_text(encoding='utf-8'))
def add(tab,**r):kb.setdefault(tab,[]).append(r);return r
meanings={
'Local Time Zone':('Hospital civil-time region used to interpret schedules','IANA zone string'),
'Video Eval Location':('Physical evaluation location, possibly scoped to consult type','Literal location or conditional branches'),
'Thrombolytic':('Site-listed medication name; does not determine patient eligibility','Medication name string'),
'Thrombolytic Mix Model':('Responsible actors and preparation/verification/handoff sequence','Actor/action sequence and conditional branches'),
'LVO Protocol':('Site capability, escalation actor and transfer/activation pathway','Capability + actor/action + coverage branches'),
'Wake Up Protocol':('Whether site lists a wake-up protocol; protocol details not supplied','Yes/No capability'),
'Order Entry':('Scope of orders permitted to teleneurologist at this site','Permission by actor/order category'),
'Order Set Name':('Exact EHR search phrase, display title and identifier or NA','Literal strings / Not applicable'),
'Charge Entry':('Whether encounter charge is required before completion','No / Yes / conditional prerequisite'),
'Required Note Title':('Exact site-required note heading','Literal title string'),
'Rounding Process':('Who initiates or populates rounding and by what channel','Actor/channel/initiation sequence'),
'When Do We Round?':('Allowed days or appointment-dependent rounding cadence','Day set / Daily / As scheduled'),
'Rounding Timing':('Local-time rounding interval, evaluated with rounding days','Local interval + zone'),
'Rounding Orders':('Rounding order permissions and co-sign conditions','Permission scope + prerequisites'),
'General Neurology':('General-neurology coverage by setting, actor or time','Coverage branches'),
'Pediatric Neurology':('Pediatric service coverage or referral/transfer pathway','Service/call/transfer pathway'),
'EEG':('Routine and continuous EEG capabilities, schedules and on-call distinctions','Subservice + schedule + explicit negative'),
'CT Head':('Noncontrast head CT service availability as listed','Service schedule'),
'CTA Head/Neck':('Head/neck CTA service availability as listed','Service schedule'),
'CT Perfusion':('CTP capability or exclusive service schedule','No / schedule'),
'MRI':('MRI routine availability and overnight/weekend fallback','Schedule + exception/on-call'),
'AI':('Named site imaging AI system, or explicit None','Literal system name / None'),
'EHR':('Site electronic health record name; no implied API or permissions','Literal vendor/system label'),
'PACS':('Site imaging archive/viewer name; no implied connectivity','Literal system label'),
'VPN':('Site network-access system name; not credentials','Literal access label'),
'Cardiovascular Services':('Service coverage and on-call/weekend variation','Schedule + exception'),
'Carotid Ultrasound':('Ultrasound service availability','Service schedule'),
'Cardiac Monitoring':('Inpatient telemetry versus outpatient monitoring arrangement','Setting-specific service branches'),
'TEE':('Transesophageal echocardiography service availability','Service schedule'),
'PT/OT/ST':('Separate physical, occupational and speech therapy availability','Three component schedules'),
'Specialty Labs':('Listed reference-laboratory service name','Literal laboratory label'),
'EHR Department Login Location':('Department context to select for EHR login','Literal department string'),
'Consult Completion Rule':('Local prerequisite for Synapse completion beyond charge','Actor + required confirmation fact'),
'Stress Testing':('Stress-testing service availability','Service schedule')}
for f in kb['Guide Fields']:
 f['meaning'],f['data_type']=meanings[f['name']]
 f['observed_values']=f['observed_values'].replace(' || ','\n')
 f['test_ids']=f['test_ids'].replace('; ','\n')
 f['value_state_boundary']='Missing field != explicit No != unknown value != Not applicable. Source text always retained.'

# Split compound input labels while retaining source provenance and original context rows.
orig=kb['Caselog Fields']; new=[]
for r in orig:
 if r['name']=='consult_type / encounter_type':
  for name,meaning,example in [('consult_type','Clinical consult category','Stroke'),('encounter_type','Encounter workflow category','Acute')]:
   q=dict(r);q.update(caselog_field_id='CF-CONSULT' if name=='consult_type' else 'CF-ENCOUNTER',name=name,meaning=meaning,example=example,source_label=r['name']);new.append(q)
 elif r['name']=='local_time + local_timezone':
  for name,meaning,example in [('local_time','Hospital-local time with required date for day and staleness checks','19:30'),('local_timezone','Hospital IANA timezone, distinct from provider zone','America/Chicago')]:
   q=dict(r);q.update(caselog_field_id='CF-LOCALTIME' if name=='local_time' else 'CF-LOCALZONE',name=name,meaning=meaning,example=example,source_label=r['name']);new.append(q)
 else:new.append(r)
kb['Caselog Fields']=new
for r in kb['Caselog Fields']:
 r['test_ids']='SCHEMA-BOUNDARY; DEV-TYPE; V17' if not r['caselog_field_id'].startswith('CF-T') else 'BT-'+r['caselog_field_id'][4:]
for m in kb['Field–Rule Map']:
 m['caselog_field_id']=next(r['caselog_field_id'] for r in kb['Caselog Fields'] if r['name']==m['caselog_field'])
 m['rule_family_ids']='; '.join(dict.fromkeys(rf for f in kb['Guide Fields'] if f['guide_field_id'] in m['guide_field_ids'].split('; ') for rf in f['rule_family_ids'].split('; ')))
 m['status_policy']='Applicable source => Answered or Time-dependent; independent stale/conflict/missing flags. Required unmet prerequisite => Hard stop.'
 m['rationale']='Specific mapped guide concept is useful at this event; avoid unrelated guide dump'
 m['test_ids']='BT-'+m['mapping_id'][-2:]

mixactors={'SYN-001':'Pharmacy','SYN-002':'ED nurse after verification','SYN-003':'Pharmacy verifies; ED nurse mixes/administers','SYN-004':'Pharmacy mixes; courier delivers','SYN-005':'Pharmacy after teleneurology recommendation','SYN-006':'ED pharmacist during undefined staffed hours; nursing overnight','SYN-007':'ED nursing'}
lvoactors={'SYN-001':'Teleneurologist alerts ED and activates response line during coverage; transfer actor unspecified outside','SYN-002':'Teleneurologist communicates to ED; ED provider activates transfer center','SYN-003':'Teleneurologist communicates to ED and activates hotline','SYN-004':'Teleneurologist informs primary provider; primary provider contacts transfer hub','SYN-005':'Teleneurologist informs ED then calls transfer command','SYN-006':'Teleneurologist activates EVT during coverage; ED provider starts transfer outside','SYN-007':'Teleneurologist informs ED; ED calls transfer access'}
for r in kb['Synthetic Rules']:
 f=r['field']; v=r['value']; hid=r['hospital_id']
 r['scope_actor']='Teleneurologist workflow; local actors as stated'
 r['action_or_fact']=v
 r['schedule_text']=v if f in ['LVO Protocol','Thrombolytic Mix Model','EEG','MRI','When Do We Round?','Rounding Timing','General Neurology','Cardiovascular Services','Carotid Ultrasound','TEE','Stress Testing','PT/OT/ST','CT Perfusion','CT Head','CTA Head/Neck'] else 'Not time-qualified in supplied field'
 r['normalized_draft']='Source-only draft; execution grammar must be validated'
 if f=='Thrombolytic Mix Model':r['actor']=mixactors.get(hid,'Pharmacy verifies; ED nurse prepares after hospital provider order');r['condition']='Staffed hours vs overnight unresolved' if hid=='SYN-006' else 'Preparation/verification as source states'
 if f=='LVO Protocol':r['actor']=lvoactors.get(hid,'Explicit actor in outside branch; inside actor unspecified' if hid=='HOLD-201' else 'Hospital ED provider/attending for transfer; activation actor absent');r['condition']='Applicable LVO finding + capability/coverage';r['prerequisites']='Coverage known if branch depends on hours';r['exceptions']='Outside coverage transfer branch where explicitly stated'
 if f=='Order Entry':r['actor']='Teleneurologist; hospital provider if prohibited';r['condition']='Requested order category within explicitly permitted scope';r['prerequisites']='Site-approved order privilege; patient treatment decision not established by this rule'
 if f=='Rounding Orders':r['actor']='Teleneurologist; hospitalist co-sign where stated';r['condition']='Rounding encounter and requested category';r['prerequisites']='Hospitalist co-sign if required by source'
 if f=='Charge Entry':r['actor']='Provider completion action';r['condition']='Required charge Yes and charge_entered not true';r['prerequisites']='Charge entered if explicitly required; unknown not converted to Yes'
 if f=='Consult Completion Rule':r['actor']='Hospital provider confirms plan; teleneurologist attempts completion';r['condition']='Completion attempted and plan confirmation absent';r['prerequisites']='Hospital provider plan confirmation'
 if f=='Required Note Title':r['actor']='Note author';r['condition']='Note created or title edited'

# Canonical executable-style envelopes for supplied tests, retaining exact source labels.
zones={h['hospital_id']:(re.search(r'\(([^)]+)\)',h['timezone'])[1] if '(' in h['timezone'] else h['timezone']) for h in kb['Synthetic Hospitals']}
qsteps={'V01':'Intake','V02':'Imaging','V03':'Rounding','V04':'Recommendation','V05':'Imaging','V06':'Imaging','V07':'Recommendation','V08':'Imaging','V09':'Imaging','V10':'Sign-off','V11':'Rounding','V12':'Intake','V13':'Recommendation','V14':'Intake','V15':'Recommendation','V16':'Imaging','V17':'Rounding','V18':'Recommendation','V19':'Note','V20':'Note'}
ntr={'N1':'TR-05','N2':'TR-05','N3':'TR-02','N4':'TR-06','N5':'TR-10','N6':'TR-04','N7':'TR-10','N8':'TR-03','N9':'TR-11'}
for s in kb['Development Scenarios']:
 sid=s['scenario_id']
 if sid.startswith('V') or re.fullmatch(r'N\d',sid):
  ctx=json.loads(s['encounter_context']);ctx['hospital_id']=s['hospital_id'];ctx['local_timezone']=zones[s['hospital_id']];ctx['provider_timezone']='America/New_York';ctx['source_local_time']=ctx['local_time'];ctx['encounter_type']='Rounding' if sid in ['V03','V11','V17','N9'] else 'Acute';ctx['caselog_step']=qsteps.get(sid,ctx.get('caselog_step'))
  if sid.startswith('V'):
   match=re.search(r'(2026-\d\d-\d\d).*?(\d\d:\d\d)',ctx['local_time']);ctx['local_time']=match[1]+'T'+match[2]+':00';ctx['consult_type']='Stroke' if sid not in ['V03','V11','V17'] else 'General Neuro';s['requirement_ids']=sid;s['event_sequence']=json.dumps([{'kind':'question','text':s['event_sequence'][5:]}])
  else:
   tm=re.search(r'\d\d:\d\d',ctx['local_time']);ctx['local_time']=('2026-03-22' if sid=='N9' else '2026-03-17')+'T'+tm[0]+':00'
   evs={'N1':[{'kind':'value_change','field':'lvo_present','value':True}], 'N2':[{'kind':'value_change','field':'lvo_present','value':True}], 'N3':[{'kind':'value_change','field':'last_known_well','value':'Unknown'}], 'N4':[{'kind':'value_change','field':'thrombolytic_given','value':True}], 'N5':[{'kind':'completion.attempt'}], 'N6':[{'kind':'value_change','field':'cta_done','value':True}], 'N7':[{'kind':'completion.attempt'}], 'N8':[{'kind':'value_change','field':'allergies','value':'none'}], 'N9':[{'kind':'encounter.open'}]}
   s['source_event_text']=s['event_sequence'];s['event_sequence']=json.dumps(evs[sid]);s['requirement_ids']=sid+'; '+ntr[sid]
  s['encounter_context']=json.dumps(ctx)
 for key in ['encounter_context']:
  c=json.loads(s[key]);c['local_timezone']=zones.get(s['hospital_id'],c.get('local_timezone','Unknown'));s[key]=json.dumps(c)
for s in kb['Held-Out Scenarios']:
 c=json.loads(s['encounter_context']);c['local_timezone']=c.get('local_timezone') if s['scenario_id']=='HOLD-TZINVALID' else zones.get(s['hospital_id'],c.get('local_timezone','Unknown'));s['encounter_context']=json.dumps(c)
for eo in kb['Expected Outputs']:
 if eo['scenario_id']=='N8':eo['tier']='None'
 if eo['scenario_id'] in ['DEV-FAIL','HOLD-CORRUPT','HOLD-MISSINGHOSP']:eo['assumptions']='System notice: Not in guide primary bucket used provisionally. Guide unavailable is diagnostic, not evidence that every hospital field is absent.'

interp=[
('AD-01','Direct structured evaluation','Validated field type/operator and known concept','Deterministic evaluation with citation and context','No new operator interpretation; reject malformed data','Best field-event hot path','DESIGN-001; SRC-001'),
('AD-02','Deterministic text parsing','Known alias and finite grammar with explicit days/hours/actors','Create draft with source spans; validate boundaries/types','Ambiguous wording or new meaning => unresolved','Fast reproducible ingestion; fragile outside approved grammar','DESIGN-001'),
('AD-03','Model-assisted extraction','Unfamiliar prose or structure','Draft concept/actor/action/condition/scope; retain original source and confidence','Confidence cannot authorize rule/gate; new meanings require review','Run at ingestion, not 500ms path; constrained schema, no tools','DESIGN-001; SRC-015'),
('AD-04','Human review','Ambiguity, conflict, clinical meaning, novel operator or gate','Approve exact structured rule/version and scope or reject','No runtime fabrication while pending','Required for production local authority; offline queue','DESIGN-001; SRC-004'),
('AD-05','Source-to-rule pipeline','Document uploaded as untrusted source data','Hash/version/source field -> extraction -> approved concept mapping -> structured draft -> validation -> supported execution OR review/abstain','No code/eval/tool command generated from source content','Raw document immutable; encounter and review logs separate','DESIGN-001; SRC-015'),
('AD-06','Unfamiliar field decision','Different name/value versus new rule meaning','Approved alias maps automatically; unknown literal can be cited on demand; unknown action logic shows source and unsupported flag','Data-only extensibility covers schema/content, not unbounded clinical execution','For same-format unseen hospital load via data; no hardcoded hospital branches','DESIGN-001; SRC-001')]
for aid,method,entry,output,boundary,trade,src in interp:add('Adaptive Interpretation',interpretation_id=aid,method=method,input_condition=entry,output=output,review_or_abstention_boundary=boundary,implementation_tradeoff=trade,source_id=src,classification='Proposed design or inference')

for i,(name,when,display) in enumerate([
('Answered','Field exists and is current','Value and source field'),('Not in guide','Requested hospital field absent','Not available in hospital guide; no other-site fill'),('Time-dependent','Answer depends on local day/time','Now answer and rule; undefined window remains unknown'),('Stale','Last verified more than 180 days before encounter','Source value and visible possibly out-of-date flag'),('Conflict','Applicable guide and storyboard disagree','Both values/sources; never silently choose'),('Hard stop','Applicable required step incomplete','Missing condition and how to satisfy it')],1):add('Answer Policy',status_id=f'ST-{i:02d}',status=name,source_condition=when,provider_display=display,source_id='SRC-001',classification='Explicit challenge requirement',locator='p3',additional_policy='Primary status and quality flags separate. V18 primary Time-dependent plus Stale; V04 missing Friday availability despite existing stale EEG record. Novel flags are proposed extensions.')

build=[
('IMP-01','P0','Import and immutable guide store','Unofficial adapter; exact hospital ID, per-field value/verified date, original wording, version and storyboard','REQ-07; REQ-08; REQ-09','SCHEMA-BOUNDARY; DEV-READONLY; HOLD-NEW','Organizer exact file schema pending'),
('IMP-02','P0','Mock caselog native events','open, step, display, change, note.create and completion.attempt; encounter revision and hospital scope','REQ-01; REQ-10','BT-01; BT-07; N1; N9','Production callbacks pending'),
('IMP-03','P0','Deterministic supported rule engine','Finite concept/operator grammar; local timezone; independent quality flags; order permission/category; new data adapter','REQ-11; REQ-12; REQ-13; REQ-14; REQ-15','V01–V20; DEV-END; HOLD-UNSUPPORTED','Exact endpoint and multistatus policy pending'),
('IMP-04','P0','Cited guidance and lifecycle','Info/advisory presentation, silence, dedupe/retract, immutable decision audit, source-original field links','REQ-03; REQ-17; REQ-18','N1–N9; DEV-REPEAT; DEV-RETRACT','Unseen-meaning source display versus unsupported status pending'),
('IMP-05','P0','Host completion checks','Atomic current prerequisites; no acknowledge-as-completion; explicit outage behavior','REQ-06; REQ-17','N5; N7; DEV-PARTIAL; DEV-FIX; HOLD-GATE','Acknowledgement/override semantics and authoritative writes pending'),
('IMP-06','P0','On-demand question routing','Hospital-scoped intent/concept extraction and sourced answer rendering; no arbitrary clinical inference','REQ-02','V01–V20; HOLD-FIELD; HOLD-ALIAS','Model route may draft intent only; known-rule engine evaluates'),
('IMP-07','P0','Frozen evaluation and latency harness','Keep held-out rules/questions out of parser examples; compare semantics/status/tier/citations/silence; event-to-paint timing','REQ-04; REQ-05; REQ-08','PERF-01; PERF-02; all held-out scenarios','No prototype runtime available in research request'),
('IMP-08','P1','Production validation and integration','Local review, access/privileges, EHR/native integration, security/privacy, intended-use review, simulation/shadow/pilot, monitoring/rollback','REQ-20','PROD-VALIDATION','See UNK-04 and UNK-09–22; unmet dependencies'),
('IMP-09','P2','Optional transcript adapter','Only after authorized access/consent; attribution, tense, negation and corrections; no speech-derived gate release','REQ-18','HOLD-SPEECH; DEV-NEGATION','Transcript interface and consent unknown')]
for iid,priority,name,work,reqs,tests,deps in build:add('Implementation Priorities',implementation_id=iid,priority=priority,name=name,work=work,requirement_ids=reqs,test_ids=tests,dependencies=deps,classification='Proposed design or inference',source_id='DESIGN-001; SRC-001')

allsc=kb['Development Scenarios']+kb['Held-Out Scenarios']; sids={s['scenario_id'] for s in allsc}
for r in kb['Requirements']:
 for sid in r['test_ids'].split('; '):add('Trace Links',link_id=f"L-{len(kb.get('Trace Links',[]))+1:04d}",from_table='Requirements',from_id=r['requirement_id'],relation='specified by test',to_table='Scenarios',to_id=sid,source_id=r['source_id'])
for r in kb['Guide Fields']:
 for sid in r['test_ids'].split('\n'):
  if sid:add('Trace Links',link_id=f"L-{len(kb['Trace Links'])+1:04d}",from_table='Guide Fields',from_id=r['guide_field_id'],relation='concept exercised by',to_table='Scenarios',to_id=sid,source_id='DESIGN-001')
for r in kb['Rule Families']:
 for sid in r['test_ids'].split('; '):
  if sid:add('Trace Links',link_id=f"L-{len(kb['Trace Links'])+1:04d}",from_table='Rule Families',from_id=r['rule_family_id'],relation='family exercised by',to_table='Scenarios',to_id=sid,source_id='DESIGN-001')
for s in allsc:
 add('Trace Links',link_id=f"L-{len(kb['Trace Links'])+1:04d}",from_table='Scenarios',from_id=s['scenario_id'],relation='expected outcome',to_table='Expected Outputs',to_id=s['expected_output_id'],source_id=s['source_id'])

# Source integrity and foreign-key checks; not tests of an implemented companion.
errors=[]; srcids={x['source_id'] for x in kb['Sources']};rids={x['rule_id'] for x in kb['Synthetic Rules']};gids={x['guide_field_id'] for x in kb['Guide Fields']};hids={x['hospital_id'] for x in kb['Synthetic Hospitals']};eids={x['expected_output_id'] for x in kb['Expected Outputs']}
for tab,rows in kb.items():
 for row in rows:
  for src in row.get('source_id','').split('; '):
   if src and src not in srcids:errors.append(f'{tab}: unknown source {src}')
for s in allsc:
 if s['expected_output_id'] not in eids:errors.append('Missing oracle '+s['scenario_id'])
 for rid in s['guide_rule_ids'].split('; '):
  if rid and rid not in rids:errors.append('Unknown rule '+rid)
 for fid in s['guide_field_ids'].split('; '):
  if fid and fid not in gids:errors.append('Unknown concept '+fid)
 try:json.loads(s['encounter_context']);assert isinstance(json.loads(s['event_sequence']),list)
 except Exception:errors.append('Invalid envelope '+s['scenario_id'])
for r in kb['Synthetic Rules']:
 if r['hospital_id'] not in hids or r['guide_field_id'] not in gids:errors.append('Invalid rule FK '+r['rule_id'])
for r in kb['Trace Links']:
 if r['to_table']=='Scenarios' and r['to_id'] not in sids:errors.append('Dangling trace '+r['link_id'])
for key,rows in [('scenario_id',allsc),('rule_id',kb['Synthetic Rules']),('requirement_id',kb['Requirements']),('guide_field_id',kb['Guide Fields'])]:
 if len({r[key] for r in rows})!=len(rows):errors.append('Duplicate '+key)
raw=json.loads((ROOT/'raw_tables.json').read_text(encoding='utf-8'));expected_source_count=sum(len(x['tables'][0])-1 for x in raw if 4<=x['page']<=10)
assert len([r for r in kb['Synthetic Rules'] if r['hospital_id'].startswith('SYN-')])==expected_source_count==169
assert len(gids)==34 and len(sids)==131
assert set(r['requirement_id'] for r in kb['Requirements'] if r['category']=='Validation example')=={f'V{i:02d}' for i in range(1,21)}
assert set(r['requirement_id'] for r in kb['Requirements'] if r['category']=='Nudge scenario')=={f'N{i}' for i in range(1,10)}
assert not errors,errors
report={'checked':'Research data structure and source reconstruction only; no runtime/clinical effectiveness tests','errors':errors,'unique_scenarios':len(sids),'development':len(kb['Development Scenarios']),'held_out':len(kb['Held-Out Scenarios']),'source_guide_records':169,'guide_concepts':34,'requirement_links':len([r for r in kb['Trace Links'] if r['from_table']=='Requirements']),'trace_links':len(kb['Trace Links']),'source_record_check':'169 records reconciled to PDF table row count','limitations':['No Excel desktop validation yet','No companion execution','No independent clinician oracle adjudication']}
(OUT/'validation_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for tab,filename in [('Development Scenarios','development_inputs.jsonl'),('Held-Out Scenarios','held_out_inputs.jsonl')]:
 with (OUT/filename).open('w',encoding='utf-8') as f:
  for s in kb[tab]:
   d={k:v for k,v in s.items() if k not in ['oracle_method','expected_output_id']};d['encounter_context']=json.loads(d['encounter_context']);d['event_sequence']=json.loads(d['event_sequence']);f.write(json.dumps(d,ensure_ascii=False)+'\n')
with (OUT/'expected_outputs.jsonl').open('w',encoding='utf-8') as f:
 for r in kb['Expected Outputs']:f.write(json.dumps(r,ensure_ascii=False)+'\n')
manifest=json.loads((OUT/'split_manifest.json').read_text(encoding='utf-8'));manifest['files']={f:hashlib.sha256((OUT/f).read_bytes()).hexdigest() for f in manifest['files']};(OUT/'split_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'knowledge_base.json').write_text(json.dumps(kb,indent=2,ensure_ascii=False),encoding='utf-8')
for tab,rows in kb.items():
 cols=list(dict.fromkeys(k for r in rows for k in r))
 with (OUT/'tables'/(tab.replace(' ','_')+'.csv')).open('w',newline='',encoding='utf-8-sig') as f:
  w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(rows)
print(json.dumps(report))
