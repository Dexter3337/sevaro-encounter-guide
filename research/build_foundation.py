import json, re, csv, hashlib
from pathlib import Path
from datetime import date

ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'outputs'/'01a124a6'
OUT.mkdir(parents=True,exist_ok=True)
T={x['page']:x['tables'] for x in json.loads((ROOT/'raw_tables.json').read_text(encoding='utf-8'))}
def clean(x): return re.sub(r'\s+',' ',x or '').strip()
def records(table): return [[clean(c) for c in r] for r in table[1:]]
kb={}
def add(tab,**row): kb.setdefault(tab,[]).append(row); return row
def save():
    (OUT/'knowledge_base.json').write_text(json.dumps(kb,indent=2,ensure_ascii=False),encoding='utf-8')
    d=OUT/'tables';d.mkdir(exist_ok=True)
    for tab,rows in kb.items():
        cols=list(dict.fromkeys(k for r in rows for k in r))
        with (d/(tab.replace(' ','_')+'.csv')).open('w',newline='',encoding='utf-8-sig') as f:
            w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(rows)
    print({k:len(v) for k,v in kb.items()})

add('Sources',source_id='SRC-001',title='Sevaro Rutgers Health Hack Challenge 1 v2',url='source_material/Sevaro/Sevaro_Rutgers_Health_Hack_Challenge_1_Guided_Workflow_v2.pdf',publisher='Sevaro',publication_date='Unknown; supplied v2',access_date='2026-10-10',classification='Explicit challenge requirement',applicability='Hackathon contract and fictional fixtures',limitations='ZIP contains two PDFs only. Six listed machine-readable files are not present. Reconstructed exports are unofficial.',evidence_locator='pp1–12')
add('Sources',source_id='SRC-002',title='User research instructions and organizer clarification',url='User supplied pasted-text-1.txt and chat',publisher='User / organizer clarification relayed by user',publication_date='Unknown',access_date='2026-10-10',classification='Explicit challenge requirement',applicability='Research scope and judging dataset availability',limitations='Organizer clarification is relayed, not independently verified',evidence_locator='User prompt and pasted research phases')

names=['Cedar Ridge Medical Center','Bluewater Regional Hospital','Redwood University Medical Center','Meadowlands Community Hospital','Suncrest Medical Pavilion','Highland Valley Hospital','Silver Oak Health Center']
fields=[];guides=[]
for i in range(7):
    hid=f'SYN-{i+1:03d}'
    rows=records(T[i+4][0])
    for field,value in rows:
        if field not in fields:fields.append(field)
        verified=re.search(r'\[last verified (\d{4}-\d{2}-\d{2})\]',value)
        dt=verified[1] if verified else '2026-02-02'
        guides.append(dict(hospital_id=hid,field=field,value=re.sub(r' \[last verified .*?\]','',value),last_verified=dt,original_value=value,page=i+4))
    add('Synthetic Hospitals',hospital_id=hid,name=names[i],classification='Synthetic example',origin='Challenge supplied fixture',split='Challenge baseline',timezone=next(r['value'] for r in guides if r['hospital_id']==hid and r['field']=='Local Time Zone'),guide_version='Challenge v2',source_id='SRC-001',locator=f'p{i+4}',coherence='As supplied; missing fields intentionally preserved')

family_specs=[
('RF-01','Literal information','Exact local value or name','Video Eval Location; Thrombolytic; Required Note Title; AI; EHR; PACS; VPN; EHR Department Login Location; Specialty Labs','Return source value with citation; no inferred capability'),
('RF-02','Conditional location','Consult-type branch','Video Eval Location','Select branch only with known consult type'),
('RF-03','Availability states','Yes, No, None, Not applicable, missing, unknown','Wake Up Protocol; CT Perfusion; AI','Preserve explicit negative separately from missing'),
('RF-04','Weekly service schedule','Day set and local interval','EEG; MRI; CT Head; CTA Head/Neck; CT Perfusion; Cardiovascular Services; Carotid Ultrasound; TEE; Stress Testing; PT/OT/ST; Rounding Timing; When Do We Round?','Evaluate known local date/time; do not infer unlisted days unless exclusive schedule says so'),
('RF-05','Coverage-dependent escalation','Capability and schedule select actor/action','LVO Protocol','Known windows route; undefined hours expose both branches'),
('RF-06','Preparation and handoff','Verify, prepare, mix, deliver, administer','Thrombolytic Mix Model','Preserve actor and order of operations; no dosing'),
('RF-07','Order permission scope','Actor and allowed order categories','Order Entry; Rounding Orders','Permissions are scoped; never convert limited permission to full access'),
('RF-08','Order set lookup','Search phrase, display title, identifier','Order Set Name','Preserve exact title and ID; suppress name nudge if actor cannot enter orders'),
('RF-09','Co-sign prerequisite','Medication change requires co-sign','Rounding Orders','Show condition without claiming co-sign occurred'),
('RF-10','Completion gate','Required charge or plan confirmation','Charge Entry; Consult Completion Rule','Block attempt only for explicit applicable unmet condition'),
('RF-11','Initiation and rounding','Initiating actor/channel/census cadence','Rounding Process; When Do We Round?; Rounding Timing','As scheduled needs actual appointment context'),
('RF-12','Conditional on-call fallback','Routine window plus on-call or no coverage','EEG; MRI; Cardiovascular Services','On-call is not routine availability or guaranteed response'),
('RF-13','Compound service rule','Different schedules for component services','PT/OT/ST; EEG; Cardiac Monitoring; General Neurology; Pediatric Neurology','Preserve subservice, setting and distinct scope'),
('RF-14','Provenance and quality','Missing, >180 days, disagreement','All fields','Independent quality flags alongside primary status'),
('RF-15','Event relevance and lifecycle','Changes, display, completion attempt, retraction','All mapped fields','Silence when irrelevant; update existing guidance on material change'),
('RF-16','Novel unsupported semantics','Unknown operator, new clinical decision or resource optimization','Unmapped fields','Retain original text; review or abstain from actionable interpretation')]
for rid,name,meaning,concepts,boundary in family_specs:
    add('Rule Families',rule_family_id=rid,name=name,meaning=meaning,guide_concepts=concepts,boundary=boundary,classification='Proposed design or inference',source_id='SRC-001',execution='Automatic only for validated supported grammar' if rid!='RF-16' else 'Review / abstain')
fids={f:f'GF-{i+1:03d}' for i,f in enumerate(fields)}
for f in fields:
    fam=[r[0] for r in family_specs if f in r[3].split('; ')]
    if f=='Local Time Zone':fam=['RF-04','RF-14']
    fam+=['RF-14'] if 'RF-14' not in fam else []
    vals=[g['value'] for g in guides if g['field']==f]
    add('Guide Fields',guide_field_id=fids[f],name=f,synonyms={'LVO Protocol':'LVO workflow; EVT escalation','Thrombolytic':'clot-busting agent; TNK only when explicitly Tenecteplase','Video Eval Location':'video evaluation site','When Do We Round?':'rounding days','Required Note Title':'note heading','CT Perfusion':'CTP'}.get(f,'No approved alias supplied'),meaning='Hospital guide concept: '+f,data_type='Source text; typed rule after validation',possible_states='Present; explicit negative; not applicable; missing; unknown',source_actor_system='Hospital guide maintainer / read-only supplied guide',availability_timing='Preload on encounter opening',workflow='Linked through Field–Rule Map; otherwise on-demand',rule_family_ids='; '.join(fam),observed_values=' || '.join(dict.fromkeys(vals)),classification='Explicit challenge requirement',source_id='SRC-001',locator='pp4–10',interpretation_limit='Dictionary supports concept; unseen semantics require validation')

for g in guides:
    fid=fids[g['field']];rid=g['hospital_id']+'-'+fid
    fam=next(x['rule_family_ids'] for x in kb['Guide Fields'] if x['guide_field_id']==fid)
    add('Synthetic Rules',rule_id=rid,hospital_id=g['hospital_id'],guide_field_id=fid,field=g['field'],original_wording=g['original_value'],value=g['value'],actor='Preserved in source wording; do not infer absent actor',condition='Preserved in source wording; normalized draft requires review',schedule_timezone='Hospital Local Time Zone',prerequisites='As written; unknown where absent',exceptions='As written; unknown where absent',rule_family_ids=fam,source_id='SRC-001',locator=f"p{g['page']} / {g['field']}",version='Challenge v2',last_verified=g['last_verified'],classification='Synthetic example',split='Challenge baseline',review_state='Reconstructed verbatim; structured execution not validated')

context=records(T[1][0])+records(T[2][0])
for i,(field,example,why) in enumerate(context):
    add('Caselog Fields',caselog_field_id=f'CF-{i+1:03d}',name=field,synonyms='Use supplied names; do not invent proprietary API keys',meaning=why,data_type='Boolean' if field=='charge_entered' else 'Context text/object; exact schema unavailable',possible_states='Present; missing; unknown; not applicable; explicit false where Boolean',source_actor_system='Encounter-context event supplied by challenge',availability_timing='Each step move or field change',workflow='All relevant context must be evaluated',classification='Explicit challenge requirement',source_id='SRC-001',locator='pp1–2',example=example)
for i,(num,step,field,trigger,gfields,tier) in enumerate(records(T[2][1])):
    gids=[fids[x.strip()] for x in gfields.replace(' (evaluate against local time)','').split(';')]
    rid='TR-'+num.zfill(2)
    add('Field–Rule Map',mapping_id=rid,workflow_step=step,caselog_field=field,event=trigger,guide_field_ids='; '.join(gids),guide_fields=gfields,default_tier=tier,context_needed='Hospital; consult/encounter type; step; field event; hospital-local date/time where scheduled; current completion state',output_or_silence='Cited relevant rule; silence if condition not applicable',timing='Within 500ms of field change; field displayed/open/attempt are distinct event kinds',classification='Explicit challenge requirement',source_id='SRC-001',locator='p2 trigger '+num)
    add('Requirements',requirement_id=rid,category='Trigger',statement=f'{step}: {field}; {trigger}; {gfields}; {tier}',source_id='SRC-001',locator='p2',test_ids='BT-'+num.zfill(2),acceptance='Event-specific cited output or justified silence; preserve context',coverage='Specified',execution_result='Not run')
    if not any(x['name']==field for x in kb['Caselog Fields']):
        add('Caselog Fields',caselog_field_id=f'CF-T{num.zfill(2)}',name=field,synonyms='Concept label from trigger map',meaning='Caselog concept distinct from mapped guide fields',data_type='Text/enum/Boolean/action per trigger; unofficial normalization',possible_states='Present; missing; unknown; negative; not applicable',source_actor_system='Provider interaction; actual production capture unknown',availability_timing=trigger,workflow=step,classification='Explicit challenge requirement',source_id='SRC-001',locator='p2 trigger '+num,example=field)

story=[]
for i,(hid,f,val,updated,note) in enumerate(records(T[10][1])):
    sid=f'SB-{i+1:03d}';story.append(dict(storyboard_id=sid,hospital_id=hid,field=f,value=val,updated=updated,note=note))
    add('Storyboard Notes',storyboard_id=sid,hospital_id=hid,guide_field_id=fids[f],field=f,value=val,updated=updated,note=note,source_id='SRC-001',locator='p10',classification='Synthetic example',comparison='Conflict for stroke alerts' if i==0 else 'Agreement')

vfields=[['Video Eval Location'],['LVO Protocol'],['Rounding Orders'],['EEG'],['CT Perfusion'],['LVO Protocol'],['Order Entry','Order Set Name'],['LVO Protocol'],['LVO Protocol'],['Charge Entry'],['Rounding Orders'],['Video Eval Location'],['EEG'],['Pediatric Neurology'],['Order Set Name'],['CT Perfusion'],['When Do We Round?','Rounding Timing'],['Thrombolytic Mix Model'],['Required Note Title'],['Required Note Title']]
vrows=records(T[10][2])+records(T[11][0])
nrows=records(T[11][1])+records(T[12][0])
for i,(vid,hid,q,tm,status,expected) in enumerate(vrows):
    gids='; '.join(fids[f] for f in vfields[i]); refs='; '.join(hid+'-'+fids[f] for f in vfields[i] if any(g['hospital_id']==hid and g['field']==f for g in guides))
    add('Requirements',requirement_id=vid,category='Validation example',statement=q,source_id='SRC-001',locator='p10' if i<4 else 'p11',test_ids=vid,acceptance=expected,coverage='Specified',execution_result='Not run')
    add('Development Scenarios',scenario_id=vid,purpose='Exact supplied validation',hospital_id=hid,guide_rule_ids=refs,guide_field_ids=gids,encounter_context=json.dumps({'local_time':tm,'charge_entered':False if vid=='V10' else 'Unspecified','consult_type':'Stroke' if vid=='V12' else 'Unspecified'}),event_sequence='Ask: '+q,expected_output_id='EO-'+vid,split='Challenge baseline / development',classification='Synthetic example',source_id='SRC-001',oracle_method='Copied from challenge independently of any runtime evaluator',failure_mode='Incorrect hospital grounding, status, time evaluation or missing-data inference')
    add('Expected Outputs',expected_output_id='EO-'+vid,scenario_id=vid,expected_guidance=expected,primary_status=status.title().replace('Time Dependent','Time-dependent').replace('Not In Guide','Not in guide').replace('Hard Stop','Hard stop'),additional_flags='Stale; undefined staffed hours' if vid=='V18' else 'Stale source exists but Friday availability is missing' if vid=='V04' else '',tier='Hard stop' if vid=='V10' else 'On-demand',expected_silence=False,required_citations=hid+' / '+'; '.join(vfields[i])+(' / storyboard SB-001' if vid=='V12' else ''),forbidden_output='Another hospital value; invented schedule; omitted qualification',source_id='SRC-001',oracle_method='Challenge supplied expected wording; semantic comparison preferred',assumptions='V10 assumes charge not entered; context is omitted in table' if vid=='V10' else 'Use source encounter date, not current date',execution_result='Not run')
nfields=[['LVO Protocol'],['LVO Protocol'],['Wake Up Protocol'],['Order Entry','Order Set Name','Thrombolytic','Thrombolytic Mix Model'],['Charge Entry'],['CT Perfusion','AI'],['Consult Completion Rule'],[],['When Do We Round?','Rounding Timing']]
nstatus=['Answered','Time-dependent','Answered','Answered','Hard stop','Answered','Hard stop','None','Time-dependent']
for i,(nid,hid,typ,step,event,tm,expected) in enumerate(nrows):
    reqrefs='; '.join(hid+'-'+fids[f] for f in nfields[i])
    add('Requirements',requirement_id=nid,category='Nudge scenario',statement=f'{typ}; {step}; {event}; {tm}',source_id='SRC-001',locator='p11' if i<6 else 'p12',test_ids=nid,acceptance=expected,coverage='Specified',execution_result='Not run')
    add('Development Scenarios',scenario_id=nid,purpose='Exact supplied nudge',hospital_id=hid,guide_rule_ids=reqrefs,guide_field_ids='; '.join(fids[f] for f in nfields[i]),encounter_context=json.dumps({'consult_type':typ,'caselog_step':step,'local_time':tm,'reference_date':'2026-03-17 assumed for Tue; 2026-03-22 assumed for Sun','charge_entered':False if nid=='N5' else 'Unspecified','plan_confirmed':False if nid=='N7' else 'Unspecified'}),event_sequence=event,expected_output_id='EO-'+nid,split='Challenge baseline / development',classification='Synthetic example',source_id='SRC-001',oracle_method='Copied from challenge; dates and omitted completion state explicitly assumed',failure_mode='Wrong tier, alert fatigue, wrong transfer actor, or premature completion')
    add('Expected Outputs',expected_output_id='EO-'+nid,scenario_id=nid,expected_guidance=expected,primary_status=nstatus[i],additional_flags='',tier=expected.split(':')[0] if ':' in expected else 'None',expected_silence=nid=='N8',required_citations=hid+' / '+'; '.join(nfields[i]) if nfields[i] else 'None; no displayed nudge',forbidden_output='Any nudge' if nid=='N8' else 'EVT activation' if nid=='N2' else 'Order-set name nudge' if nid=='N4' else 'Uncited guidance',source_id='SRC-001',oracle_method='Expected content/tier copied; statuses proposed where scenario table omits them',assumptions='Plan confirmation absent means unresolved; do not assert confirmed' if nid=='N7' else 'N4 supplied expected nudge does not exhaust all TR-06 mapped fields',execution_result='Not run')

requirements=[
('REQ-01','Proactive companion inside caselog is primary deliverable','N1; N2; N3; N4; N5; N6; N7; N8; N9','p1'),
('REQ-02','On-demand free-text answers with source and status','; '.join(x[0] for x in vrows),'pp1,3,12'),
('REQ-03','Every displayed answer/nudge cites hospital and guide field','; '.join(x[0] for x in vrows+nrows if x[0]!='N8'),'p3'),
('REQ-04','Nudges appear within 500ms of triggering field change','PERF-01','p3'),
('REQ-05','Preload guide at encounter opening; no per-field fetch','PERF-02','p3'),
('REQ-06','Guide unavailable: caselog continues; visible guidance-unavailable notice','DEV-FAIL','p3'),
('REQ-07','Guide is read-only to provider interactions','DEV-READONLY','p3'),
('REQ-08','New hospital or field is a data change; unseen live test','HOLD-NEW; HOLD-FIELD','pp3,12'),
('REQ-09','Never use another hospital answer','DEV-SWITCH; HOLD-ISOLATION; V14','pp1,3'),
('REQ-10','Use all encounter context on step moves and field changes','BT-01; BT-11; DEV-TYPE','pp1–2'),
('REQ-11','Evaluate hospital-local day/time and different provider timezone','V06; V09; V16; V17; HOLD-DST','pp1,12'),
('REQ-12','Stale means last verified more than 180 days before encounter','V13; V18; DEV-180; DEV-181','p3'),
('REQ-13','Conflict shows both sources; agreeing storyboard is not conflict','V12; DEV-AGREE','pp3,10'),
('REQ-14','Missing, negative and not applicable remain distinct','V04; V05; V07; V14; V20','pp3,10–11'),
('REQ-15','Undefined hours exposed; no invented window','V08; V18','p3'),
('REQ-16','Six statuses: Answered, Not in guide, Time-dependent, Stale, Conflict, Hard stop','V01; V14; V06; V13; V12; V10','p3'),
('REQ-17','Info on hover/panel, advisory beside field, hard stop blocks attempt','BT-04; BT-05; N5; N7','pp2–3'),
('REQ-18','Justify interruptions and demonstrate appropriate silence','N8; DEV-REPEAT; DEV-NEGATION','p3'),
('REQ-19','Seven synthetic guides default verification 2026-02-02; reference date 2026-03-17','V01; V13; V18','p4'),
('REQ-20','No patient data or production access; all challenge configurations fictional','DATA-BOUNDARY','p12'),
('REQ-21','80+ fields describes full hospital guides; supplied subset does not define caselog schema','SCHEMA-BOUNDARY','p1'),
('REQ-22','Judging dataset supplied later; nuanced unseen data including timezone','HOLD-NEW; HOLD-DST','User clarification')]
for rid,stmt,tests,loc in requirements:add('Requirements',requirement_id=rid,category='Functional / nonfunctional',statement=stmt,source_id='SRC-002' if rid=='REQ-22' else 'SRC-001',locator=loc,test_ids=tests,acceptance=stmt,coverage='Specified; linked tests to be completed in next batch',execution_result='Not run')

(OUT/'hospital_guides_reconstructed.json').write_text(json.dumps({'schema_status':'Unofficial reconstruction, not organizer JSON schema','source_id':'SRC-001','reference_encounter_date':'2026-03-17','hospitals':kb['Synthetic Hospitals'],'fields':guides},indent=2),encoding='utf-8')
(OUT/'storyboard_notes_reconstructed.json').write_text(json.dumps(story,indent=2),encoding='utf-8')
save()
(ROOT/'batch_log.md').write_text('# Research batch log\n\n## Batch 1 — challenge baseline\nSaved all seven guide configurations, exact wording and verification dates; every supplied context row, all 11 triggers, V01–V20 and N1–N9, both storyboard records, tiers/statuses/nonfunctional requirements. ZIP contains PDFs only, so reconstruction schema is unofficial. Highest priority next: establish real information flow and event access, then complete tests for trigger rows absent from N1–N9.\n',encoding='utf-8')
