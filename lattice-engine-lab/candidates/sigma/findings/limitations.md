# Limitations

- WebGL support and hardware acceleration vary by workstation.
- Stress behavior must be measured on the target office hardware and is not guaranteed.
- ForceAtlas2 worker execution is guarded to 12,000 entities in this spike.
- GPU memory is not claimed because it is not reliably measurable here.
- Communities and PageRank are analytical signals, not engineering truth.
- Rich engineering detail remains outside WebGL nodes.
- Automated heap, context-loss, and worker-leak tests are not yet available.
- The synthetic scale generator emphasizes entity count more than real enterprise topology complexity.
