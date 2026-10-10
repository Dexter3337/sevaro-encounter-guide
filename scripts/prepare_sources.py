"""Inspect/deduplicate user archive; independently verify research seed against PDF tables."""
from pathlib import Path
import json, hashlib, zipfile, re
import pdfplumber
root = Path(__file__).resolve().parents[2]
app = root / 'encounter-guide'
raw = app / 'data/raw'
raw.mkdir(parents=True, exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
archive = []
with zipfile.ZipFile(root/'Sevaro Track.zip') as z:
    for e in z.infolist():
        p = Path(e.filename)
        if p.is_absolute() or '..' in p.parts or ':' in e.filename or p.suffix.lower() not in ['.pdf','.json','.csv']:
            raise ValueError('Unsafe archive entry: '+e.filename)
        b=z.read(e)
        existing=root/'research/source_material'/p
        same=existing.exists() and sha(existing.read_bytes())==sha(b)
        archive.append({'entry':e.filename,'sha256':sha(b),'deduplicated':same})
        if not same: (raw/p.name).write_bytes(b)
src=root/'research/source_material/Sevaro/Sevaro_Rutgers_Health_Hack_Challenge_1_Guided_Workflow_v2.pdf'
seed=json.loads((root/'outputs/01a124a6/hospital_guides_reconstructed.json').read_text(encoding='utf-8'))
story=json.loads((root/'outputs/01a124a6/storyboard_notes_reconstructed.json').read_text(encoding='utf-8'))
with pdfplumber.open(src) as pdf:
    rows={}
    for page in pdf.pages[3:10]:
        for table in page.extract_tables():
            if table and table[0][0]=='Guide Field':
                for row in table[1:]:
                    if row[0]: rows[(page.page_number,row[0].replace('\n',' '))]=re.sub(r'\s+',' ',row[1]).strip()
    errors=[]
    for f in seed['fields']:
        actual=rows.get((f['page'],f['field']))
        if actual != re.sub(r'\s+',' ',f['original_value']).strip(): errors.append({'field':f['field'],'page':f['page'],'pdf':actual,'seed':f['original_value']})
    if len(rows)!=len(seed['fields']): errors.append({'pdf_count':len(rows),'seed_count':len(seed['fields'])})
    if errors: raise ValueError(json.dumps(errors,indent=2))
hospital=[]
for h in seed['hospitals']:
    fs=[f for f in seed['fields'] if f['hospital_id']==h['hospital_id']]
    fields=[dict(id=f"{h['hospital_id']}:guide:{i}",hospitalId=h['hospital_id'],field=f['field'],raw=f['original_value'],lastVerified=f['last_verified'],sourceKind='guide',sourceName=src.name,version='Challenge v2',locator=f"PDF p{f['page']} · {f['field']}") for i,f in enumerate(fs)]
    for s in story:
        if s['hospital_id']==h['hospital_id']:
            fields.append(dict(id=s['storyboard_id'],hospitalId=h['hospital_id'],field=s['field'],raw=s['value'],updatedAt=s['updated'],sourceKind='storyboard',sourceName=src.name,version='Challenge v2',locator='PDF p10 · storyboard'))
    hospital.append(dict(id=h['hospital_id'],name=h['name'],timezone=re.search(r'\((.*?)\)',h['timezone'])[1],version='Challenge v2',fields=fields))
(app/'src/data').mkdir(parents=True,exist_ok=True)
(app/'src/data/seeds.json').write_text(json.dumps(hospital,indent=2),encoding='utf-8')
(raw/'hospital_guides.json').write_text(json.dumps(seed,indent=2),encoding='utf-8')
(raw/'storyboard_notes.json').write_text(json.dumps(story,indent=2),encoding='utf-8')
report=dict(archive=archive,pdf_sha256=sha(src.read_bytes()),pdf_rows=len(rows),seed_rows=len(seed['fields']),mismatches=errors,counts={h['id']:len([f for f in h['fields'] if f['sourceKind']=='guide']) for h in hospital},notes=['Unofficial reconstruction verified against all extracted PDF table rows.','N scenarios use inferred dates: Tue 2026-03-17; Sun 2026-03-22.','Guide default verification date applies only to sponsor seed. Storyboard updated date is distinct.'])
(raw/'seed_provenance.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))

