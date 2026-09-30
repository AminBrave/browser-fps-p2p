# Testing

The project uses Node's built-in test runner for deterministic simulation and networking tests and keeps browser/Rapier integration behind small seams.

## CI guarantees

The production-hardening branch runs the complete existing suite, the new deterministic networking/combat suite, 100% line/function coverage for the deterministic core modules added in this branch, and a production Vite build. A dedicated network-focused job also runs independently after the main test job.

The coverage target intentionally excludes browser-only presentation and live WebRTC/Rapier integration. Those systems require their real runtime and are validated through integration/manual scenarios rather than pretending a Node unit test is equivalent to Internet gameplay.

## Commands

    npm test
    npm run test:coverage
    npm run test:watch
    npm run build

## Network-condition testing

NetworkSimulator provides deterministic loss, latency, jitter, duplication, reordering, and bandwidth pressure. Use injected random sources in regression tests rather than real Internet timing.

| Profile | RTT | Jitter | Loss |
| --- | ---: | ---: | ---: |
| LAN | 10 ms | 1 ms | 0% |
| Good Internet | 40 ms | 5 ms | 0.1% |
| Average Internet | 80 ms | 15 ms | 0.5% |
| Bad Wi-Fi | 150 ms | 40 ms | 2% |
| Severe | 200 ms | 80 ms | 5% |

## Regression rules

1. Simulation tests use deterministic inputs and clocks.
2. Packet contracts are tested at the byte boundary.
3. Sequence wraparound is tested around 2^32.
4. Prediction/reconciliation tests compare the same simulation tick, never a current state to an older ACK.
5. Lag compensation uses historical hitboxes rather than rewinding the complete physics world.
6. Browser/WebRTC/Rapier tests remain isolated from pure unit tests.
7. Every networking regression gets a deterministic network-condition test.

## Coverage policy

Coverage is a quality gate, not a vanity metric. New deterministic core code must reach 100% line/function coverage in CI. Branch coverage remains a separate engineering metric because branch-heavy browser integration code is better validated with scenario tests than synthetic test inflation.
