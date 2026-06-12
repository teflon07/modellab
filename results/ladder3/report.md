# Benchmark Report — ladder3

Generated: 2026-06-12T17:56:42.047Z  ·  pi 0.78.1

## local

| spec | model | n | pass% | tokens (med) | cost (med) | cost-per-success | turns (med) | tps (med) | wall ms (med) |
|---|---|---|---|---|---|---|---|---|---|
| extract-json | anthropic/claude-fable-5 | 3 | 100% | 711 | 0.0025 | 0.0048 | 1 | 57 | 4548 |
| extract-json | anthropic/claude-opus-4-8 | 3 | 100% | 711 | 0.0041 | 0.0041 | 1 | 74 | 1729 |
| extract-json | anthropic/claude-sonnet-4-6 | 3 | 100% | 511 | 0.0018 | 0.0018 | 1 | 67 | 1589 |
| extract-json | anthropic/claude-haiku-4-5 | 3 | 100% | 627 | 0.0011 | 0.0011 | 1 | 165 | 2392 |
| extract-json | anthropic/claude-haiku-4-5-20251001 | 3 | 100% | 622 | 0.0010 | 0.0011 | 1 | 154 | 1354 |
| extract-json | ollama/qwen3:1.7b | 3 | 100% | 292 | 0.0000 | 0.0000 | 1 | 41 | 5791 |
