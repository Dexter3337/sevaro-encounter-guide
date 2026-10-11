"""Validate the four offline text fixtures and their source-grounded test oracle."""
from collections import Counter
from datetime import datetime
from pathlib import Path
import json
import re

DIRECTORY = Path(__file__).resolve().parent
REPOSITORY = DIRECTORY.parent.parent
TURN = re.compile(r"^\[(\d{2}:\d{2})\] ([^:]+): (.+)$")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def elapsed(value):
    minutes, seconds = map(int, value.split(":"))
    require(0 <= seconds < 60, f"Invalid seconds: {value}")
    return minutes * 60 + seconds


def iter_evidence(value):
    if isinstance(value, dict):
        if {"timestamp", "speaker", "quote"}.issubset(value):
            yield value
        for child in value.values():
            yield from iter_evidence(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_evidence(child)


def main():
    manifest = json.loads((DIRECTORY / "answer-key.json").read_text(encoding="utf-8"))
    cases = manifest["cases"]
    require(manifest["synthetic"] is True, "Dataset must be explicitly synthetic")
    require(manifest["case_count"] == len(cases) == 4, "Exactly four cases required")
    require(manifest["application_extraction_tested"] is False, "Do not mislabel oracle as app results")
    require({case["id"] for case in cases} == {"ST01", "ST02", "ST03", "ST04"}, "Unique ST01-ST04 IDs required")
    expected_files = {case["file"] for case in cases}
    require(len(expected_files) == 4, "Unique transcript filenames required")
    actual_files = {path.name for path in DIRECTORY.glob("*.txt")}
    require(actual_files == expected_files, f"Transcript file mismatch: {actual_files ^ expected_files}")
    hospitals = {h["id"]: h for h in json.loads((REPOSITORY / "src/data/seeds.json").read_text(encoding="utf-8"))}
    reports = []
    for case in cases:
        path = DIRECTORY / case["file"]
        require(path.parent == DIRECTORY, "Transcript must stay inside corpus directory")
        text = path.read_text(encoding="utf-8")
        require(text.startswith("SYNTHETIC TEST TRANSCRIPT"), f"Missing synthetic label: {path.name}")
        require(text.count("--- TRANSCRIPT START ---") == text.count("--- TRANSCRIPT END ---") == 1, "One body per transcript required")
        header, rest = text.split("--- TRANSCRIPT START ---")
        body, trailer = rest.split("--- TRANSCRIPT END ---")
        require(not trailer.strip(), "Unexpected text after transcript")
        metadata = dict(line.split(": ", 1) for line in header.splitlines() if ": " in line)
        context = case["context"]
        hospital = hospitals[context["hospital_id"]]
        comparisons = {
            "ID": case["id"],
            "Patient token": "PAT-" + case["id"],
            "Hospital": hospital["id"] + " | " + hospital["name"],
            "Guide version": context["guide_version"],
            "Consult type": context["consult_type"],
            "Encounter type": context["encounter_type"],
            "Encounter start": context["start"],
            "Hospital timezone": context["hospital_timezone"],
            "Consultant timezone": context["consultant_timezone"],
        }
        for key, value in comparisons.items():
            require(metadata.get(key) == value, f"Header mismatch: {case['id']} {key}")
        require(context["guide_version"] == hospital["version"], "Guide version mismatch")
        require(context["hospital_timezone"] == hospital["timezone"], "Hospital timezone mismatch")
        start = datetime.fromisoformat(context["start"])
        require(start.tzinfo is not None, "Encounter instant must have an offset")
        duration = elapsed(metadata["Duration"])
        require(duration == case["duration_seconds"], "Duration mismatch")
        rows = []
        for line in body.splitlines():
            if not line.strip():
                continue
            match = TURN.fullmatch(line)
            require(match is not None, f"Invalid turn in {case['id']}: {line}")
            timestamp, speaker, utterance = match.groups()
            rows.append((elapsed(timestamp), timestamp, speaker, utterance))
        require(rows and rows[0][0] == 0 and rows[-1][0] == duration, "Transcript must span declared duration")
        require(all(a[0] < b[0] for a, b in zip(rows, rows[1:])), "Timestamps must strictly increase")
        counts = Counter(row[2] for row in rows if row[2] != "Event")
        require(set(counts) == set(case["speakers"]), "Speaker manifest mismatch")
        require(counts["Patient"] >= 8 and counts["Consultant"] >= 8, "Patient and consultant need substantive dialogue")
        for speaker in counts:
            require(speaker in metadata["Speakers"], "Undeclared speaker in header")
        lookup = {(row[1], row[2]): row[3] for row in rows}
        evidence_count = 0
        for item in iter_evidence(case):
            require(lookup.get((item["timestamp"], item["speaker"])) == item["quote"], f"Evidence quote mismatch: {case['id']} {item['timestamp']}")
            evidence_count += 1
        source_lookup = {source["id"]: source for source in hospital["fields"]}
        stale = []
        for snapshot in case["guide_evidence"]:
            require(snapshot["hospitalId"] == hospital["id"], "Cross-hospital source leakage")
            source = source_lookup.get(snapshot["id"])
            require(source is not None, "Unknown source ID")
            require(all(source.get(key) == value for key, value in snapshot.items()), f"Source changed: {snapshot['id']}")
            if snapshot.get("lastVerified"):
                age = (start.date() - datetime.fromisoformat(snapshot["lastVerified"]).date()).days
                if age > 180:
                    stale.append({"source_id": snapshot["id"], "age_days": age})
        fields = {source["field"] for source in hospital["fields"]}
        require(all(field not in fields for field in case.get("expected_missing_guide_fields", [])), "Expected missing field exists")
        for correction in case.get("corrections", []):
            require(elapsed(correction["correction_at"]) <= elapsed(correction["confirmed_at"]) <= duration, "Invalid correction order")
            require(correction["final_value"] == case["expected_draft_facts"][correction["field"]]["value"], "Correction/final fact mismatch")
        for checkpoint in case.get("timeline_checkpoints", []):
            instant = datetime.fromisoformat(checkpoint["local_time"])
            require((instant - start).total_seconds() == elapsed(checkpoint["elapsed"]), "Replay clock mismatch")
        facts = case["expected_draft_facts"]
        require(not {"charge_entered", "plan_confirmed"}.intersection(facts), "Administrative gates must not be transcript-autofill candidates")
        require(set(facts).isdisjoint(case["leave_unresolved"]), "Fact cannot be both resolved and unresolved")
        if "last_known_well_time" in facts:
            lkw = datetime.fromisoformat(facts["last_known_well_time"]["value"])
            require(lkw.tzinfo is not None and lkw <= start, "Invalid last-known-well time")
        reports.append({
            "id": case["id"], "file": path.name, "duration_seconds": duration,
            "dialogue_word_count": sum(len(row[3].split()) for row in rows if row[2] != "Event"),
            "speaker_turn_counts": dict(counts), "events": sum(row[2] == "Event" for row in rows),
            "evidence_quotes_checked": evidence_count, "guide_records_checked": len(case["guide_evidence"]),
            "missing_guide_fields_checked": case.get("expected_missing_guide_fields", []),
            "stale_source_ages": stale, "passed": True,
        })
    result = {
        "passed": True, "validation_scope": "Corpus integrity, evidence matching and source grounding only",
        "application_extraction_tested": False, "speech_recognition_tested": False, "latency_measured": False,
        "transcript_count": 4, "total_scripted_duration_seconds": sum(row["duration_seconds"] for row in reports),
        "total_dialogue_words": sum(row["dialogue_word_count"] for row in reports), "cases": reports,
    }
    (DIRECTORY / "validation-results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: 4 transcripts; {result['total_dialogue_words']} dialogue words; exact evidence quotes and guide sources verified.")
    for report in reports:
        print(f"  {report['id']}: {report['dialogue_word_count']} words; {report['evidence_quotes_checked']} quotes; {report['guide_records_checked']} sources")
    print("No app extraction accuracy, speech-recognition accuracy or measured latency is claimed.")


if __name__ == "__main__":
    main()
