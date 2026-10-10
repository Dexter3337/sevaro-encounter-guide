# Team publication status

Published 10 October 2026.

- GitHub: https://github.com/Dexter3337/sevaro-encounter-guide
- App: https://dynamic-cat-513c19.netlify.app/
- Presentation: https://dynamic-cat-513c19.netlify.app/presentation.html
- Start contributing: [TEAM_HANDOFF.md](../TEAM_HANDOFF.md)
- Netlify deploy: `6aca7d040f83c27abae6c32d`, published at 1:59 PM Eastern.
- Complete app/research source revision: `b5be83d7b97961c93a9a93a4923a22e689392413`; later publication-evidence commits do not change app behavior.
- GitHub Actions verification for that revision completed successfully (run `38074137515`, 33 seconds).

The GitHub push succeeded under the existing `Dexter3337` sign-in after the cached `DEX-XL` account received a 403. No repository collaborator invitations were issued. Teammates can fork and open pull requests; the owner can separately invite named accounts for direct write access.

All 84 supplied source/research files (12,225,200 bytes) were checked against originals and the committed Git blobs. `.gitattributes` preserves source bytes, including PDFs that Git might otherwise treat as text. Dependencies, caches, generated builds, local credential/configuration files and browser traces are excluded.

The local production build/typecheck passed. The hosted app rendered the N2 outside-coverage LVO guidance and opened the synthetic transcript-review dialog, with no facts selected automatically. `hosted-publication-check.json` records HTTP/content verification. Netlify transforms HTML by inserting its badge/comment and rewriting extensionless links; JavaScript, CSS and the handoff document were checked byte-for-byte.

Netlify currently uses manual deployments. GitHub merges do not automatically update the live site. The site is a synthetic demonstration with browser-local cases, not a shared clinical backend or live transcript connection. See the complete implementation limits in [SEVARO_ALIGNMENT_REVIEW.md](../docs/SEVARO_ALIGNMENT_REVIEW.md).

Publication proof: [GitHub tree](github-team-handoff-pushed.png), [Netlify published status](netlify-team-handoff-deployed.png), [live transcript popup](hosted-team-demo-verified.png).
