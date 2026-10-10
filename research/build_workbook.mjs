import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out='C:/Users/rohit/Sevaro/outputs/01a124a6';
const data=JSON.parse(await fs.readFile(`${out}/knowledge_base.json`,'utf8'));
const wb=Workbook.create();
const order=['Coverage','Requirements','Implementation Priorities','System Integration','Workflow Timing','Guide Fields','Caselog Fields','Rule Families','Field–Rule Map','Adaptive Interpretation','Answer Policy','Guardrails','Development Scenarios','Held-Out Scenarios','Expected Outputs','Synthetic Hospitals','Synthetic Rules','Storyboard Notes','Public Examples','Sources','Event Metadata','Unknowns and Decisions','Trace Links'];
const overview=wb.worksheets.add('Overview');
for(const name of order)wb.worksheets.add(name);
const lengths={};
function col(n){let r='';for(n++;n>0;n=Math.floor((n-1)/26))r=String.fromCharCode(65+(n-1)%26)+r;return r;}
let index=0;
for(const name of order){
 const rows=data[name]; const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const sh=wb.worksheets.getItem(name); sh.showGridLines=false;
 const dateCols=keys.map((k,i)=>['last_verified','updated','access_date'].includes(k)?i:-1).filter(i=>i>=0);
 const matrix=[keys.map(k=>k.replaceAll('_',' ')),...rows.map(r=>keys.map((k,i)=>{const v=r[k]??null;return dateCols.includes(i)&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(`${v}T00:00:00Z`):v;}))];
 const used=sh.getRange(`A1:${col(keys.length-1)}${matrix.length}`);used.values=matrix;
 used.format.font={name:'Arial',size:10,color:'#233044'}; used.format.verticalAlignment='top';used.format.wrapText=true;
 const widths=keys.map((k,i)=>{
   const longest=Math.max(k.length,...rows.map(r=>String(r[k]??'').length));
   return /(?:id|ids)$/.test(k)?(longest>80?66:24):/url|original_wording|observed_values|encounter_context|event_sequence|expected_guidance|statement/.test(k)?72:longest>150?66:longest>70?48:longest>35?38:26;
 });
 keys.forEach((k,i)=>{sh.getRange(`${col(i)}1:${col(i)}${matrix.length}`).format.columnWidth=widths[i];});
 sh.getRange(`A1:${col(keys.length-1)}1`).format={fill:'#233A59',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,verticalAlignment:'center',horizontalAlignment:'center',rowHeight:32};
 rows.forEach((r,j)=>{
   const lineCount=Math.max(...keys.map((k,i)=>String(r[k]??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(widths[i]*0.82))),0)));
   sh.getRange(`A${j+2}:${col(keys.length-1)}${j+2}`).format.rowHeight=Math.min(409,Math.max(32,16*lineCount+12));
 });
 dateCols.forEach(i=>sh.getRange(`${col(i)}2:${col(i)}${matrix.length}`).setNumberFormat('yyyy-mm-dd'));
 sh.freezePanes.freezeRows(1);sh.freezePanes.freezeColumns(1);
 const table=sh.tables.add(`A1:${col(keys.length-1)}${matrix.length}`,true,`FoundationTable${index++}`);table.showFilterButton=true;
 lengths[name]={rows:rows.length,cols:keys.length,keys};
 // Source URLs remain literal, preserving exact addresses without unsupported formulas.
}

overview.showGridLines=false;overview.tabColor='#233A59';
overview.getRange('A2').values=[['Sevaro Challenge 1 research foundation']];overview.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:'#233A59'};
overview.getRange('A4:D4').values=[['Inventory','Records','Interpretation','Open next']];
const summary=[
['Guide concepts','Guide Fields','Every distinct supplied guide field is retained','Validate grammar and interpretation'],
['Supplied and additional hospital configurations','Synthetic Hospitals','Seven source sites plus seven new fictional sites','No current real-site protocol authority'],
['Hospital-field source and synthetic rule records','Synthetic Rules','169 source records plus 119 new fictional records','Draft normalization requires validation'],
['Requirement records','Requirements','Triggers, V/N examples, functionality and clarification','All linked; runtime not run'],
['Development scenarios','Development Scenarios','Source fixtures and development boundaries/failures','Execute on companion'],
['Held-out scenarios','Held-Out Scenarios','Frozen unfamiliar hospitals, wording and event sequences','Keep oracles away from evaluator'],
['Expected outcome records','Expected Outputs','Manually specified independently of runtime','Independent clinician adjudication pending'],
['Source records','Sources','18 external primary sources, 2 supplied and 1 design source','Historical and scope limitations retained'],
['Public workflow examples','Public Examples','Bounded local evidence, separate from fictional rules','No US-wide coverage claim'],
['Normalized trace links','Trace Links','One relationship per row','Follow requirement to test to oracle'],
['Unresolved decisions','Unknowns and Decisions','Architecture, organizer semantics and production dependencies','Owners and next validation steps listed']
];
summary.forEach((r,i)=>{overview.getRange(`A${i+5}:D${i+5}`).values=[[r[0],null,r[2],r[3]]];overview.getRange(`B${i+5}`).formulas=[[`=COUNTA('${r[1]}'!A2:A${lengths[r[1]].rows+1})`]];});
overview.getRange('A18:D22').values=[
 ['Use','Open a requirement ID, follow its test ID, then the matching expected-output ID.',null,null],
 ['Coverage boundary','Specification links only. No companion pass, latency, clinical-safety or production-readiness claim.',null,null],
 ['Data boundary','All hospital fixtures are fictional. Reconstructed JSON and schemas are unofficial.',null,null],
 ['Reference timing','Baseline encounter date: 2026-03-17. Research access date: 2026-10-10.',null,null],
 ['Next build','Preload guide, receive event, evaluate supported rule, render cited nudge or silence, check completion.',null,null]
];
overview.getRange('A4:D22').format.font={name:'Arial',size:10,color:'#233044'};overview.getRange('A4:D22').format.wrapText=true;overview.getRange('A4:D22').format.verticalAlignment='top';
overview.getRange('A4:D4').format={fill:'#233A59',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:30};
overview.getRange('A4:A22').format.columnWidth=44;overview.getRange('B4:B22').format.columnWidth=19;overview.getRange('C4:D22').format.columnWidth=58;
overview.getRange('A5:D15').format.rowHeight=34;
overview.getRange('B18:D22').merge(true);overview.getRange('A18:D22').format.rowHeight=36;
overview.getRange('B5:B15').setNumberFormat('#,##0');
wb.recalculate();
const metrics=await wb.inspect({kind:'table',range:'Overview!A4:D15',include:'values,formulas',tableMaxRows:12,tableMaxCols:4,maxChars:5000});
await fs.writeFile(`${out}/workbook_inspection.jsonl`,metrics.ndjson);
const errs=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},maxChars:2000});
await fs.writeFile(`${out}/workbook_error_scan.jsonl`,errs.ndjson);
const xf=await SpreadsheetFile.exportXlsx(wb);await xf.save(`${out}/Sevaro_Challenge_1_Foundation.xlsx`);
await fs.mkdir(`${out}/previews`,{recursive:true});
for(const name of ['Overview',...order]){
 const range=name==='Overview'?'A2:D22':`A1:${col(Math.min(lengths[name].cols,4)-1)}${Math.min(lengths[name].rows+1,4)}`;
 try{const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(`${out}/previews/${name.replaceAll(' ','_')}.png`,new Uint8Array(await blob.arrayBuffer()));}
 catch(e){console.log(`Render unavailable for ${name}: ${e.message}`);}
 console.log(`Saved and rendered ${name}`);
}
console.log(JSON.stringify({xlsx:`${out}/Sevaro_Challenge_1_Foundation.xlsx`,sheets:order.length+1,formulaErrors:errs.ndjson,counts:lengths},null,2));
