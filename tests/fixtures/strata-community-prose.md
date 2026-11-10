# Community benchmarks（上游 COMMUNITY.md 片段：格子里写的是说明而不是数字）

| Report | Hardware | Model | Prompt tok/s (4K / 32K / 128K) | Decode tok/s (4K / 32K / 128K) | Engine | Ref |
|---|---|---|---|---|---|---|
| [2026-10-05-community-rtx-4070-ti-super](2026-10-05-community-rtx-4070-ti-super/) | RTX 4070 Ti SUPER 16 GB, Ryzen 7 9800X3D | IQ2_XS / IQ3_XXS | cold prefill in README (about 2,500 at 32K-256K) | IQ2_XS 97.9 / 94.3 / 90.0 / 82.4; IQ3_XXS 76 / 71 / 70 / 56 (32K / 64K / 128K / 256K) | 0.1.39 (6f32ec0) | #995 |
| [2026-10-11-community-rtx-5090-9800x3d](2026-10-11-community-rtx-5090-9800x3d/) | RTX 5090 32 GB, Ryzen 7 9800X3D | Swift IQ3_XXS, 1M YaRN | 6,687 / 6,426 (32K / 131K, greedy, n=2) | 198.9 / 190.6 (same runs); native 1M disk restore 6.107 s | modified local build (provenance.json) | #1476 |
