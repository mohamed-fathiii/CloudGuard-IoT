# M4 ML anomaly detection (independent module)

Isolation Forest over 9 numeric features derived from normalized IoT event windows.
This package does **not** import or modify the TypeScript rules engine.

## Setup

```powershell
python -m pip install -r ai/requirements.txt
```

## Train and evaluate

```powershell
cd ai
python -m unittest discover -s tests -v
python -m ml.evaluate
```

`python -m ml.evaluate` generates train/validation/test synthetic datasets with
independent seeds, selects `contamination` on validation F1, trains on normal windows
only, writes `ai/artifacts/model.joblib` (gitignored), and prints actual metrics as
JSON. No model artifact is committed.

Latest run (seed 20261121): precision 0.9053, recall 0.9556, F1 0.9297, FPR 0.1200,
confusion matrix TN=132 FP=18 FN=8 TP=172. Synthetic data only — not production evidence.

## Inference

```powershell
# Inline JSON (from PowerShell, use a file via @path if quoting is awkward)
python predict.py --features @sample.json
# or pipe JSON on stdin (local terminals)
Get-Content sample.json | python predict.py
```

`predict()` returns `anomaly`, `anomalyScore` (raw score, not a probability),
`modelVersion`, `schemaVersion`, `predictedAt`, `features`, and top feature deviations.

## Integration

The TypeScript side calls an injected inference function through
`OptionalAiDetector` (disabled by default). `src/scripts/m4-ai-demo.ts` demonstrates
a bounded subprocess bridge to `predict.py`. See `docs/m4/M4-IMPLEMENTATION.md` for
the hybrid risk policy and limitations.
