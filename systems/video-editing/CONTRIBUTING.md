# Growing the system

Keep changes small and reviewed. Record the reason, upstream revision, licence, changed files, actual commands/results and remaining limits in each pull request. Update STATUS.md and CHANGELOG.md whenever behavior or verification changes.

For each upstream update: inspect the diff and licence first, pin the complete commit, preserve notices, run the mock tests, then exercise the affected runtime with a synthetic or cleared fixture. Never commit fixtures containing private footage. A second reviewer checks changes before release; the founder approves public videos and consequential changes.

Keep downloaded dependencies, weights, sounds, footage, caches, local configuration and credentials outside Git. Add new skills only when a real workflow gap justifies them. Do not promise automatic future updates: a human or agent must perform and verify each update. See ROADMAP.md for proposals.
