# Persival

A benchmark framework for evaluating cross-session memory injection attacks (MINJA-style) across three architecturally distinct memory systems: **Mem0** (flat vector-based), **MemGPT** (hierarchical agentic), and **MemOS** (OS-level, multi-substrate).

This is the codebase for an MSc dissertation project at UCL, supervised by Dr. Philip Treleaven.

## Overview

Persival extends [AgentSeer](https://huggingface.co/spaces/holistic-ai/agentseer)'s action/component-graph observability framework with memory-specific schema fields and cross-session tracing, enabling systematic security evaluation of persistent agent memory across architectures. The project uses [OpenClaw](https://github.com/openclaw) as a unified agent platform with pluggable memory backends.

The work is structured as three sequentially dependent experiments:

1. **Observability layer extension** — extends AgentSeer's schema with memory-specific fields, a unified memory-operation taxonomy, and cross-session graph linking.
2. **Threat model and attack evaluation** — applies MINJA-style indirect memory injection (indication prompts + Progressive Shortening Strategy) across all three memory architectures.
3. **Comparative analysis and benchmarking** — cross-architecture comparison using ISR, ASR, persistence rate, utility drop, and detection rate.

## Repository structure

```
persival/
├── agentseer/              # AgentSeer frontend source (Holistic AI), copied for reference
│                            # — see agentseer/README.md for attribution and commit hash
├── schema/                 # Extended observability schema definitions (Experiment 1)
├── adapter/                # Instrumentation layer / JSONL trace emitter (Experiment 1)
├── experiments/
│   ├── exp1_observability/ # Schema validation, trace collection
│   ├── exp2_attack/        # Attack scripts, injection runs, raw traces
│   └── exp3_benchmark/     # Comparative analysis, metric computation
├── data/                   # Trace outputs (JSONL)
└── README.md
```

## Status

Early stage — repository scaffolding in place, Experiment 1 (observability schema extension) in progress.

## Acknowledgements

This project builds on [AgentSeer](https://huggingface.co/spaces/holistic-ai/agentseer), developed by Holistic AI, used with permission. See `agentseer/README.md` for details.

## License

MIT — see [LICENSE](LICENSE). Note: the `agentseer/` subfolder contains third-party code and is not covered by this license; see attribution notes within that folder.