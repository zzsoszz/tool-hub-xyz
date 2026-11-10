# Community benchmarks

| Report | Hardware | Model | Prompt tok/s (4K / 32K / 128K) | Decode tok/s (4K / 32K / 128K) | Engine | Ref |
|---|---|---|---|---|---|---|
| [2026-10-01-community-2x-rtx-pro-4500](2026-10-01-community-2x-rtx-pro-4500/) | 2x RTX PRO 4500 32 GB, Threadripper 7960X | Swift IQ3_XXS | 1,428 / 2,454 / 2,785 | 115 / 120 / 93 | 0.1.30 | #418 |
| [2026-10-02-community-2x-rtx-pro-4500-engine-0.1.36](2026-10-02-community-2x-rtx-pro-4500-engine-0.1.36/) | 2x RTX PRO 4500 32 GB, Threadripper 7960X | Swift IQ3_XXS | 2,960 / 5,065 / 5,762 | 127 / 130 / 105 | 0.1.36 | #418 |

Notes: some rows keep several quantizations in one cell; the report README lists them.

| Report | Hardware | Model | Prompt tok/s (4K / 32K / 128K) | Decode tok/s (4K / 32K / 128K) | Engine | Ref |
|---|---|---|---|---|---|---|
| [2026-10-01-community-rtx-pro-4500](2026-10-01-community-rtx-pro-4500/) | RTX PRO 4500 32 GB, Threadripper PRO 3975WX | UD-Q4_K_XL / UD-IQ4_XS / IQ3_S | see README | UD-Q4_K_XL 61.5 / 72.1 / 70.2; UD-IQ4_XS 82.0 / 95.8 / 91.4; IQ3_S 106 / 120 / 117 (2.7K / 64K / 128K) | 0.1.31 | #417 |
| [2026-10-01-ctx-ladder](2026-10-01-ctx-ladder/) | RTX 4070 Ti SUPER 16 GB (docker) | IQ2_XS | 167 / 128 / 133 (SSE prefill, 32K / 64K / 128K) | 97 / 84 / 74 (32K / 64K / 128K, KV q4_0 at 128K) | see README | #995 |
| [2026-10-01-community-2x-titan-rtx](2026-10-01-community-2x-titan-rtx/) | 2x TITAN RTX 24 GB (NVLink), Xeon E5-2696 v4 | IQ3_S, 262K | 865 / 1,612 / 1,785 | 68 / 60 / 62 | 0.1.31 | #389 |
