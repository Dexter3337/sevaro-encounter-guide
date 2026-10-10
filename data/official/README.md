# Supplied Challenge 1 developer-kit files

These six JSON/CSV files were copied without editing from the user's `Sevaro_Rutgers_Health_Hack_Developer_Kit.zip`, under `Challenge_1_Guided_Workflow/data/`, on October 10, 2026. They were not available in the earlier PDF-only research workspace. All content is synthetic.

`hospital_guides.json` contains seven hospitals and 162 field records. Hospital timezones are metadata (`local_timezone`); the PDF reconstruction also represents seven timezone table rows as guide fields. Two PDF values include inline verification annotations that are separate metadata in these files. The underlying values and dates agree.

`storyboard_notes.json` is a separate source and is not automatically merged when importing the hospital file alone. Preserve that distinction when testing conflicts. `validation_set.csv` and `nudge_scenarios.json` are independent reference expectations, not runtime response lookup tables.

`tests/official-kit.test.ts` verifies direct guide import and encounter-envelope replay. The API/transport used by a real host remains outside this dataset contract.
