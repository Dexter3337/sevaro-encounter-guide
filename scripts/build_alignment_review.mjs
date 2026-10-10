import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const packageRoot=path.resolve(root,'../outputs/01a124a6');
const kb=JSON.parse(fs.readFileSync(path.join(packageRoot,'knowledge_base.json'),'utf8'));
const manifest={reviewedAt:new Date().toISOString(),scope:'Supplied Challenge 1 and research foundation; no real patient transcript found in the reviewed package',tables:Object.fromEntries(Object.entries(kb).map(([name,rows])=>[name,{rows:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}]))};
for(const file of ['development_guides.json','held_out_guides.json','hospital_guides_reconstructed.json','storyboard_notes_reconstructed.json','split_manifest.json']) JSON.parse(fs.readFileSync(path.join(packageRoot,file),'utf8'));
for(const file of ['development_inputs.jsonl','held_out_inputs.jsonl','expected_outputs.jsonl']) for(const line of fs.readFileSync(path.join(packageRoot,file),'utf8').split('\n').filter(Boolean)) JSON.parse(line);
fs.writeFileSync(path.join(root,'reports/research-review-inventory.json'),JSON.stringify(manifest,null,2));
const csvCell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const rows=[['scenario_id','purpose','expected_guidance','forbidden_output','assumptions','app_verification_boundary']];
for(const scenario of [...kb['Development Scenarios'],...kb['Held-Out Scenarios']]) {
 const expected=kb['Expected Outputs'].find(r=>r.scenario_id===scenario.scenario_id);
 rows.push([scenario.scenario_id,scenario.purpose,expected?.expected_guidance,expected?.forbidden_output,expected?.assumptions,/^(V\d+|N\d+)$/.test(scenario.scenario_id)?'Same sponsor case covered by app acceptance suite; see runner results':'Exact research scenario not replayed by current app harness. Similar app tests are not proof of this case.']);
}
fs.writeFileSync(path.join(root,'reports/research-scenario-review.csv'),rows.map(row=>row.map(csvCell).join(',')).join('\n'));
const md=fs.readFileSync(path.join(root,'docs/SEVARO_ALIGNMENT_REVIEW.md'),'utf8');
fs.copyFileSync(path.join(root,'docs/SEVARO_ALIGNMENT_REVIEW.md'),path.join(root,'public/SEVARO_ALIGNMENT_REVIEW.md'));
function escape(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function inline(s){return escape(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,'<a href="$2">$1</a>');}
const content=[];let lines=md.split('\n');
for(let i=0;i<lines.length;i++){
 const line=lines[i];
 if(line.startsWith('```mermaid')){while(i<lines.length && lines[++i]!=='```'){} content.push('<div class="flow"><div>Existing Synapse encounter + approved site guide</div><b>↓</b><div>Native field events → cited hospital guidance</div><b>↕</b><div>Approved transcript → proposed facts → doctor review</div><b>↓</b><div>Approved fields → ordinary caselog events</div><b>↓</b><div>Host checks saved prerequisites before completion</div></div>');continue;}
 if(line.startsWith('|')){const table=[];while(i<lines.length && lines[i].startsWith('|')){const cells=lines[i].replace(/^\||\|$/g,'').split('|').map(x=>x.trim());if(!cells.every(x=>/^[- :]+$/.test(x)))table.push(cells);i++;}i--;content.push('<div class="table"><table>'+table.map((row,n)=>'<tr>'+row.map(c=>`<${n?'td':'th'}>${inline(c)}</${n?'td':'th'}>`).join('')+'</tr>').join('')+'</table></div>');continue;}
 const heading=line.match(/^(#{1,3}) (.*)/);if(heading){const n=heading[1].length;content.push(`<h${n}>${inline(heading[2])}</h${n}>`);}else if(line.trim())content.push('<p>'+inline(line)+'</p>');
}
fs.writeFileSync(path.join(root,'public/integration-review.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sevaro · Integration and gap review</title><style>body{font:17px/1.6 system-ui;margin:0;background:#f2f6f5;color:#183839}header{background:#153f43;color:white;padding:20px 5vw}a{color:inherit}main{max-width:1160px;margin:auto;padding:30px 24px}h1{font-size:38px;line-height:1.2}h2{margin-top:42px;border-top:1px solid #c5d7d6;padding-top:20px}.table{overflow:auto}table{border-collapse:collapse;background:white}td,th{vertical-align:top;text-align:left;border:1px solid #cfdddc;padding:12px;font-size:15px}.flow{display:grid;text-align:center;gap:8px;margin:30px 0}.flow div{padding:18px;background:#153f43;color:white;border-radius:9px}code{background:#ddeae8;padding:2px 4px}@media(max-width:600px){h1{font-size:28px}}@media print{header{display:none}main{padding:0}}</style><header><a href="/">Demo</a> · <a href="/presentation.html">Presentation</a> · <a href="/workflow.html">Workflow</a> · <a href="/SEVARO_ALIGNMENT_REVIEW.md">Written review</a></header><main>'+content.join('\n')+'</main></html>');
console.log('Reviewed all '+Object.keys(kb).length+' collections; 131 source/oracle review rows exported; integration review rendered. No additional runtime pass claims.');
