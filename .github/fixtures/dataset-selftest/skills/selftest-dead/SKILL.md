---
name: selftest-dead
description: Fixture for exercising the dataset-liveness alarm. Not a registry skill — it lives outside skills/ and is never published or validated.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
datasets: [https://selftest.invalid.heurekalabs.co/definitely-not-a-real-dataset.csv]
---
# Dataset liveness self-test fixture

Declares one deliberately unreachable dataset so `check-datasets.js` fails and the
workflow's `notify` job runs. Exists because an alarm nobody has watched fire is not
known to work.

## Try it

Not applicable — this is a fixture, not a skill.
